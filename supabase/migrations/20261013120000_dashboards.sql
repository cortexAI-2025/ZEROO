-- Tableaux de bord (maquette ZeeRoo) :
--   1. informations de l'entreprise du restaurant (raison sociale, SIRET, TVA, e-mail) ;
--   2. zone de travail du livreur ;
--   3. avis après commande : le client note le restaurant et, pour une livraison, le livreur ;
--   4. adresses enregistrées et restaurants favoris du client ;
--   5. statistiques : ventes par jour et meilleurs produits (restaurant), gains par jour (livreur).

-- 1. Entreprise du restaurant ------------------------------------------------------------
-- Ces informations sont publiques (mentions légales du vendeur), comme le reste de la fiche.
alter table public.merchants
  add column legal_name    text check (char_length(legal_name) between 2 and 120),
  add column siret         text check (siret is null or public.is_valid_siret(siret)),
  add column vat_number    text check (vat_number ~ '^FR[0-9A-Z]{2}[0-9]{9}$'),
  add column contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 120);

grant update (legal_name, siret, vat_number, contact_email) on public.merchants to authenticated;

-- 2. Zone du livreur ---------------------------------------------------------------------
alter table public.couriers
  add column work_zone text check (char_length(work_zone) <= 80);

grant update (work_zone) on public.couriers to authenticated;

-- 3. Avis -----------------------------------------------------------------------------------
create table public.order_reviews (
  order_id       uuid primary key references public.orders (id) on delete cascade,
  merchant_id    uuid not null references public.merchants (id) on delete cascade,
  courier_id     uuid references public.couriers (id) on delete set null,
  customer_id    uuid references public.profiles (id) on delete set null,
  merchant_stars int check (merchant_stars between 1 and 5),
  courier_stars  int check (courier_stars between 1 and 5),
  comment        text check (char_length(comment) <= 300),
  created_at     timestamptz not null default now(),
  check (merchant_stars is not null or courier_stars is not null),
  check (courier_stars is null or courier_id is not null)
);

create index order_reviews_merchant_idx on public.order_reviews (merchant_id, created_at desc);
create index order_reviews_courier_idx on public.order_reviews (courier_id, created_at desc);

alter table public.order_reviews enable row level security;
revoke all on public.order_reviews from anon, authenticated;
grant select on public.order_reviews to authenticated;  -- écriture : submit_order_review()

create policy "order_reviews: le client voit ses avis"
  on public.order_reviews for select to authenticated
  using (customer_id = (select auth.uid()));

create policy "order_reviews: le restaurant voit ses avis"
  on public.order_reviews for select to authenticated
  using (public.is_merchant_owner(merchant_id));

create policy "order_reviews: le livreur voit ses avis"
  on public.order_reviews for select to authenticated
  using (courier_id is not null and courier_id = public.current_courier_id());

-- Le client note une commande terminée (retirée ou livrée), une seule fois. La note du livreur
-- n'existe que pour une livraison.
create or replace function public.submit_order_review(
  p_order_id uuid,
  p_merchant_stars int default null,
  p_courier_stars int default null,
  p_comment text default null
)
returns public.order_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_review public.order_reviews;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or v_order.customer_id is distinct from (select auth.uid()) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('collected', 'delivered') then
    raise exception 'order_not_finished' using errcode = 'P0001';
  end if;
  if p_merchant_stars is null and p_courier_stars is null then
    raise exception 'review_empty' using errcode = 'P0001';
  end if;
  if p_courier_stars is not null and v_order.courier_id is null then
    raise exception 'review_no_courier' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.order_reviews where order_id = p_order_id) then
    raise exception 'review_exists' using errcode = 'P0001';
  end if;

  insert into public.order_reviews (order_id, merchant_id, courier_id, customer_id,
                                    merchant_stars, courier_stars, comment)
  values (p_order_id, v_order.merchant_id, v_order.courier_id, v_order.customer_id,
          p_merchant_stars, p_courier_stars, nullif(btrim(p_comment), ''))
  returning * into v_review;
  return v_review;
end;
$$;

revoke execute on function public.submit_order_review from public, anon;
grant execute on function public.submit_order_review to authenticated;

-- Notes publiques des restaurants (liste et fiche), sans les commentaires.
create or replace function public.merchant_ratings(p_merchant_ids uuid[])
returns table (merchant_id uuid, average numeric, reviews_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select r.merchant_id, round(avg(r.merchant_stars), 1), count(*)::int
  from public.order_reviews r
  join public.merchants m on m.id = r.merchant_id and m.is_published
  where r.merchant_id = any (p_merchant_ids) and r.merchant_stars is not null
  group by r.merchant_id;
$$;

revoke execute on function public.merchant_ratings from public;
grant execute on function public.merchant_ratings to anon, authenticated;

-- Note du livreur connecté : moyenne, nombre d'avis et répartition par étoiles.
create or replace function public.courier_rating_summary()
returns table (average numeric, reviews_count int, stars_1 int, stars_2 int, stars_3 int,
               stars_4 int, stars_5 int)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(courier_stars), 2), count(*)::int,
         (count(*) filter (where courier_stars = 1))::int,
         (count(*) filter (where courier_stars = 2))::int,
         (count(*) filter (where courier_stars = 3))::int,
         (count(*) filter (where courier_stars = 4))::int,
         (count(*) filter (where courier_stars = 5))::int
  from public.order_reviews
  where courier_id = public.current_courier_id() and courier_stars is not null;
