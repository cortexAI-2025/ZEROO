-- Paniers anti-gaspi : une fonction complémentaire, incluse dans Start et Pro (jamais le
-- positionnement principal de ZeeRoo).
--
--  * Le commerçant propose un nombre de paniers à un prix, au contenu connu ou « surprise », avec un
--    créneau de retrait et les informations d'allergènes.
--  * Le client réserve (au plus 3 paniers actifs par offre) et règle **au retrait**, directement au
--    commerçant : ZeeRoo n'encaisse rien et n'a donc rien à rembourser.
--  * Le stock est protégé par un verrou : deux réservations simultanées ne dépassent jamais le
--    nombre de paniers. Une annulation libère le stock.
--  * L'offre se ferme toute seule à la fin du créneau ; les réservations non retirées expirent.

create table public.surprise_baskets (
  id                    uuid primary key default gen_random_uuid(),
  merchant_id           uuid not null references public.merchants (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 60),
  contents              text check (char_length(contents) <= 300),   -- contenu connu ; vide pour un panier surprise
  is_surprise           boolean not null default true,
  price_cents           int  not null check (price_cents between 100 and 20000),
  estimated_value_cents int  check (estimated_value_cents >= price_cents),  -- valeur indicative, facultative
  quantity_total        int  not null check (quantity_total between 1 and 500),
  quantity_reserved     int  not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_total),
  -- Les 14 allergènes à déclaration obligatoire (règlement UE 1169/2011).
  allergens             text[] not null default '{}'
    check (allergens <@ array['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts',
                              'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']::text[]),
  allergens_confirmed   boolean not null default false,  -- le commerçant certifie l'exactitude de l'information
  pickup_starts_at      timestamptz not null,
  pickup_ends_at        timestamptz not null,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (id, merchant_id),
  check (pickup_ends_at > pickup_starts_at and pickup_ends_at <= pickup_starts_at + interval '12 hours'),
  check (is_surprise or contents is not null),
  check (not is_active or allergens_confirmed)
);

create index surprise_baskets_merchant_idx on public.surprise_baskets (merchant_id, pickup_ends_at);

create table public.basket_reservations (
  id               uuid primary key default gen_random_uuid(),
  basket_id        uuid not null,
  merchant_id      uuid not null,
  customer_id      uuid references public.profiles (id) on delete set null,
  customer_name    text,
  quantity         int  not null check (quantity between 1 and 3),
  unit_price_cents int  not null check (unit_price_cents >= 0),  -- prix au moment de la réservation
  pickup_code      text not null default public.generate_pickup_code(),
  status           text not null default 'reserved' check (status in ('reserved', 'collected', 'cancelled', 'expired')),
  cancelled_by     text check (cancelled_by in ('customer', 'merchant', 'system')),
  created_at       timestamptz not null default now(),
  collected_at     timestamptz,
  cancelled_at     timestamptz,
  foreign key (basket_id, merchant_id) references public.surprise_baskets (id, merchant_id) on delete cascade
);

create index basket_reservations_basket_idx on public.basket_reservations (basket_id, status);
create index basket_reservations_customer_idx on public.basket_reservations (customer_id, created_at desc);

-- Lecture : paniers ouverts d'un commerce publié (tous pour le propriétaire) ; réservations : le client
-- et le commerçant concernés. Aucune écriture directe : tout passe par les fonctions ci-dessous.
alter table public.surprise_baskets enable row level security;
alter table public.basket_reservations enable row level security;
revoke all on public.surprise_baskets, public.basket_reservations from anon, authenticated;
grant select on public.surprise_baskets to anon, authenticated;
grant select on public.basket_reservations to authenticated;

create policy "surprise_baskets: lecture des offres ouvertes ou par le propriétaire"
  on public.surprise_baskets for select
  to anon, authenticated
  using (
    (is_active and exists (select 1 from public.merchants m where m.id = merchant_id and m.is_published))
    or public.is_merchant_owner(merchant_id)
  );

create policy "basket_reservations: le client et le commerçant concernés"
  on public.basket_reservations for select
  to authenticated
  using (customer_id = (select auth.uid()) or public.is_merchant_owner(merchant_id));

-- Panier réservable maintenant : actif, créneau pas terminé, du stock (colonne calculée).
create or replace function public.is_reservable(b public.surprise_baskets)
returns boolean
language sql
stable
set search_path = ''
as $$
  select b.is_active and now() < b.pickup_ends_at and b.quantity_reserved < b.quantity_total;
