-- Étape (g) : livraison par livreur indépendant (voir docs/ARCHITECTURE.md §3.4).
--   • Le livreur (auto-entrepreneur ou société) paie le même abonnement que les restaurants
--     et se rattache aux restaurants avec leur accord.
--   • Le restaurant fixe le prix de la course et son rayon de livraison.
--   • Le client paie deux paiements séparés : le repas au restaurant, la course au livreur,
--     chacun en charge directe Stripe Connect. Zéroo n'encaisse rien.

-- =============================================================================
-- Types
-- =============================================================================

create type public.fulfillment_type as enum ('pickup', 'delivery');
create type public.courier_legal_status as enum ('auto_entrepreneur', 'societe');
create type public.courier_vehicle as enum ('bike', 'scooter', 'car', 'foot');
create type public.courier_link_status as enum ('pending', 'approved', 'rejected');

-- SIRET : 14 chiffres et clé de Luhn (La Poste, SIREN 356000000, a sa propre règle).
create or replace function public.is_valid_siret(p_siret text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_siret ~ '^\d{14}$', false) and (
    case when left(p_siret, 9) = '356000000' then
      (select sum(substr(p_siret, i, 1)::int) from generate_series(1, 14) i) % 5 = 0
    else
      (select sum(case when i % 2 = 1
                       then case when substr(p_siret, i, 1)::int * 2 > 9
                                 then substr(p_siret, i, 1)::int * 2 - 9
                                 else substr(p_siret, i, 1)::int * 2 end
                       else substr(p_siret, i, 1)::int end)
       from generate_series(1, 14) i) % 10 = 0
    end
  );
$$;

-- =============================================================================
-- Livreurs
-- =============================================================================

create table public.couriers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.profiles (id) on delete cascade,  -- 1 compte = 1 livreur
  display_name     text not null check (char_length(display_name) between 2 and 80),
  phone            text not null check (phone ~ '^\+?[0-9][0-9 .-]{8,18}[0-9]$'),
  legal_status     public.courier_legal_status not null,
  siret            text not null unique check (public.is_valid_siret(siret)),
  vehicle          public.courier_vehicle not null default 'bike',
  is_available     boolean not null default false,  -- « Je suis disponible »
  last_assigned_at timestamptz,                     -- rotation équitable des courses
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger couriers_set_updated_at
  before update on public.couriers
  for each row execute function public.set_updated_at();

-- Helper RLS : profil livreur de l'utilisateur courant (null s'il n'en a pas).
create or replace function public.current_courier_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.couriers where user_id = (select auth.uid());
$$;

