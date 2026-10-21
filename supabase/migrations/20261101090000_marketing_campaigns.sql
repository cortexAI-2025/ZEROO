-- Campagne marketing mensuelle des établissements Pro (une seule fonctionnalité, pas de facturation en plus).
--
-- Principe : la campagne est contractuelle **après le premier paiement** de l'abonnement Pro (jamais pendant
-- l'essai gratuit). À chaque échéance mensuelle suivante (date anniversaire du premier paiement), un
-- établissement Pro dont l'abonnement est actif et qui a donné son accord reçoit une campagne en file d'attente :
-- une publication promotionnelle sur les réseaux officiels de ZeeRoo. **Validation humaine obligatoire** : une
-- personne de l'administration relit le texte, choisit le jour (3 établissements au plus par jour), puis
-- enregistre le résultat de chaque publication. Rien ne peut être programmé ni publié sans cette validation
-- (contrainte en base : `reviewed_by` obligatoire dès que la campagne est programmée).
-- ZeeRoo ne publie PAS automatiquement : aucun accès aux plateformes sociales n'est configuré ici ;
-- l'historique (`marketing_publications`) est prêt à recevoir les retours d'un futur connecteur.
-- L'établissement doit avoir consenti (`marketing_consent`) : son nom et sa photo ne sont jamais publiés sans accord.

create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
comment on table public.platform_admins is 'Équipe ZeeRoo. Aucune ligne n''est créée par migration : ajout manuel et audité (voir docs/DEPLOIEMENT.md).';

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;
revoke execute on function public.is_platform_admin from public, anon;
grant execute on function public.is_platform_admin to authenticated;

alter table public.merchants
  add column marketing_consent boolean not null default false,
  add column marketing_consent_at timestamptz;
grant update (marketing_consent) on public.merchants to authenticated;

create or replace function public.stamp_marketing_consent()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.marketing_consent_at := case when new.marketing_consent then now() else null end;
  return new;
end;
$$;
create trigger merchants_stamp_marketing_consent
  before update of marketing_consent on public.merchants
  for each row when (new.marketing_consent is distinct from old.marketing_consent)
  execute function public.stamp_marketing_consent();

-- Date du premier paiement de l'abonnement (premier passage à « actif », donc après l'essai).
alter table public.subscriptions add column first_paid_at timestamptz;
create or replace function public.stamp_first_paid_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' and new.first_paid_at is null then
    new.first_paid_at := now();
  end if;
  return new;
end;
$$;
create trigger subscriptions_stamp_first_paid_at
  before insert or update of status on public.subscriptions
  for each row execute function public.stamp_first_paid_at();

create type public.marketing_campaign_status as enum
  ('pending_review', 'scheduled', 'published', 'failed', 'rejected', 'cancelled');

