-- Public references are separate from transactional/affiliated merchants.
create table public.directory_businesses (
 siret text primary key check(siret ~ '^[0-9]{14}$'),
 display_name text not null check(length(display_name) between 1 and 250),legal_name text not null,
 naf_code text not null check(naf_code='56.10C'),administrative_status text not null check(administrative_status='A'),
 address_line text not null,postal_code text not null check(postal_code ~ '^[0-9]{5}$'),city text not null,department text not null,
 latitude double precision check(latitude between -90 and 90),longitude double precision check(longitude between -180 and 180),
 source_url text not null,source_checked_on date not null,source_sha256 text not null,
 mini_site_path text check(mini_site_path is null or mini_site_path ~ '^/[a-z0-9][a-z0-9/-]*/$'),
 linked_merchant_id uuid references public.merchants(id),is_listed boolean not null default true,
 imported_at timestamptz not null default now()
);
create index directory_businesses_city_name_idx on public.directory_businesses(city,display_name,siret);
alter table public.directory_businesses enable row level security;
revoke all on public.directory_businesses from public,anon,authenticated;
grant select on public.directory_businesses to anon,authenticated;
create policy "listed directory references" on public.directory_businesses for select to anon,authenticated using(is_listed);

create table public.directory_claims (
 id uuid primary key default gen_random_uuid(),siret text not null references public.directory_businesses(siret),
 claimant_user_id uuid not null references public.profiles(id) on delete cascade,
 contact_email text not null,contact_phone text check(length(contact_phone)<=30),
 capacity text not null check(length(capacity) between 3 and 100),evidence_note text not null check(length(evidence_note) between 20 and 2000),
 status text not null default 'pending' check(status in('pending','accepted','rejected')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),review_note text check(length(review_note)<=2000)
);
create unique index directory_claims_one_pending_per_user on public.directory_claims(siret,claimant_user_id) where status='pending';
create unique index directory_claims_one_accepted on public.directory_claims(siret) where status='accepted';
create index directory_claims_user_date_idx on public.directory_claims(claimant_user_id,created_at desc);
alter table public.directory_claims enable row level security;
revoke all on public.directory_claims from public,anon,authenticated;
grant select on public.directory_claims to authenticated;
create policy "claimant reads own claims" on public.directory_claims for select to authenticated using(claimant_user_id=(select auth.uid()));
create policy "admins read claims" on public.directory_claims for select to authenticated using((select public.is_platform_admin()));

create function public.search_pro_directory(p_query text default '',p_city text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare total bigint; rows jsonb; query text:=lower(extensions.unaccent(btrim(coalesce(p_query,''))));
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or length(query)>160 or length(coalesce(p_city,''))>100 then raise exception 'Recherche invalide' using errcode='22023';end if;
 select count(*) into total from public.directory_businesses d where d.is_listed
 and (coalesce(p_city,'')='' or d.city=p_city)
 and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code,d.siret))) like '%'||query||'%');
 select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
  select d.siret,d.display_name,d.address_line,d.postal_code,d.city,d.source_url,d.source_checked_on,
   d.linked_merchant_id is not null as is_claimed,
   coalesce(d.mini_site_path,(select 'https://app.zeeroo.fr/m/'||m.slug from public.merchants m where m.siret=d.siret and m.is_published and public.has_minisite(m) limit 1)) as mini_site_url
  from public.directory_businesses d where d.is_listed and (coalesce(p_city,'')='' or d.city=p_city)
   and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code,d.siret))) like '%'||query||'%')
  order by d.city,d.display_name,d.siret limit 25 offset p_offset
 ) x;
 return jsonb_build_object('rows',rows,'total',total,'page_size',25);
end;$$;
revoke all on function public.search_pro_directory(text,text,int) from public;
grant execute on function public.search_pro_directory(text,text,int) to anon,authenticated;
create function public.pro_directory_cities() returns table(city text) language sql stable security invoker set search_path='' as $$
 select distinct d.city from public.directory_businesses d where d.is_listed order by d.city;
$$;
revoke all on function public.pro_directory_cities() from public;
grant execute on function public.pro_directory_cities() to anon,authenticated;