create table public.courier_stripe_accounts (
  courier_id        uuid primary key references public.couriers (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  updated_at        timestamptz not null default now()
);

create trigger courier_stripe_accounts_set_updated_at
  before update on public.courier_stripe_accounts
  for each row execute function public.set_updated_at();

-- Même abonnement que les restaurants : 9,99 € TTC par mois, 30 jours d'essai.
create table public.courier_subscriptions (
  courier_id             uuid primary key references public.couriers (id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 public.subscription_status not null default 'incomplete',
  trial_end              timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_used             boolean not null default false,
  updated_at             timestamptz not null default now()
);

create trigger courier_subscriptions_set_updated_at
  before update on public.courier_subscriptions
  for each row execute function public.set_updated_at();

-- Rattachement d'un livreur à un restaurant, à la demande du livreur, avec l'accord du restaurant.
create table public.merchant_couriers (
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  courier_id   uuid not null references public.couriers (id) on delete cascade,
  status       public.courier_link_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  primary key (merchant_id, courier_id)
);

create index merchant_couriers_courier_idx on public.merchant_couriers (courier_id);

-- =============================================================================
-- Réglages de livraison du restaurant
-- =============================================================================

alter table public.merchants
  add column delivery_enabled   boolean not null default false,
  add column delivery_fee_cents int not null default 300 check (delivery_fee_cents between 50 and 2000),  -- minimum Stripe : 0,50 €
  add column delivery_radius_m  int not null default 3000 check (delivery_radius_m between 500 and 15000);

grant update (delivery_enabled, delivery_fee_cents, delivery_radius_m) on public.merchants to authenticated;

-- =============================================================================
-- Commandes livrées
-- =============================================================================

alter table public.orders
  add column fulfillment                  public.fulfillment_type not null default 'pickup',
  add column delivery_fee_cents           int not null default 0,  -- payé au livreur, en plus de total_cents
  add column delivery_address_line        text check (char_length(delivery_address_line) between 3 and 200),
  add column delivery_postal_code         text check (delivery_postal_code ~ '^\d{5}$'),
  add column delivery_city                text check (char_length(delivery_city) between 1 and 100),
  add column delivery_latitude            double precision check (delivery_latitude between -90 and 90),
  add column delivery_longitude           double precision check (delivery_longitude between -180 and 180),
  add column delivery_instructions        text check (char_length(delivery_instructions) <= 200),
  add column delivery_phone               text check (char_length(delivery_phone) <= 20),
  add column delivery_distance_m          int,
  add column delivery_code                text check (delivery_code ~ '^\d{4}$'),  -- donné par le client au livreur
  add column courier_id                   uuid references public.couriers (id) on delete set null,
  add column courier_name                 text,  -- instantané : le client ne lit jamais la table couriers
  add column courier_stripe_account_id    text,
  add column delivery_payment_intent_id   text unique,
  add column delivery_checkout_session_id text unique,
  add column meal_authorized_at           timestamptz,
  add column delivery_authorized_at       timestamptz,
  add column courier_accepted_at          timestamptz,
  add column out_for_delivery_at          timestamptz,
  add column delivered_at                 timestamptz,
  add column delivery_paid_at             timestamptz,
  add column cancelled_by                 text check (cancelled_by in ('customer', 'merchant', 'courier', 'system')),
  add constraint orders_fulfillment_consistent check (
    case fulfillment
      when 'pickup' then delivery_fee_cents = 0 and delivery_city is null and courier_id is null
      -- l'adresse précise est effacée 7 jours après la fin (RGPD) : seule la ville est obligatoire
      else delivery_fee_cents >= 50 and delivery_city is not null and delivery_postal_code is not null
    end
  );

create index orders_courier_idx on public.orders (courier_id, status, created_at desc);

-- =============================================================================
-- Disponibilité des livreurs
-- =============================================================================

-- Compte Stripe actif et abonnement en règle.
create or replace function public.is_courier_active(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courier_stripe_accounts a where a.courier_id = p_courier_id and a.charges_enabled)
     and exists (select 1 from public.courier_subscriptions s
                 where s.courier_id = p_courier_id and s.status in ('trialing', 'active'));
$$;

-- Une course à la fois (MVP). Une commande en attente de paiement réserve déjà le livreur.
create or replace function public.is_courier_busy(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.courier_id = p_courier_id
      and o.status in ('pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'out_for_delivery')
  );
$$;

-- Livreurs qui peuvent prendre une course de ce restaurant maintenant.
create or replace function public.available_couriers(p_merchant_id uuid)
returns setof public.couriers
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from public.couriers c
  join public.merchant_couriers l on l.courier_id = c.id
  where l.merchant_id = p_merchant_id
    and l.status = 'approved'
    and c.is_available
    and public.is_courier_active(c.id)
    and not public.is_courier_busy(c.id);
$$;

revoke execute on function public.is_courier_active, public.is_courier_busy, public.available_couriers
  from public, anon, authenticated;

-- Devis affiché au client avant de commander : prix de la course et raison si impossible.
create or replace function public.merchant_delivery_quote(p_merchant_id uuid, p_latitude double precision, p_longitude double precision)
returns table (available boolean, reason text, fee_cents int, distance_m int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_distance int;
begin
  select * into v_merchant from public.merchants where id = p_merchant_id and is_published;
  if v_merchant.id is null or not v_merchant.delivery_enabled then
    return query select false, 'delivery_unavailable'::text, null::int, null::int;
    return;
  end if;
  v_distance := round(extensions.st_distance(
    v_merchant.location,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  ))::int;
  if v_distance > v_merchant.delivery_radius_m then
    return query select false, 'delivery_out_of_range'::text, v_merchant.delivery_fee_cents, v_distance;
  elsif not exists (select 1 from public.available_couriers(p_merchant_id)) then
    return query select false, 'no_courier_available'::text, v_merchant.delivery_fee_cents, v_distance;
  else
    return query select true, null::text, v_merchant.delivery_fee_cents, v_distance;
  end if;
end;
$$;

revoke execute on function public.merchant_delivery_quote from public;
grant execute on function public.merchant_delivery_quote to anon, authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.couriers enable row level security;
alter table public.courier_stripe_accounts enable row level security;
alter table public.courier_subscriptions enable row level security;
alter table public.merchant_couriers enable row level security;

revoke all on public.couriers, public.courier_stripe_accounts, public.courier_subscriptions, public.merchant_couriers
  from anon, authenticated;
grant select on public.couriers, public.courier_stripe_accounts, public.courier_subscriptions, public.merchant_couriers
  to authenticated;
-- Création, disponibilité et rattachements passent par les fonctions ci-dessous.
grant update (display_name, phone, vehicle) on public.couriers to authenticated;

create policy "couriers: le livreur voit son profil"
  on public.couriers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "couriers: le restaurant voit ses livreurs et candidats"
  on public.couriers for select
  to authenticated
  using (exists (
    select 1 from public.merchant_couriers l
    where l.courier_id = couriers.id and public.is_merchant_owner(l.merchant_id)
  ));

create policy "couriers: le livreur modifie son profil"
  on public.couriers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "courier_stripe_accounts: lecture par le livreur"
  on public.courier_stripe_accounts for select
  to authenticated
  using (courier_id = public.current_courier_id());

create policy "courier_subscriptions: lecture par le livreur"
  on public.courier_subscriptions for select
  to authenticated
  using (courier_id = public.current_courier_id());

create policy "merchant_couriers: le livreur voit ses rattachements"
  on public.merchant_couriers for select
  to authenticated
  using (courier_id = public.current_courier_id());

create policy "merchant_couriers: le restaurant voit ses livreurs"
  on public.merchant_couriers for select
  to authenticated
  using (public.is_merchant_owner(merchant_id));

-- Le livreur voit les commandes qui lui sont attribuées (adresse, téléphone, contenu).
create policy "orders: le livreur voit ses courses"
  on public.orders for select
  to authenticated
  using (courier_id is not null and courier_id = public.current_courier_id());

drop policy "order_items: visibles avec la commande" on public.order_items;
create policy "order_items: visibles avec la commande"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = (select auth.uid())
             or public.is_merchant_owner(o.merchant_id)
             or (o.courier_id is not null and o.courier_id = public.current_courier_id()))
    )
  );

-- Le livreur garde l'accès aux restaurants où il est rattaché ou en course, même non publiés.
create policy "merchants: visibles des livreurs rattachés"
  on public.merchants for select
  to authenticated
  using (
    exists (select 1 from public.merchant_couriers l
            where l.merchant_id = merchants.id and l.courier_id = public.current_courier_id())
    or exists (select 1 from public.orders o
               where o.merchant_id = merchants.id and o.courier_id is not null
                 and o.courier_id = public.current_courier_id())
  );

alter publication supabase_realtime add table public.merchant_couriers;

-- =============================================================================
-- Fonctions du livreur
-- =============================================================================

create or replace function public.create_courier(
  p_display_name text,
  p_phone text,
  p_legal_status public.courier_legal_status,
  p_siret text,
  p_vehicle public.courier_vehicle
)
returns public.couriers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_siret text := regexp_replace(coalesce(p_siret, ''), '\s', '', 'g');
  v_courier public.couriers;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.couriers where user_id = auth.uid()) then
    raise exception 'courier_exists' using errcode = '23505';
  end if;
  if not public.is_valid_siret(v_siret) then
    raise exception 'invalid_siret' using errcode = '22023';
  end if;
  if exists (select 1 from public.couriers where siret = v_siret) then
    raise exception 'siret_taken' using errcode = '23505';
  end if;
  insert into public.couriers (user_id, display_name, phone, legal_status, siret, vehicle)
  values (auth.uid(), trim(p_display_name), trim(p_phone), p_legal_status, v_siret, p_vehicle)
  returning * into v_courier;
  return v_courier;