$$;

revoke execute on function public.courier_rating_summary from public, anon;
grant execute on function public.courier_rating_summary to authenticated;

-- 4. Adresses et favoris du client --------------------------------------------------------
create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 40),
  address_line  text not null check (char_length(address_line) between 3 and 200),
  postal_code   text not null check (postal_code ~ '^\d{5}$'),
  city          text not null check (char_length(city) between 1 and 100),
  latitude      double precision not null check (latitude between -90 and 90),
  longitude     double precision not null check (longitude between -180 and 180),
  instructions  text check (char_length(instructions) <= 200),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index customer_addresses_user_idx on public.customer_addresses (user_id);
-- Une seule adresse par défaut par client.
create unique index customer_addresses_one_default on public.customer_addresses (user_id) where is_default;

-- Au plus 10 adresses par client.
create or replace function public.limit_customer_addresses()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.customer_addresses where user_id = new.user_id) >= 10 then
    raise exception 'too_many_addresses' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger customer_addresses_limit
  before insert on public.customer_addresses
  for each row execute function public.limit_customer_addresses();

alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from anon, authenticated;
grant select, insert, delete on public.customer_addresses to authenticated;
grant update (label, address_line, postal_code, city, latitude, longitude, instructions, is_default)
  on public.customer_addresses to authenticated;

create policy "customer_addresses: le client gère ses adresses"
  on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Choisit l'adresse par défaut (et retire l'ancienne) en une opération.
create or replace function public.set_default_address(p_address_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.customer_addresses
                 where id = p_address_id and user_id = (select auth.uid())) then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  update public.customer_addresses set is_default = false
  where user_id = (select auth.uid()) and is_default and id <> p_address_id;
  update public.customer_addresses set is_default = true where id = p_address_id;
end;
$$;

revoke execute on function public.set_default_address from public, anon;
grant execute on function public.set_default_address to authenticated;

create table public.customer_favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, merchant_id)
);

alter table public.customer_favorites enable row level security;
revoke all on public.customer_favorites from anon, authenticated;
grant select, insert, delete on public.customer_favorites to authenticated;

create policy "customer_favorites: le client gère ses favoris"
  on public.customer_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 5. Statistiques ------------------------------------------------------------------------
-- Ventes encaissées par jour (heure du commerce), jours sans vente compris.
create or replace function public.merchant_sales_by_day(p_merchant_id uuid, p_days int default 7)
returns table (day date, orders_count int, revenue_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select id, timezone from public.merchants
    where id = p_merchant_id and public.is_merchant_owner(p_merchant_id)
  ), days as (
    select (now() at time zone m.timezone)::date - g as day, m.id, m.timezone
    from m, generate_series(0, least(greatest(p_days, 1), 90) - 1) g
  )
  select d.day,
         (count(o.id))::int,
         coalesce(sum(o.total_cents), 0)::bigint
  from days d
  left join public.orders o
    on o.merchant_id = d.id
   and o.status in ('accepted', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered')
   and (o.created_at at time zone d.timezone)::date = d.day
  group by d.day
  order by d.day;
$$;

-- Produits les plus vendus sur la période.
create or replace function public.merchant_top_items(p_merchant_id uuid, p_days int default 30)
returns table (name text, quantity bigint, revenue_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select i.name, sum(i.quantity)::bigint, sum(i.line_total_cents)::bigint
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.merchant_id = p_merchant_id
    and public.is_merchant_owner(p_merchant_id)
    and o.status in ('accepted', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered')
    and o.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
  group by i.name
  order by 2 desc, 3 desc
  limit 5;
$$;

-- Gains du livreur connecté par jour, séparés carte / espèces.
create or replace function public.courier_earnings_by_day(p_days int default 7)
returns table (day date, runs_count int, card_cents bigint, cash_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select (now() at time zone 'Europe/Paris')::date - g as day
    from generate_series(0, least(greatest(p_days, 1), 90) - 1) g
  )
  select d.day,
         (count(o.id))::int,
         coalesce(sum(o.delivery_fee_cents) filter (where o.delivery_payment_method = 'card'), 0)::bigint,
         coalesce(sum(o.delivery_fee_cents) filter (where o.delivery_payment_method = 'cash'), 0)::bigint
  from days d
  left join public.orders o
    on o.courier_id = public.current_courier_id()
   and o.status = 'delivered'
   and (o.delivered_at at time zone 'Europe/Paris')::date = d.day
  group by d.day
  order by d.day;
$$;

revoke execute on function public.merchant_sales_by_day, public.merchant_top_items,
  public.courier_earnings_by_day from public, anon;
grant execute on function public.merchant_sales_by_day, public.merchant_top_items,
  public.courier_earnings_by_day to authenticated;