create function admin_private.request_directory_claim(p_siret text,p_capacity text,p_note text,p_phone text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();mail text;claim_id uuid;
begin
 if uid is null then raise exception 'Connectez-vous pour revendiquer un établissement' using errcode='42501';end if;
 select email into mail from auth.users where id=uid and email_confirmed_at is not null;
 if mail is null then raise exception 'Confirmez votre adresse e-mail avant de continuer' using errcode='42501';end if;
 if not exists(select 1 from public.directory_businesses where siret=p_siret and is_listed) then raise exception 'Établissement introuvable' using errcode='P0002';end if;
 if p_capacity is null or length(btrim(p_capacity)) not between 3 and 100 or p_note is null or length(btrim(p_note)) not between 20 and 2000 or length(coalesce(p_phone,''))>30 then raise exception 'Complétez votre fonction et les éléments de vérification' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('directory-claim:'||uid::text,0));
 select id into claim_id from public.directory_claims where siret=p_siret and claimant_user_id=uid and status='pending';
 if claim_id is not null then return claim_id;end if;
 if exists(select 1 from public.directory_claims where siret=p_siret and status='accepted') then raise exception 'Cet établissement est déjà revendiqué ; contactez le support' using errcode='22023';end if;
 if (select count(*) from public.directory_claims where claimant_user_id=uid and created_at>now()-interval '24 hours')>=5 then raise exception 'Limite de demandes atteinte ; contactez le support' using errcode='22023';end if;
 insert into public.directory_claims(siret,claimant_user_id,contact_email,contact_phone,capacity,evidence_note)
 values(p_siret,uid,mail,nullif(btrim(p_phone),''),btrim(p_capacity),btrim(p_note)) returning id into claim_id;
 return claim_id;
end;$$;
revoke all on function admin_private.request_directory_claim(text,text,text,text) from public,anon;
grant execute on function admin_private.request_directory_claim(text,text,text,text) to authenticated;
create function public.request_directory_claim(p_siret text,p_capacity text,p_note text,p_phone text default null)
returns uuid language sql security invoker set search_path='' as $$select admin_private.request_directory_claim(p_siret,p_capacity,p_note,p_phone);$$;
revoke all on function public.request_directory_claim(text,text,text,text) from public,anon;
grant execute on function public.request_directory_claim(text,text,text,text) to authenticated;

-- A request never grants ownership, creates a mini-site or starts a subscription.
-- Staff approval requires a matching, existing merchant belonging to the claimant.
create function admin_private.review_directory_claim(p_claim_id uuid,p_decision text,p_note text,p_merchant_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare c public.directory_claims;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'admin_required' using errcode='42501';end if;
 if p_decision is null or p_decision not in('accepted','rejected') or p_note is null or length(btrim(p_note)) not between 10 and 2000 then raise exception 'Décision et justification requises' using errcode='22023';end if;
 select * into c from public.directory_claims where id=p_claim_id for update;
 if not found or c.status<>'pending' then raise exception 'Demande absente ou déjà traitée' using errcode='22023';end if;
 if p_decision='accepted' then
  if not exists(select 1 from public.merchants m where m.id=p_merchant_id and m.owner_id=c.claimant_user_id and m.siret=c.siret) then raise exception 'Le compte professionnel et le SIRET doivent correspondre' using errcode='22023';end if;
  update public.directory_businesses set linked_merchant_id=p_merchant_id where siret=c.siret;
 end if;
 update public.directory_claims set status=p_decision,review_note=btrim(p_note),reviewed_by=auth.uid(),updated_at=now() where id=c.id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'review_directory_claim','directory_claim',c.id::text,jsonb_build_object('decision',p_decision,'reason',p_note,'siret',c.siret));
end;$$;
revoke all on function admin_private.review_directory_claim(uuid,text,text,uuid) from public,anon;
grant execute on function admin_private.review_directory_claim(uuid,text,text,uuid) to authenticated;
create function public.review_directory_claim(p_claim_id uuid,p_decision text,p_note text,p_merchant_id uuid default null)
returns void language sql security invoker set search_path='' as $$select admin_private.review_directory_claim(p_claim_id,p_decision,p_note,p_merchant_id);$$;
revoke all on function public.review_directory_claim(uuid,text,text,uuid) from public,anon;
grant execute on function public.review_directory_claim(uuid,text,text,uuid) to authenticated;