end;
$$;

-- Se rendre disponible exige un compte de paiement actif, un abonnement en règle et au
-- moins un restaurant qui a accepté le rattachement.
create or replace function public.set_courier_availability(p_available boolean)
returns public.couriers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.current_courier_id();
  v_courier public.couriers;
begin
  if v_id is null then
    raise exception 'courier_profile_required' using errcode = '42501';
  end if;
  if p_available then
    if not exists (select 1 from public.courier_stripe_accounts where courier_id = v_id and charges_enabled) then
      raise exception 'courier_payments_not_ready' using errcode = '22023';
    end if;
    if not exists (select 1 from public.courier_subscriptions
                   where courier_id = v_id and status in ('trialing', 'active')) then
      raise exception 'courier_subscription_inactive' using errcode = '22023';
    end if;
    if not exists (select 1 from public.merchant_couriers where courier_id = v_id and status = 'approved') then
      raise exception 'courier_no_merchant' using errcode = '22023';
    end if;
  end if;
  update public.couriers set is_available = p_available where id = v_id returning * into v_courier;
  return v_courier;
end;
$$;

create or replace function public.request_merchant_link(p_merchant_id uuid)
returns public.merchant_couriers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.current_courier_id();
  v_link public.merchant_couriers;
begin
  if v_id is null then
    raise exception 'courier_profile_required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.merchants where id = p_merchant_id and is_published) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  select * into v_link from public.merchant_couriers where merchant_id = p_merchant_id and courier_id = v_id;
  if v_link.status = 'rejected' then
    raise exception 'link_rejected' using errcode = '22023';
  end if;
  if v_link.merchant_id is null then
    insert into public.merchant_couriers (merchant_id, courier_id)
    values (p_merchant_id, v_id)
    returning * into v_link;
  end if;
  return v_link;
end;
$$;