$$;

grant execute on function public.is_reservable(public.surprise_baskets) to anon, authenticated;

-- Création / modification d'un panier.
--   p_data : { title, contents, is_surprise, price_cents, estimated_value_cents, quantity_total, allergens,
--              allergens_confirmed, pickup_starts_at, pickup_ends_at, is_active }
create or replace function public.save_basket(p_merchant_id uuid, p_id uuid, p_data jsonb)
returns public.surprise_baskets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket public.surprise_baskets;
  v_allergens text[];
  v_ends timestamptz := (p_data ->> 'pickup_ends_at')::timestamptz;
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid_basket' using errcode = '22023';
  end if;
  -- Une offre ne se crée pas dans le passé (on peut modifier une offre en cours).
  if p_id is null and v_ends <= now() then
    raise exception 'invalid_basket' using errcode = '22023';
  end if;
  v_allergens := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'allergens', '[]')) x), '{}');

  if p_id is null then
    insert into public.surprise_baskets (merchant_id, title, contents, is_surprise, price_cents,
                                         estimated_value_cents, quantity_total, allergens, allergens_confirmed,
                                         pickup_starts_at, pickup_ends_at, is_active)
    values (p_merchant_id, trim(p_data ->> 'title'), nullif(trim(p_data ->> 'contents'), ''),
            coalesce((p_data ->> 'is_surprise')::boolean, true), (p_data ->> 'price_cents')::int,
            (p_data ->> 'estimated_value_cents')::int, (p_data ->> 'quantity_total')::int, v_allergens,
            coalesce((p_data ->> 'allergens_confirmed')::boolean, false),
            (p_data ->> 'pickup_starts_at')::timestamptz, v_ends, coalesce((p_data ->> 'is_active')::boolean, true))
    returning * into v_basket;
  else
    -- Le stock ne peut pas descendre sous ce qui est déjà réservé (vérifié par la contrainte de la table).
    update public.surprise_baskets
    set title = trim(p_data ->> 'title'), contents = nullif(trim(p_data ->> 'contents'), ''),
        is_surprise = coalesce((p_data ->> 'is_surprise')::boolean, true), price_cents = (p_data ->> 'price_cents')::int,
        estimated_value_cents = (p_data ->> 'estimated_value_cents')::int,
        quantity_total = (p_data ->> 'quantity_total')::int, allergens = v_allergens,
        allergens_confirmed = coalesce((p_data ->> 'allergens_confirmed')::boolean, false),
        pickup_starts_at = (p_data ->> 'pickup_starts_at')::timestamptz, pickup_ends_at = v_ends,
        is_active = coalesce((p_data ->> 'is_active')::boolean, true)
    where id = p_id and merchant_id = p_merchant_id
    returning * into v_basket;
    if v_basket.id is null then
      raise exception 'basket_not_found' using errcode = 'P0002';
    end if;
  end if;
  return v_basket;
end;
$$;

create or replace function public.set_basket_active(p_id uuid, p_active boolean)
returns public.surprise_baskets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket public.surprise_baskets;
begin
  update public.surprise_baskets b set is_active = p_active
  where b.id = p_id and public.is_merchant_owner(b.merchant_id)
  returning * into v_basket;
  if v_basket.id is null then
    raise exception 'basket_not_found' using errcode = 'P0002';
  end if;
  return v_basket;
end;
$$;

-- Réserver : verrou sur le panier, stock et limite par client vérifiés sous verrou.
create or replace function public.reserve_basket(p_basket_id uuid, p_quantity int default 1)
returns public.basket_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_basket public.surprise_baskets;
  v_merchant public.merchants;
  v_already int;
  v_reservation public.basket_reservations;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity not between 1 and 3 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select * into v_basket from public.surprise_baskets where id = p_basket_id for update;
  if v_basket.id is null then
    raise exception 'basket_not_found' using errcode = 'P0002';
  end if;
  select * into v_merchant from public.merchants where id = v_basket.merchant_id;
  if not v_merchant.is_published or not public.is_subscription_active(v_merchant)
     or not v_basket.is_active or not v_basket.allergens_confirmed or now() >= v_basket.pickup_ends_at then
    raise exception 'basket_closed' using errcode = '22023';
  end if;

  select coalesce(sum(quantity), 0) into v_already
  from public.basket_reservations
  where basket_id = p_basket_id and customer_id = auth.uid() and status = 'reserved';
  if v_already + p_quantity > 3 then
    raise exception 'basket_limit' using errcode = '22023';
  end if;
  if v_basket.quantity_reserved + p_quantity > v_basket.quantity_total then
    raise exception 'basket_sold_out' using errcode = '22023';
  end if;

  update public.surprise_baskets set quantity_reserved = quantity_reserved + p_quantity where id = p_basket_id;
  insert into public.basket_reservations (basket_id, merchant_id, customer_id, customer_name, quantity, unit_price_cents)
  values (p_basket_id, v_basket.merchant_id, auth.uid(),
          (select display_name from public.profiles where id = auth.uid()), p_quantity, v_basket.price_cents)
  returning * into v_reservation;
  return v_reservation;
