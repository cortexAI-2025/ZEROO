-- Le SIRET n'apparaît plus dans l'annuaire public.
--
-- Constat avant correction :
--  * search_pro_directory renvoyait « siret » et « source_url » (dont l'adresse contient le SIRET) ;
--  * la table directory_businesses était lisible en direct par anon et authenticated (siret, legal_name,
--    source_url) via l'API REST ;
--  * la recherche acceptait un SIRET.
-- Le SIRET reste enregistré : dans directory_businesses (usage interne, rapprochement avec les comptes),
-- dans merchants.siret (saisi à l'inscription du professionnel) et dans directory_claims (demande de
-- revendication, lue par son auteur et par les administrateurs).

-- Identifiant public opaque : remplace le SIRET dans l'annuaire et dans les demandes de revendication.
alter table public.directory_businesses add column public_id uuid not null default gen_random_uuid();
create unique index directory_businesses_public_id_key on public.directory_businesses (public_id);

-- Plus aucune lecture directe de la table par l'API : seules les fonctions ci-dessous exposent
-- des champs choisis. Les fonctions SECURITY DEFINER (administration, revendications) ne sont pas concernées.
revoke select on public.directory_businesses from anon, authenticated;

-- Recherche publique : ni SIRET, ni lien source (son adresse contient le SIRET), ni recherche par SIRET.
-- SECURITY DEFINER pour lire la table désormais fermée ; le résultat est limité aux champs ci-dessous.
create or replace function public.search_pro_directory(p_query text default '',p_city text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total bigint; rows jsonb; query text:=lower(extensions.unaccent(btrim(coalesce(p_query,''))));
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or length(query)>160 or length(coalesce(p_city,''))>100 then raise exception 'Recherche invalide' using errcode='22023';end if;
 select count(*) into total from public.directory_businesses d where d.is_listed
 and (coalesce(p_city,'')='' or d.city=p_city)
 and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code))) like '%'||query||'%');
 select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
  select d.public_id as id,d.display_name,d.address_line,d.postal_code,d.city,d.source_checked_on,
   d.linked_merchant_id is not null as is_claimed,
   coalesce(d.mini_site_path,(select 'https://app.zeeroo.fr/m/'||m.slug from public.merchants m where m.id=d.linked_merchant_id and m.siret=d.siret and m.is_published and public.has_minisite(m) limit 1)) as mini_site_url
  from public.directory_businesses d where d.is_listed and (coalesce(p_city,'')='' or d.city=p_city)
   and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code))) like '%'||query||'%')
  order by d.city,d.display_name,d.public_id limit 25 offset p_offset
 ) x;
 return jsonb_build_object('rows',rows,'total',total,'page_size',25);
end;$$;

create or replace function public.pro_directory_cities() returns table(city text) language sql stable security definer set search_path='' as $$
 select distinct d.city from public.directory_businesses d where d.is_listed order by d.city;
$$;

-- Revendication : le professionnel désigne l'établissement par son identifiant public, jamais par un SIRET
-- affiché. Le SIRET est retrouvé côté serveur ; il reste visible des administrateurs dans la file de revue.
drop function public.request_directory_claim(text,text,text,text);
drop function admin_private.request_directory_claim(text,text,text,text);

create function admin_private.request_directory_claim(p_directory_id uuid,p_capacity text,p_note text,p_phone text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();mail text;claim_id uuid;v_siret text;
begin
 if uid is null then raise exception 'Connectez-vous pour revendiquer un établissement' using errcode='42501';end if;
 select email into mail from auth.users where id=uid and email_confirmed_at is not null;
 if mail is null then raise exception 'Confirmez votre adresse e-mail avant de continuer' using errcode='42501';end if;
 select siret into v_siret from public.directory_businesses where public_id=p_directory_id and is_listed;
 if v_siret is null then raise exception 'Établissement introuvable' using errcode='P0002';end if;
 if p_capacity is null or length(btrim(p_capacity)) not between 3 and 100 or p_note is null or length(btrim(p_note)) not between 20 and 2000 or length(coalesce(p_phone,''))>30 then raise exception 'Complétez votre fonction et les éléments de vérification' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('directory-claim:'||uid::text,0));
 select id into claim_id from public.directory_claims where siret=v_siret and claimant_user_id=uid and status='pending';
 if claim_id is not null then return claim_id;end if;
 if exists(select 1 from public.directory_claims where siret=v_siret and status='accepted') then raise exception 'Cet établissement est déjà revendiqué ; contactez le support' using errcode='22023';end if;
 if (select count(*) from public.directory_claims where claimant_user_id=uid and created_at>now()-interval '24 hours')>=5 then raise exception 'Limite de demandes atteinte ; contactez le support' using errcode='22023';end if;
 insert into public.directory_claims(siret,claimant_user_id,contact_email,contact_phone,capacity,evidence_note)
 values(v_siret,uid,mail,nullif(btrim(p_phone),''),btrim(p_capacity),btrim(p_note)) returning id into claim_id;
 return claim_id;
end;$$;
revoke all on function admin_private.request_directory_claim(uuid,text,text,text) from public,anon;
grant execute on function admin_private.request_directory_claim(uuid,text,text,text) to authenticated;
create function public.request_directory_claim(p_directory_id uuid,p_capacity text,p_note text,p_phone text default null)
returns uuid language sql security invoker set search_path='' as $$select admin_private.request_directory_claim(p_directory_id,p_capacity,p_note,p_phone);$$;
revoke all on function public.request_directory_claim(uuid,text,text,text) from public,anon;
grant execute on function public.request_directory_claim(uuid,text,text,text) to authenticated;