-- Le livreur quitte un restaurant (ou retire sa demande).
create or replace function public.leave_merchant(p_merchant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.merchant_couriers
  where merchant_id = p_merchant_id and courier_id = public.current_courier_id();
$$;

-- Le livreur confirme la course qui lui est attribuée. Le restaurant ne peut accepter une
-- commande livrée qu'après cette confirmation. Décliner passe par l'Edge Function
-- courier-decline, qui libère les deux paiements.
create or replace function public.courier_confirm_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set courier_accepted_at = coalesce(courier_accepted_at, now())
  where id = p_order_id
    and courier_id is not null
    and courier_id = public.current_courier_id()
    and status = 'placed'
  returning * into v_order;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return v_order;
end;
$$;

-- Revenus du livreur : courses livrées, dans le fuseau de Paris.
create or replace function public.courier_earnings_summary()
returns table (today_cents bigint, today_count int, week_cents bigint, month_cents bigint, month_count int)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select o.delivery_fee_cents, (o.delivered_at at time zone 'Europe/Paris') as local_at
    from public.orders o
    where o.courier_id = public.current_courier_id() and o.status = 'delivered'
  ), now_local as (select now() at time zone 'Europe/Paris' as t)
  select
    coalesce(sum(delivery_fee_cents) filter (where local_at::date = t::date), 0)::bigint,
    (count(*) filter (where local_at::date = t::date))::int,
    coalesce(sum(delivery_fee_cents) filter (where local_at >= date_trunc('week', t)), 0)::bigint,
    coalesce(sum(delivery_fee_cents) filter (where local_at >= date_trunc('month', t)), 0)::bigint,
    (count(*) filter (where local_at >= date_trunc('month', t)))::int
  from now_local left join mine on true
  group by t;
$$;

-- =============================================================================
-- Fonctions du restaurant
-- =============================================================================

create or replace function public.decide_courier_link(p_courier_id uuid, p_approve boolean)
returns public.merchant_couriers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.merchant_couriers;
begin
  update public.merchant_couriers l
  set status = case when p_approve then 'approved'::public.courier_link_status
                    else 'rejected'::public.courier_link_status end,
      decided_at = now()
  where l.courier_id = p_courier_id and public.is_merchant_owner(l.merchant_id)
  returning * into v_link;
  if v_link.merchant_id is null then
    raise exception 'courier_not_found' using errcode = 'P0002';
  end if;
  return v_link;
end;
$$;