end;
$$;

-- Annuler : le client jusqu'au début du créneau, le commerçant à tout moment avant le retrait.
-- Le stock est libéré.
create or replace function public.cancel_basket_reservation(p_id uuid)
returns public.basket_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.basket_reservations;
  v_basket public.surprise_baskets;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_res from public.basket_reservations where id = p_id for update;
  if v_res.id is null then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  select * into v_basket from public.surprise_baskets where id = v_res.basket_id for update;

  if v_res.customer_id = auth.uid() then
    v_actor := 'customer';
  elsif public.is_merchant_owner(v_res.merchant_id) then
    v_actor := 'merchant';
  else
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'reservation_not_cancellable' using errcode = '22023';
  end if;
  if v_actor = 'customer' and now() >= v_basket.pickup_starts_at then
    raise exception 'basket_cancel_too_late' using errcode = '22023';
  end if;

  update public.basket_reservations
  set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now()
  where id = p_id returning * into v_res;
  update public.surprise_baskets
  set quantity_reserved = greatest(quantity_reserved - v_res.quantity, 0)
  where id = v_res.basket_id;
  return v_res;
end;
$$;

-- Remise du panier : le commerçant saisit le code du client, pendant le créneau (+ 30 min de grâce).
create or replace function public.collect_basket_reservation(p_id uuid, p_code text)
returns public.basket_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.basket_reservations;
  v_basket public.surprise_baskets;
begin
  select * into v_res from public.basket_reservations where id = p_id for update;
  if v_res.id is null or not public.is_merchant_owner(v_res.merchant_id) then
    raise exception 'reservation_not_found' using errcode = 'P0002';
  end if;
  if v_res.status <> 'reserved' then
    raise exception 'reservation_not_cancellable' using errcode = '22023';
  end if;
  if upper(trim(p_code)) <> v_res.pickup_code then
    raise exception 'invalid_pickup_code' using errcode = '22023';
  end if;
  select * into v_basket from public.surprise_baskets where id = v_res.basket_id;
  if now() < v_basket.pickup_starts_at - interval '15 minutes' or now() > v_basket.pickup_ends_at + interval '30 minutes' then
    raise exception 'basket_outside_window' using errcode = '22023';
  end if;
  update public.basket_reservations set status = 'collected', collected_at = now()
  where id = p_id returning * into v_res;
  return v_res;
end;
$$;

revoke execute on function public.save_basket, public.set_basket_active, public.reserve_basket,
  public.cancel_basket_reservation, public.collect_basket_reservation from public, anon;
grant execute on function public.save_basket, public.set_basket_active, public.reserve_basket,
  public.cancel_basket_reservation, public.collect_basket_reservation to authenticated;

-- Fermeture automatique : une réservation non retirée 30 minutes après la fin du créneau expire
-- (le panier n'est plus proposé, son stock n'est pas remis en vente).
create or replace function public.expire_basket_reservations()
returns int
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.basket_reservations r
    set status = 'expired', cancelled_by = 'system', cancelled_at = now()
    from public.surprise_baskets b
    where r.basket_id = b.id and r.status = 'reserved' and now() > b.pickup_ends_at + interval '30 minutes'
    returning 1
  )
  select count(*)::int from expired;
$$;

revoke execute on function public.expire_basket_reservations from public, anon, authenticated;
grant execute on function public.expire_basket_reservations to service_role;

select cron.schedule('expire-basket-reservations', '*/10 * * * *', 'select public.expire_basket_reservations()');

-- RGPD : le nom du client est effacé avec son compte (la réservation est conservée, anonymisée).
create or replace function public.anonymize_reservations_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.basket_reservations set customer_name = null where customer_id = old.id;
  return old;
end;
$$;

create trigger profiles_anonymize_reservations
  before delete on public.profiles
  for each row execute function public.anonymize_reservations_on_profile_delete();