create table public.marketing_campaigns (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  cycle_start  date not null,
  status       public.marketing_campaign_status not null default 'pending_review',
  caption      text not null check (char_length(caption) between 10 and 600),
  scheduled_for date,
  published_at timestamptz,
  attempts     int not null default 0,
  last_error   text check (char_length(last_error) <= 500),
  reviewed_by  uuid references auth.users (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (merchant_id, cycle_start),
  -- Validation humaine obligatoire : pas de campagne programmée, publiée ou en échec sans relecteur.
  check (status not in ('scheduled', 'published', 'failed') or (reviewed_by is not null and reviewed_at is not null))
);
create index marketing_campaigns_status_idx on public.marketing_campaigns (status, scheduled_for);
create trigger marketing_campaigns_set_updated_at
  before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

create table public.marketing_publications (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.marketing_campaigns (id) on delete cascade,
  platform     text not null check (platform in ('instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'other')),
  status       text not null check (status in ('published', 'failed')),
  post_url     text check (char_length(post_url) <= 500),
  error        text check (char_length(error) <= 500),
  attempted_by uuid references auth.users (id) on delete set null,
  attempted_at timestamptz not null default now()
);
create index marketing_publications_campaign_idx on public.marketing_publications (campaign_id);

alter table public.marketing_campaigns enable row level security;
alter table public.marketing_publications enable row level security;
revoke all on public.marketing_campaigns, public.marketing_publications from anon, authenticated;
grant select on public.marketing_campaigns, public.marketing_publications to authenticated;

create policy "marketing_campaigns: lecture par le propriétaire"
  on public.marketing_campaigns for select to authenticated
  using (public.is_merchant_owner(merchant_id));
create policy "marketing_publications: lecture par le propriétaire"
  on public.marketing_publications for select to authenticated
  using (exists (select 1 from public.marketing_campaigns c
                 where c.id = campaign_id and public.is_merchant_owner(c.merchant_id)));

-- Établissement éligible : Pro, abonnement actif **après un premier paiement** (pas pendant l'essai),
-- publié, avec consentement.
create or replace function public.merchant_marketing_eligible(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchants m
                 where m.id = p_merchant_id and m.is_published and m.marketing_consent)
     and exists (select 1 from public.subscriptions s
                 where s.merchant_id = p_merchant_id and s.plan = 'pro' and s.status = 'active'
                   and s.first_paid_at is not null);
$$;
revoke execute on function public.merchant_marketing_eligible from public, anon, authenticated;

-- Crée la campagne de l'échéance en cours pour chaque établissement éligible (idempotent) et annule
-- celles des établissements qui ne le sont plus. Appelée chaque jour par pg_cron.
create or replace function public.enqueue_due_marketing_campaigns()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_created int;
begin
  with due as (
    select m.id as merchant_id,
           (a.anchor + make_interval(months => floor(
              extract(year from age(today, a.anchor)) * 12 + extract(month from age(today, a.anchor)))::int))::date as cycle_start,
           m.name, m.slug, m.city, m.category
    from public.merchants m
    join public.subscriptions s on s.merchant_id = m.id
    cross join lateral (select (s.first_paid_at at time zone 'Europe/Paris')::date as anchor,
                               (now() at time zone 'Europe/Paris')::date as today) a
    where public.merchant_marketing_eligible(m.id)
  ), ins as (
    insert into public.marketing_campaigns (merchant_id, cycle_start, caption)
    select d.merchant_id, d.cycle_start,
           'Découvrez ' || d.name || ' à ' || d.city || ' sur ZeeRoo : commandez en Click & Collect ou en livraison, sans commission. https://zeeroo.fr/m/' || d.slug
    from due d
    on conflict (merchant_id, cycle_start) do nothing
    returning 1
  )
  select count(*) into v_created from ins;

  update public.marketing_campaigns c
  set status = 'cancelled', last_error = 'no_longer_eligible'
  where c.status in ('pending_review', 'scheduled', 'failed')
    and not public.merchant_marketing_eligible(c.merchant_id);

  return v_created;
end;
$$;
revoke execute on function public.enqueue_due_marketing_campaigns from public, anon, authenticated;
grant execute on function public.enqueue_due_marketing_campaigns to service_role;

select cron.schedule('marketing-campaigns', '15 6 * * *', $$select public.enqueue_due_marketing_campaigns()$$);

-- L'établissement relit et corrige le texte tant qu'il n'est pas validé.
create or replace function public.update_campaign_caption(p_id uuid, p_caption text)
returns public.marketing_campaigns language plpgsql security definer set search_path = '' as $$
declare v public.marketing_campaigns;
begin
  select * into v from public.marketing_campaigns where id = p_id and public.is_merchant_owner(merchant_id) for update;
  if v.id is null then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  -- Le texte relu par l'équipe ne change plus : seul un texte en attente de validation se corrige.
  if v.status <> 'pending_review' then
    raise exception 'campaign_locked' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_caption, ''))) not between 10 and 600 then
    raise exception 'invalid_caption' using errcode = '22023';
  end if;
  update public.marketing_campaigns set caption = trim(p_caption) where id = p_id returning * into v;
  return v;
end;
$$;
revoke execute on function public.update_campaign_caption from public, anon;
grant execute on function public.update_campaign_caption to authenticated;

-- ---------------------------------------------------------------------------------------
-- Administration (équipe ZeeRoo uniquement)
-- ---------------------------------------------------------------------------------------
create or replace function public.admin_list_campaigns(p_status public.marketing_campaign_status default null)
returns table (
  id uuid, merchant_id uuid, merchant_name text, merchant_slug text, city text, cycle_start date,
  status public.marketing_campaign_status, caption text, scheduled_for date, published_at timestamptz,
  attempts int, last_error text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  return query
  select c.id, c.merchant_id, m.name, m.slug, m.city, c.cycle_start, c.status, c.caption, c.scheduled_for,
         c.published_at, c.attempts, c.last_error
  from public.marketing_campaigns c join public.merchants m on m.id = c.merchant_id
  where p_status is null or c.status = p_status
  order by c.scheduled_for nulls first, c.created_at
  limit 200;
end;
$$;

-- Trois établissements au plus par jour de publication.
create or replace function public.marketing_daily_capacity()
returns int language sql immutable as $$ select 3 $$;

create or replace function public.admin_review_campaign(
  p_id uuid, p_approve boolean, p_scheduled_for date default null, p_caption text default null)
returns public.marketing_campaigns language plpgsql security definer set search_path = '' as $$
declare v public.marketing_campaigns;
begin
  if not public.is_platform_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select * into v from public.marketing_campaigns where id = p_id for update;
  if v.id is null then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if v.status <> 'pending_review' then raise exception 'campaign_locked' using errcode = '22023'; end if;
  if p_approve then
    if p_scheduled_for is null or p_scheduled_for < current_date then
      raise exception 'invalid_schedule' using errcode = '22023';
    end if;
    if not public.merchant_marketing_eligible(v.merchant_id) then
      raise exception 'not_eligible' using errcode = '22023';
    end if;
    if (select count(*) from public.marketing_campaigns c
        where c.scheduled_for = p_scheduled_for and c.status in ('scheduled', 'published') and c.id <> v.id)
       >= public.marketing_daily_capacity() then
      raise exception 'campaign_day_full' using errcode = '22023';
    end if;
  end if;
  update public.marketing_campaigns
  set status = case when p_approve then 'scheduled'::public.marketing_campaign_status
                    else 'rejected'::public.marketing_campaign_status end,
      scheduled_for = case when p_approve then p_scheduled_for else null end,
      caption = coalesce(nullif(trim(p_caption), ''), caption),
      reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_id returning * into v;
  return v;
end;
$$;

-- Résultat d'une tentative de publication (saisi par l'administration ou, plus tard, par un connecteur).
create or replace function public.admin_record_publication(
  p_id uuid, p_platform text, p_ok boolean, p_post_url text default null, p_error text default null)
returns public.marketing_campaigns language plpgsql security definer set search_path = '' as $$
declare v public.marketing_campaigns;
begin
  if not public.is_platform_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select * into v from public.marketing_campaigns where id = p_id for update;
  if v.id is null then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if v.status not in ('scheduled', 'failed') then raise exception 'campaign_locked' using errcode = '22023'; end if;
  insert into public.marketing_publications (campaign_id, platform, status, post_url, error, attempted_by)
  values (p_id, p_platform, case when p_ok then 'published' else 'failed' end,
          nullif(trim(p_post_url), ''), case when p_ok then null else left(coalesce(nullif(trim(p_error), ''), 'unknown'), 500) end,
          (select auth.uid()));
  update public.marketing_campaigns
  set status = case when p_ok then 'published'::public.marketing_campaign_status
                    else 'failed'::public.marketing_campaign_status end,
      published_at = case when p_ok then now() else published_at end,
      attempts = attempts + 1,
      last_error = case when p_ok then null else left(coalesce(nullif(trim(p_error), ''), 'unknown'), 500) end
  where id = p_id returning * into v;
  return v;
end;
$$;

-- Nouvelle tentative après un échec (au plus 5 au total).
create or replace function public.admin_requeue_campaign(p_id uuid, p_scheduled_for date)
returns public.marketing_campaigns language plpgsql security definer set search_path = '' as $$
declare v public.marketing_campaigns;
begin
  if not public.is_platform_admin() then raise exception 'admin_required' using errcode = '42501'; end if;
  select * into v from public.marketing_campaigns where id = p_id for update;
  if v.id is null then raise exception 'campaign_not_found' using errcode = 'P0002'; end if;
  if v.status <> 'failed' or v.attempts >= 5 then raise exception 'campaign_locked' using errcode = '22023'; end if;
  if p_scheduled_for is null or p_scheduled_for < current_date then
    raise exception 'invalid_schedule' using errcode = '22023';
  end if;
  update public.marketing_campaigns set status = 'scheduled', scheduled_for = p_scheduled_for
  where id = p_id returning * into v;
  return v;
end;
$$;

revoke execute on function public.admin_list_campaigns, public.admin_review_campaign,
  public.admin_record_publication, public.admin_requeue_campaign from public, anon;
grant execute on function public.admin_list_campaigns, public.admin_review_campaign,
  public.admin_record_publication, public.admin_requeue_campaign to authenticated;