-- Retire un livreur (il pourra redemander son rattachement).
create or replace function public.remove_courier(p_courier_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.merchant_couriers l
  where l.courier_id = p_courier_id and public.is_merchant_owner(l.merchant_id);
$$;

revoke execute on function public.create_courier, public.set_courier_availability, public.request_merchant_link,
  public.leave_merchant, public.courier_confirm_order, public.courier_earnings_summary,
  public.decide_courier_link, public.remove_courier
  from public, anon;
grant execute on function public.create_courier, public.set_courier_availability, public.request_merchant_link,
  public.leave_merchant, public.courier_confirm_order, public.courier_earnings_summary,
  public.decide_courier_link, public.remove_courier
  to authenticated;

-- =============================================================================
-- Création de commande (retrait ou livraison)
-- =============================================================================

-- p_delivery (null = retrait) :
--   { "address_line", "postal_code", "city", "latitude", "longitude", "phone", "instructions" }
-- Le livreur est choisi et réservé ici : on sait donc dès le paiement quel compte Stripe
-- reçoit la course.
drop function public.create_order(uuid, uuid, jsonb, text);

create or replace function public.create_order(
  p_customer_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_customer_note text default null,
  p_delivery jsonb default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_order public.orders;
  v_line jsonb;
  v_item public.menu_items;
  v_quantity int;
  v_option_ids uuid[];
  v_valid_count int;
  v_options jsonb;
  v_unit int;
  v_subtotal int := 0;
  v_discount int := 0;
  v_group record;
  v_use_reward boolean;
  v_reward_used boolean := false;
  v_card public.loyalty_cards;
  v_lat double precision;
  v_lng double precision;
  v_distance int;
  v_courier public.couriers;
begin
  if p_customer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null or not public.is_accepting_orders(v_merchant) then
    raise exception 'merchant_not_accepting' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;
  if char_length(p_customer_note) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  insert into public.orders (merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents,
                             customer_note, stripe_account_id)
  values (
    p_merchant_id, p_customer_id,
    (select display_name from public.profiles where id = p_customer_id),
    'pending_payment', 0, 0, nullif(trim(p_customer_note), ''),
    (select stripe_account_id from public.merchant_stripe_accounts where merchant_id = p_merchant_id)
  )
  returning * into v_order;

  -- Livraison : adresse dans le rayon du restaurant et livreur libre, réservé sous verrou.
  if p_delivery is not null and jsonb_typeof(p_delivery) = 'object' then
    if not v_merchant.delivery_enabled then
      raise exception 'delivery_unavailable' using errcode = '22023';
    end if;
    begin
      v_lat := (p_delivery ->> 'latitude')::double precision;
      v_lng := (p_delivery ->> 'longitude')::double precision;
    exception when others then
      raise exception 'invalid_delivery_address' using errcode = '22023';
    end;
    if v_lat is null or v_lng is null
       or char_length(trim(coalesce(p_delivery ->> 'address_line', ''))) not between 3 and 200
       or coalesce(p_delivery ->> 'postal_code', '') !~ '^\d{5}$'
       or char_length(trim(coalesce(p_delivery ->> 'city', ''))) not between 1 and 100 then
      raise exception 'invalid_delivery_address' using errcode = '22023';
    end if;
    if coalesce(p_delivery ->> 'phone', '') !~ '^\+?[0-9][0-9 .-]{8,18}[0-9]$' then
      raise exception 'invalid_delivery_phone' using errcode = '22023';
    end if;
    if char_length(p_delivery ->> 'instructions') > 200 then
      raise exception 'note_too_long' using errcode = '22023';
    end if;

    v_distance := round(extensions.st_distance(
      v_merchant.location,
      extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography
    ))::int;
    if v_distance > v_merchant.delivery_radius_m then
      raise exception 'delivery_out_of_range' using errcode = '22023';
    end if;

    -- Livreur servi le moins récemment ; skip locked : deux commandes simultanées
    -- ne réservent jamais le même livreur.
    select c.* into v_courier
    from public.couriers c
    where c.id in (select a.id from public.available_couriers(p_merchant_id) a)
    order by c.last_assigned_at asc nulls first, c.created_at
    limit 1
    for update of c skip locked;
    if v_courier.id is null then
      raise exception 'no_courier_available' using errcode = '22023';
    end if;
    update public.couriers set last_assigned_at = now() where id = v_courier.id;

    update public.orders
    set fulfillment = 'delivery',
        delivery_fee_cents = v_merchant.delivery_fee_cents,
        delivery_address_line = trim(p_delivery ->> 'address_line'),
        delivery_postal_code = p_delivery ->> 'postal_code',
        delivery_city = trim(p_delivery ->> 'city'),
        delivery_latitude = v_lat,
        delivery_longitude = v_lng,
        delivery_phone = trim(p_delivery ->> 'phone'),
        delivery_instructions = nullif(trim(p_delivery ->> 'instructions'), ''),
        delivery_distance_m = v_distance,
        delivery_code = lpad(floor(random() * 10000)::int::text, 4, '0'),
        courier_id = v_courier.id,
        courier_name = split_part(v_courier.display_name, ' ', 1),
        courier_stripe_account_id = (select stripe_account_id from public.courier_stripe_accounts
                                     where courier_id = v_courier.id)
    where id = v_order.id;
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    -- Produit disponible, dans une catégorie visible de ce commerce.
    select i.* into v_item
    from public.menu_items i
    join public.menu_categories c on c.id = i.category_id
    where i.id = (v_line ->> 'item_id')::uuid
      and i.merchant_id = p_merchant_id
      and i.is_available
      and c.is_active;
    if v_item.id is null then
      raise exception 'item_unavailable' using errcode = '22023';
    end if;

    v_quantity := coalesce((v_line ->> 'quantity')::int, 0);
    if v_quantity not between 1 and 50 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    v_option_ids := coalesce(
      (select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]')) x),
      '{}'
    );

    -- Chaque option doit exister, être disponible et appartenir à un groupe de ce produit.
    select count(*) into v_valid_count
    from public.menu_options o
    join public.menu_option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids) and o.is_available and g.item_id = v_item.id;
    if v_valid_count <> coalesce(array_length(v_option_ids, 1), 0) then
      raise exception 'invalid_options' using errcode = '22023';
    end if;

    -- Respect du minimum et du maximum de chaque groupe.
    for v_group in
      select g.id, g.min_select, g.max_select,
             (select count(*) from public.menu_options o where o.group_id = g.id and o.id = any (v_option_ids)) as chosen
      from public.menu_option_groups g
      where g.item_id = v_item.id
    loop
      if v_group.chosen < v_group.min_select or v_group.chosen > v_group.max_select then
        raise exception 'invalid_options' using errcode = '22023';
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'name', o.name, 'price_delta_cents', o.price_delta_cents)
                              order by g.position, o.position), '[]'),
           v_item.price_cents + coalesce(sum(o.price_delta_cents), 0)
    into v_options, v_unit
    from public.menu_options o
    join public.menu_option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids);

    v_use_reward := coalesce((v_line ->> 'use_reward')::boolean, false);
    if v_use_reward then
      if v_reward_used then
        raise exception 'invalid_reward' using errcode = '22023';  -- un seul menu offert par commande
      end if;
      if not v_item.is_loyalty_menu then
        raise exception 'invalid_reward' using errcode = '22023';  -- produit au détail : non éligible
      end if;
      -- Verrou sur la carte : deux commandes simultanées ne peuvent pas utiliser le même menu offert.
      select * into v_card from public.loyalty_cards
      where user_id = p_customer_id and merchant_id = p_merchant_id
      for update;
      if v_card.user_id is null or v_card.rewards_available < 1 then
        raise exception 'no_reward_available' using errcode = '22023';
      end if;
      update public.loyalty_cards
      set rewards_available = rewards_available - 1
      where user_id = p_customer_id and merchant_id = p_merchant_id;

      insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                      line_total_cents, is_loyalty_menu, is_loyalty_reward)
      values (v_order.id, v_item.id, v_item.name, v_unit, 1, v_options, v_unit, true, true);
      v_subtotal := v_subtotal + v_unit;
      v_discount := v_item.price_cents;  -- le menu est offert, pas ses suppléments
      v_reward_used := true;
      v_quantity := v_quantity - 1;
    end if;

    if v_quantity > 0 then
      insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                      line_total_cents, is_loyalty_menu)
      values (v_order.id, v_item.id, v_item.name, v_unit, v_quantity, v_options, v_unit * v_quantity,
              v_item.is_loyalty_menu);
      v_subtotal := v_subtotal + v_unit * v_quantity;
    end if;
  end loop;

  -- Stripe n'accepte pas moins de 0,50 € : un reste inférieur est offert avec le menu.
  if v_reward_used and v_subtotal - v_discount < 50 then
    v_discount := v_subtotal;
  end if;

  update public.orders
  set subtotal_cents = v_subtotal,
      discount_cents = v_discount,
      total_cents = v_subtotal - v_discount,
      is_loyalty_reward = v_reward_used
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, text, jsonb) to service_role;

