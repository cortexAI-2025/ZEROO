-- Étape (b) : commerces, horaires, menu (avec options) et commandes côté commerçant.
-- Le paiement (étape d) et la fidélité (étape e) viendront compléter ces tables.

create extension if not exists postgis with schema extensions;
create extension if not exists unaccent with schema extensions;

-- =============================================================================
-- Commerces
-- =============================================================================

create table public.merchants (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null unique references public.profiles (id),  -- 1 compte = 1 commerce
  slug                 text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name                 text not null check (char_length(name) between 2 and 80),
  description          text check (char_length(description) <= 500),
  category             text not null check (category in ('snack', 'sandwicherie', 'restaurant', 'boulangerie', 'autre')),
  phone                text check (char_length(phone) <= 20),
  address_line         text not null check (char_length(address_line) between 3 and 200),
  postal_code          text not null check (postal_code ~ '^\d{5}$'),
  city                 text not null check (char_length(city) between 1 and 100),
  latitude             double precision not null check (latitude between -90 and 90),
  longitude            double precision not null check (longitude between -180 and 180),
  location             extensions.geography(Point, 4326)
                         generated always as (
                           extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                         ) stored,
  timezone             text not null default 'Europe/Paris',
  default_prep_minutes int  not null default 15 check (default_prep_minutes between 1 and 120),
  is_paused            boolean not null default false,  -- « plus de commandes pour l'instant »
  paused_until         timestamptz,                     -- reprise automatique (null = jusqu'à réactivation)
  is_published         boolean not null default false,  -- visible des clients
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index merchants_location_idx on public.merchants using gist (location);

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at();

-- Helper RLS : l'utilisateur courant possède-t-il ce commerce ?
-- security definer pour éviter la récursion des policies entre tables.
create or replace function public.is_merchant_owner(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchants
    where id = p_merchant_id and owner_id = (select auth.uid())
  );
$$;

alter table public.merchants enable row level security;

revoke all on public.merchants from anon, authenticated;
grant select on public.merchants to anon, authenticated;
-- Le propriétaire modifie ses informations, jamais l'id, le slug ni le propriétaire.
grant update (name, description, category, phone, address_line, postal_code, city,
              latitude, longitude, default_prep_minutes, is_paused, paused_until, is_published)
  on public.merchants to authenticated;

create policy "merchants: lecture publique des commerces publiés"
  on public.merchants for select
  to anon, authenticated
  using (is_published or owner_id = (select auth.uid()));

create policy "merchants: modification par le propriétaire"
  on public.merchants for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Création du commerce : slug unique calculé côté serveur.
create or replace function public.create_merchant(
  p_name text,
  p_category text,
  p_address_line text,
  p_postal_code text,
  p_city text,
  p_latitude double precision,
  p_longitude double precision,
  p_phone text default null,
  p_description text default null,
  p_default_prep_minutes int default 15
)
returns public.merchants
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  base_slug text;
  candidate text;
  suffix int := 1;
  created public.merchants;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.merchants where owner_id = uid) then
    raise exception 'merchant_already_exists' using errcode = '23505';
  end if;

  base_slug := trim(both '-' from regexp_replace(lower(extensions.unaccent(p_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then
    base_slug := 'commerce';
  end if;
  base_slug := left(base_slug, 50);
  candidate := base_slug;
  while exists (select 1 from public.merchants where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix;
  end loop;

  insert into public.merchants (
    owner_id, slug, name, category, address_line, postal_code, city,
    latitude, longitude, phone, description, default_prep_minutes
  )
  values (
    uid, candidate, trim(p_name), p_category, trim(p_address_line), trim(p_postal_code), trim(p_city),
    p_latitude, p_longitude, nullif(trim(p_phone), ''), nullif(trim(p_description), ''), p_default_prep_minutes
  )
  returning * into created;

  return created;
end;
$$;

revoke execute on function public.create_merchant from public, anon;
grant execute on function public.create_merchant to authenticated;

-- =============================================================================
-- Horaires
-- =============================================================================

create table public.merchant_opening_hours (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- ISO : 1 = lundi, 7 = dimanche
  opens_at    time not null,
  closes_at   time not null,                                      -- < opens_at : se termine après minuit
  check (opens_at <> closes_at)
);

create index merchant_opening_hours_merchant_idx on public.merchant_opening_hours (merchant_id, weekday);

alter table public.merchant_opening_hours enable row level security;
revoke all on public.merchant_opening_hours from anon, authenticated;
grant select on public.merchant_opening_hours to anon, authenticated;
grant insert, update, delete on public.merchant_opening_hours to authenticated;

-- Remplace tous les créneaux d'un commerce en une seule transaction.
-- p_slots : [{ "weekday": 1, "opens_at": "11:00", "closes_at": "14:30" }, …]
create or replace function public.set_opening_hours(p_merchant_id uuid, p_slots jsonb)
returns setof public.merchant_opening_hours
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 50 then
    raise exception 'invalid_slots' using errcode = '22023';
  end if;

  delete from public.merchant_opening_hours where merchant_id = p_merchant_id;

  return query
  insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
  select p_merchant_id, (slot ->> 'weekday')::smallint, (slot ->> 'opens_at')::time, (slot ->> 'closes_at')::time
  from jsonb_array_elements(p_slots) as slot
  returning *;
end;
$$;

revoke execute on function public.set_opening_hours from public, anon;
grant execute on function public.set_opening_hours to authenticated;

-- =============================================================================
-- Menu
-- =============================================================================

create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  position    int  not null default 0,
  is_active   boolean not null default true,
  unique (id, merchant_id)
);

create index menu_categories_merchant_idx on public.menu_categories (merchant_id, position);

create table public.menu_items (
  id              uuid primary key default gen_random_uuid(),
  merchant_id     uuid not null references public.merchants (id) on delete cascade,
  category_id     uuid not null,
  name            text not null check (char_length(name) between 1 and 80),
  description     text check (char_length(description) <= 300),
  price_cents     int  not null check (price_cents between 0 and 100000),
  image_url       text,
  is_available    boolean not null default true,   -- rupture du jour
  is_loyalty_menu boolean not null default false,  -- compte pour la fidélité et peut être offert
  position        int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, merchant_id),
  -- Garantit qu'un produit est rangé dans une catégorie du même commerce.
  foreign key (category_id, merchant_id) references public.menu_categories (id, merchant_id) on delete cascade
);

create index menu_items_category_idx on public.menu_items (category_id, position);

create trigger menu_items_set_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- Options : « Sauce (1 au choix) », « Suppléments (0 à 3) »
create table public.menu_option_groups (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id     uuid not null,
  name        text not null check (char_length(name) between 1 and 60),
  min_select  int  not null default 0 check (min_select >= 0),
  max_select  int  not null default 1 check (max_select >= 1 and max_select >= min_select),
  position    int  not null default 0,
  unique (id, merchant_id),
  foreign key (item_id, merchant_id) references public.menu_items (id, merchant_id) on delete cascade
);

create index menu_option_groups_item_idx on public.menu_option_groups (item_id, position);

create table public.menu_options (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references public.merchants (id) on delete cascade,
  group_id          uuid not null,
  name              text not null check (char_length(name) between 1 and 60),
  price_delta_cents int  not null default 0 check (price_delta_cents between 0 and 10000),
  is_available      boolean not null default true,
  position          int  not null default 0,
  foreign key (group_id, merchant_id) references public.menu_option_groups (id, merchant_id) on delete cascade
);

create index menu_options_group_idx on public.menu_options (group_id, position);

-- Même règle pour toutes les tables « appartenant » à un commerce :
-- lecture publique si le commerce est publié, écriture par le propriétaire uniquement.
do $$
declare
  t text;
begin
  foreach t in array array['merchant_opening_hours', 'menu_categories', 'menu_items', 'menu_option_groups', 'menu_options']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format($p$
      create policy "%1$s: lecture si commerce publié ou propriétaire"
        on public.%1$I for select
        to anon, authenticated
        using (
          exists (select 1 from public.merchants m where m.id = merchant_id and m.is_published)
          or public.is_merchant_owner(merchant_id)
        )$p$, t);
    execute format($p$
      create policy "%1$s: écriture par le propriétaire"
        on public.%1$I for all
        to authenticated
        using (public.is_merchant_owner(merchant_id))
        with check (public.is_merchant_owner(merchant_id))$p$, t);
  end loop;
end;
$$;

-- =============================================================================
-- Ouverture et disponibilité (colonnes calculées exposées par PostgREST)
-- =============================================================================

create or replace function public.is_merchant_open(p_merchant_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with local as (
    select (p_at at time zone m.timezone) as ts
    from public.merchants m
    where m.id = p_merchant_id
  ),
  parts as (
    select extract(isodow from ts)::smallint as dow, ts::time as t from local
  )
  select exists (
    select 1
    from public.merchant_opening_hours h, parts p
    where h.merchant_id = p_merchant_id
      and (
        -- créneau dans la journée
        (h.opens_at < h.closes_at and h.weekday = p.dow and p.t >= h.opens_at and p.t < h.closes_at)
        -- créneau qui passe minuit : partie du soir…
        or (h.opens_at > h.closes_at and h.weekday = p.dow and p.t >= h.opens_at)
        -- …et partie après minuit, le lendemain
        or (h.opens_at > h.closes_at and h.weekday = (case when p.dow = 1 then 7 else p.dow - 1 end) and p.t < h.closes_at)
      )
  );
$$;

-- Pause effective : la pause temporisée expire d'elle-même.
create or replace function public.is_paused_now(m public.merchants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select m.is_paused and (m.paused_until is null or m.paused_until > now());
$$;

create or replace function public.is_open_now(m public.merchants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_merchant_open(m.id, now());
$$;

-- Le commerce peut-il recevoir une commande maintenant ?
-- Complété à l'étape (d) : abonnement actif et compte Stripe opérationnel.
create or replace function public.is_accepting_orders(m public.merchants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select m.is_published and not public.is_paused_now(m) and public.is_open_now(m);
$$;

-- =============================================================================
-- Commandes
-- =============================================================================

create type public.order_status as enum (
  'pending_payment', -- PaymentIntent créé, pas encore autorisé (étape d)
  'placed',          -- payée / autorisée, attend la réponse du commerçant
  'accepted',        -- acceptée, délai annoncé
  'preparing',
  'ready',
  'collected',       -- remise au client
  'refused',
  'expired',         -- pas de réponse du commerçant
  'cancelled'        -- paiement abandonné ou échoué
);

-- Code de retrait court, sans caractères ambigus (0/O, 1/I/L).
create or replace function public.generate_pickup_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 4);
$$;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references public.merchants (id),
  customer_id        uuid references public.profiles (id) on delete set null,  -- anonymisée si compte supprimé
  customer_name      text,                                                     -- instantané, effacé si compte supprimé
  pickup_code        text not null default public.generate_pickup_code(),
  status             public.order_status not null default 'pending_payment',
  subtotal_cents     int  not null check (subtotal_cents >= 0),
  discount_cents     int  not null default 0 check (discount_cents >= 0),
  total_cents        int  not null check (total_cents = subtotal_cents - discount_cents),
  currency           char(3) not null default 'EUR',
  customer_note      text check (char_length(customer_note) <= 300),
  prep_minutes       int  check (prep_minutes between 1 and 180),
  estimated_ready_at timestamptz,
  refusal_reason     text check (char_length(refusal_reason) <= 200),
  placed_at          timestamptz,
  accepted_at        timestamptz,
  ready_at           timestamptz,
  collected_at       timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index orders_merchant_status_idx on public.orders (merchant_id, status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  menu_item_id     uuid references public.menu_items (id) on delete set null,
  name             text not null,                  -- instantané : le menu peut changer ensuite
  unit_price_cents int  not null check (unit_price_cents >= 0),  -- prix + options
  quantity         int  not null check (quantity between 1 and 50),
  options          jsonb not null default '[]',    -- [{ "group": "Sauce", "name": "Algérienne", "price_delta_cents": 0 }]
  line_total_cents int  not null check (line_total_cents = unit_price_cents * quantity)
);

create index order_items_order_idx on public.order_items (order_id);

-- Lecture seule pour les clients et les commerçants : toute écriture passe par
-- des fonctions serveur (Edge Functions à l'étape c/d, set_order_status ici).
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.orders, public.order_items from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

create policy "orders: le client voit ses commandes"
  on public.orders for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "orders: le commerçant voit les commandes de son commerce"
  on public.orders for select
  to authenticated
  using (public.is_merchant_owner(merchant_id));

create policy "order_items: visibles avec la commande"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid()) or public.is_merchant_owner(o.merchant_id))
    )
  );

-- RGPD : la suppression d'un compte efface aussi le nom recopié dans ses commandes.
create or replace function public.anonymize_orders_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set customer_name = null where customer_id = old.id;
  return old;
end;
$$;

create trigger profiles_anonymize_orders
  before delete on public.profiles
  for each row execute function public.anonymize_orders_on_profile_delete();

-- Machine à états côté commerçant.
-- À l'étape (d), accept / refuse passeront par une Edge Function (capture ou
-- annulation du paiement Stripe) et ne seront plus autorisés ici.
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_prep_minutes int default null,
  p_refusal_reason text default null,
  p_pickup_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
  updated public.orders;
begin
  select * into current_order from public.orders where id = p_order_id for update;

  if current_order.id is null or not public.is_merchant_owner(current_order.merchant_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if not (
    (current_order.status = 'placed' and p_status in ('accepted', 'refused'))
    or (current_order.status = 'accepted' and p_status in ('preparing', 'ready'))
    or (current_order.status = 'preparing' and p_status = 'ready')
    or (current_order.status = 'ready' and p_status = 'collected')
  ) then
    raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
  end if;

  if p_status = 'accepted' and (p_prep_minutes is null or p_prep_minutes not between 1 and 180) then
    raise exception 'prep_minutes_required' using errcode = '22023';
  end if;

  if p_status = 'collected'
     and upper(trim(coalesce(p_pickup_code, ''))) <> current_order.pickup_code then
    raise exception 'invalid_pickup_code' using errcode = '22023';
  end if;

  update public.orders
  set status             = p_status,
      prep_minutes       = case when p_status = 'accepted' then p_prep_minutes else prep_minutes end,
      accepted_at        = case when p_status = 'accepted' then now() else accepted_at end,
      estimated_ready_at = case when p_status = 'accepted' then now() + make_interval(mins => p_prep_minutes)
                                else estimated_ready_at end,
      refusal_reason     = case when p_status = 'refused' then nullif(trim(p_refusal_reason), '') else refusal_reason end,
      cancelled_at       = case when p_status = 'refused' then now() else cancelled_at end,
      ready_at           = case when p_status = 'ready' then now() else ready_at end,
      collected_at       = case when p_status = 'collected' then now() else collected_at end
  where id = p_order_id
  returning * into updated;

  return updated;
end;
$$;

revoke execute on function public.set_order_status from public, anon;
grant execute on function public.set_order_status to authenticated;

-- Chiffre d'affaires et activité du jour (fuseau horaire du commerce).
create or replace function public.merchant_today_summary(p_merchant_id uuid)
returns table (orders_count int, revenue_cents bigint, pending_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where o.status in ('accepted', 'preparing', 'ready', 'collected'))::int,
    coalesce(sum(o.total_cents) filter (where o.status in ('accepted', 'preparing', 'ready', 'collected')), 0)::bigint,
    count(*) filter (where o.status = 'placed')::int
  from public.orders o
  join public.merchants m on m.id = o.merchant_id
  where o.merchant_id = p_merchant_id
    and public.is_merchant_owner(p_merchant_id)
    and (o.created_at at time zone m.timezone)::date = (now() at time zone m.timezone)::date;
$$;

revoke execute on function public.merchant_today_summary from public, anon;
grant execute on function public.merchant_today_summary to authenticated;

-- Temps réel : le commerçant reçoit les nouvelles commandes, le client le suivi.
-- Realtime applique la RLS : chacun ne reçoit que les lignes qu'il peut lire.
alter publication supabase_realtime add table public.orders;

-- Suppression de compte : un propriétaire de commerce doit d'abord clôturer son
-- commerce (résiliation de l'abonnement Stripe, étape d). En attendant, refus explicite.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.merchants where owner_id = uid) then
    raise exception 'merchant_owner_cannot_delete' using errcode = '23503';
  end if;
  delete from auth.users where id = uid;
end;
$$;