-- =============================================================================
-- Autorisation des paiements : la commande part quand repas ET course sont autorisés
-- =============================================================================

create or replace function public.mark_order_authorized(p_order_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set meal_authorized_at = coalesce(meal_authorized_at, now()),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      status = case when fulfillment = 'pickup' or delivery_authorized_at is not null
                    then 'placed'::public.order_status else status end,
      placed_at = case when fulfillment = 'pickup' or delivery_authorized_at is not null
                       then now() else placed_at end
  where id = p_order_id and status = 'pending_payment'
  returning *;
$$;

create or replace function public.mark_delivery_authorized(p_order_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set delivery_authorized_at = coalesce(delivery_authorized_at, now()),
      delivery_payment_intent_id = coalesce(delivery_payment_intent_id, p_payment_intent_id),
      status = case when meal_authorized_at is not null then 'placed'::public.order_status else status end,
      placed_at = case when meal_authorized_at is not null then now() else placed_at end
  where id = p_order_id and status = 'pending_payment' and fulfillment = 'delivery'
  returning *;
$$;

create or replace function public.mark_order_payment_failed(p_order_id uuid)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system'
  where id = p_order_id and status = 'pending_payment'
  returning *;
$$;

revoke execute on function public.mark_delivery_authorized from public, anon, authenticated;
grant execute on function public.mark_delivery_authorized to service_role;

-- =============================================================================
-- Transitions de statut
-- =============================================================================

create or replace function public.apply_order_transition(
  p_order_id uuid,
  p_actor uuid,
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
  is_owner boolean;
  is_courier boolean;
  v_cancelled_by text;
  updated public.orders;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if current_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.merchants where id = current_order.merchant_id and owner_id = p_actor
  ) into is_owner;
  select exists (
    select 1 from public.couriers where id = current_order.courier_id and user_id = p_actor
  ) into is_courier;

  if p_status = 'cancelled' then
    if current_order.customer_id is not distinct from p_actor and p_actor is not null then
      -- Annulation par le client, tant que le commerçant n'a pas accepté.
      if current_order.status not in ('pending_payment', 'placed') then
        raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
      end if;
      v_cancelled_by := 'customer';
    elsif is_courier then
      -- Le livreur décline la course avant que le restaurant ne l'accepte.
      if current_order.status <> 'placed' then
        raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
      end if;
      v_cancelled_by := 'courier';
    else
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
  elsif p_status = 'expired' then
    if current_order.status not in ('pending_payment', 'placed') then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    v_cancelled_by := 'system';
  elsif p_status = 'delivered' then
    if not is_courier then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if current_order.status <> 'out_for_delivery' then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    if trim(coalesce(p_pickup_code, '')) <> current_order.delivery_code then
      raise exception 'invalid_delivery_code' using errcode = '22023';
    end if;
  else
    if not is_owner then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if not (
      (current_order.status = 'placed' and p_status in ('accepted', 'refused'))
      or (current_order.status = 'accepted' and p_status in ('preparing', 'ready'))
      or (current_order.status = 'preparing' and p_status = 'ready')
      or (current_order.status = 'ready' and current_order.fulfillment = 'pickup' and p_status = 'collected')
      or (current_order.status = 'ready' and current_order.fulfillment = 'delivery' and p_status = 'out_for_delivery')
    ) then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    if p_status = 'refused' then
      v_cancelled_by := 'merchant';
    end if;
  end if;

  if p_status = 'accepted' and (p_prep_minutes is null or p_prep_minutes not between 1 and 180) then
    raise exception 'prep_minutes_required' using errcode = '22023';
  end if;

  if p_status = 'accepted' and current_order.fulfillment = 'delivery' and current_order.courier_accepted_at is null then
    raise exception 'courier_not_confirmed' using errcode = '22023';
  end if;

  -- Retrait par le client ou remise au livreur : code de retrait de la commande.
  if p_status in ('collected', 'out_for_delivery')
     and upper(trim(coalesce(p_pickup_code, ''))) <> current_order.pickup_code then
    raise exception 'invalid_pickup_code' using errcode = '22023';
  end if;

  update public.orders
  set status              = p_status,
      prep_minutes        = case when p_status = 'accepted' then p_prep_minutes else prep_minutes end,
      accepted_at         = case when p_status = 'accepted' then now() else accepted_at end,
      paid_at             = case when p_status = 'accepted' and stripe_payment_intent_id is not null then now()
                                 else paid_at end,
      delivery_paid_at    = case when p_status = 'accepted' and delivery_payment_intent_id is not null then now()
                                 else delivery_paid_at end,
      estimated_ready_at  = case when p_status = 'accepted' then now() + make_interval(mins => p_prep_minutes)
                                 else estimated_ready_at end,
      refusal_reason      = case when p_status = 'refused' then nullif(trim(p_refusal_reason), '') else refusal_reason end,
      cancelled_at        = case when p_status in ('refused', 'cancelled', 'expired') then now() else cancelled_at end,
      cancelled_by        = coalesce(v_cancelled_by, cancelled_by),
      ready_at            = case when p_status = 'ready' then now() else ready_at end,
      collected_at        = case when p_status = 'collected' then now() else collected_at end,
      out_for_delivery_at = case when p_status = 'out_for_delivery' then now() else out_for_delivery_at end,
      delivered_at        = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_order_id
  returning * into updated;

  return updated;
end;
$$;

revoke execute on function public.apply_order_transition from public, anon, authenticated;
grant execute on function public.apply_order_transition to service_role;

-- Transitions du commerçant sans paiement : préparation, prête, remise (au client ou au livreur).
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
begin
  if p_status not in ('preparing', 'ready', 'collected', 'out_for_delivery') then
    raise exception 'payment_action_required' using errcode = '22023';
  end if;
  return public.apply_order_transition(p_order_id, auth.uid(), p_status, p_prep_minutes, p_refusal_reason, p_pickup_code);
end;
$$;

-- Le livreur remet la commande : le client lui donne son code de livraison.
create or replace function public.courier_mark_delivered(p_order_id uuid, p_delivery_code text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.apply_order_transition(p_order_id, auth.uid(), 'delivered', p_pickup_code => p_delivery_code);
end;
$$;

revoke execute on function public.courier_mark_delivered from public, anon;
grant execute on function public.courier_mark_delivered to authenticated;

-- =============================================================================
-- Expiration et effacement des adresses
-- =============================================================================

-- Renvoie maintenant aussi le paiement de la course, à libérer chez Stripe.
drop function public.expire_stale_orders(int, int);

create or replace function public.expire_stale_orders(p_placed_minutes int default 10, p_pending_minutes int default 30)
returns table (
  order_id uuid,
  stripe_account_id text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  courier_stripe_account_id text,
  delivery_payment_intent_id text,
  delivery_checkout_session_id text
)
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set status = case when o.status = 'placed' then 'expired'::public.order_status else 'cancelled'::public.order_status end,
      cancelled_at = now(),
      cancelled_by = 'system'
  where (o.status = 'placed' and o.placed_at < now() - make_interval(mins => p_placed_minutes))
     or (o.status = 'pending_payment' and o.created_at < now() - make_interval(mins => p_pending_minutes))
  returning o.id, o.stripe_account_id, o.stripe_payment_intent_id, o.stripe_checkout_session_id,
            o.courier_stripe_account_id, o.delivery_payment_intent_id, o.delivery_checkout_session_id;
$$;

-- RGPD : l'adresse précise, le téléphone et les instructions ne servent qu'à la course.
-- Effacés p_days jours après la fin de la commande (la ville et le code postal restent).
create or replace function public.purge_delivery_details(p_days int default 7)
returns int
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.orders
    set delivery_address_line = null,
        delivery_latitude = null,
        delivery_longitude = null,
        delivery_phone = null,
        delivery_instructions = null
    where fulfillment = 'delivery'
      and (delivery_address_line is not null or delivery_phone is not null or delivery_latitude is not null)
      and status in ('delivered', 'refused', 'expired', 'cancelled')
      and coalesce(delivered_at, cancelled_at, updated_at) < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*)::int from purged;
$$;

revoke execute on function public.expire_stale_orders, public.purge_delivery_details from public, anon, authenticated;
grant execute on function public.expire_stale_orders, public.purge_delivery_details to service_role;

-- =============================================================================
-- Fidélité, chiffre d'affaires, « Je pars maintenant », notifications
-- =============================================================================

-- Les menus d'une commande livrée comptent à la livraison, comme au retrait.
create or replace function public.apply_loyalty_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menus int;
  v_total int;
begin
  if new.customer_id is null or new.status = old.status then
    return new;
  end if;

  if new.status in ('collected', 'delivered') and not new.loyalty_counted then
    select coalesce(sum(quantity), 0) into v_menus
    from public.order_items
    where order_id = new.id and is_loyalty_menu and not is_loyalty_reward;

    insert into public.loyalty_cards (user_id, merchant_id)
    values (new.customer_id, new.merchant_id)
    on conflict do nothing;

    select paid_menus_count + v_menus into v_total
    from public.loyalty_cards
    where user_id = new.customer_id and merchant_id = new.merchant_id
    for update;

    update public.loyalty_cards
    set paid_menus_count = v_total % 9,
        rewards_available = rewards_available + v_total / 9,
        rewards_redeemed = rewards_redeemed + case when new.is_loyalty_reward then 1 else 0 end
    where user_id = new.customer_id and merchant_id = new.merchant_id;

    new.loyalty_counted := true;
  elsif new.status in ('refused', 'cancelled', 'expired') and new.is_loyalty_reward
        and old.status in ('pending_payment', 'placed') then
    update public.loyalty_cards
    set rewards_available = rewards_available + 1
    where user_id = new.customer_id and merchant_id = new.merchant_id;
  end if;

  return new;
end;
$$;

-- Chiffre d'affaires du restaurant : le repas seulement (la course revient au livreur).
create or replace function public.merchant_today_summary(p_merchant_id uuid)
returns table (orders_count int, revenue_cents bigint, pending_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where o.status in ('accepted', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered'))::int,
    coalesce(sum(o.total_cents) filter (where o.status in ('accepted', 'preparing', 'ready', 'collected',
                                                           'out_for_delivery', 'delivered')), 0)::bigint,
    count(*) filter (where o.status = 'placed')::int
  from public.orders o
  join public.merchants m on m.id = o.merchant_id
  where o.merchant_id = p_merchant_id
    and public.is_merchant_owner(p_merchant_id)
    and (o.created_at at time zone m.timezone)::date = (now() at time zone m.timezone)::date;
$$;

-- « Je pars maintenant » ne concerne que le retrait.
create or replace function public.set_customer_departure(
  p_order_id uuid,
  p_customer_id uuid,
  p_travel_seconds int,
  p_mode public.travel_mode
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set customer_departed_at = now(),
      customer_eta_at = now() + make_interval(secs => greatest(p_travel_seconds, 0)),
      customer_travel_mode = p_mode
  where id = p_order_id
    and customer_id = p_customer_id
    and fulfillment = 'pickup'
    and status in ('placed', 'accepted', 'preparing', 'ready')
  returning * into v_order;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return v_order;
end;
$$;

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  -- pending_payment n'intéresse personne ; preparing et collected sont visibles dans l'app.
  if new.status in ('placed', 'accepted', 'ready', 'out_for_delivery', 'delivered', 'refused', 'expired', 'cancelled') then
    perform public.call_internal_function(
      'notify-order-update',
      jsonb_build_object(
        'order_id', new.id,
        'status', new.status,
        'previous_status', case when tg_op = 'UPDATE' then old.status end
      )
    );
  end if;
  return null;
end;
$$;

-- =============================================================================
-- Suppression de compte
-- =============================================================================

-- Un livreur ne peut pas supprimer son compte pendant une course, ni tant que son
-- abonnement court (à résilier d'abord depuis le portail Stripe).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_courier uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.merchants where owner_id = uid) then
    raise exception 'merchant_owner_cannot_delete' using errcode = '23503';
  end if;
  select id into v_courier from public.couriers where user_id = uid;
  if v_courier is not null then
    if public.is_courier_busy(v_courier) then
      raise exception 'courier_has_active_delivery' using errcode = '23503';
    end if;
    if exists (select 1 from public.courier_subscriptions
               where courier_id = v_courier and status in ('trialing', 'active', 'past_due')
                 and not cancel_at_period_end) then
      raise exception 'courier_subscription_active' using errcode = '23503';
    end if;
  end if;
  delete from auth.users where id = uid;
end;
$$;

-- RGPD : un client qui supprime son compte efface aussi ses adresses de livraison
-- (commandes terminées ; une course en cours garde l'adresse jusqu'à la livraison).
create or replace function public.anonymize_orders_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set customer_name = null where customer_id = old.id;
  update public.orders
  set delivery_address_line = null, delivery_latitude = null, delivery_longitude = null,
      delivery_phone = null, delivery_instructions = null
  where customer_id = old.id
    and status in ('collected', 'delivered', 'refused', 'expired', 'cancelled');
  return old;
end;
$$;

-- Un livreur qui supprime son compte n'apparaît plus sur les commandes passées.
create or replace function public.anonymize_orders_on_courier_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders set courier_name = null where courier_id = old.id;
  return old;
end;
$$;

create trigger couriers_anonymize_orders
  before delete on public.couriers
  for each row execute function public.anonymize_orders_on_courier_delete();
