-- Happy Hours : promotions programmées (incluses dans Start et Pro, sans commission).
--
--  * Une offre : nom, produits ou formules concernés, réduction en pourcentage ou prix promotionnel
--    par produit, jours et plages horaires (passage de minuit possible), période de validité,
--    quantité maximale facultative, application au retrait, à la livraison ou aux deux.
--  * Règles de prix côté serveur uniquement (`active_happy_hours`, `create_order`) :
--      - une seule offre par produit, jamais cumulée ; chevauchement : le prix le plus bas gagne,
--        puis l'offre la plus ancienne ;
--      - la réduction porte sur le prix du produit, pas sur les suppléments ;
--      - le menu offert de la fidélité reste au plein tarif (il remplace l'offre, il ne s'y ajoute pas) ;
--      - quota verrouillé : deux commandes simultanées ne dépassent jamais le stock ; au-delà du stock
--        restant, le reste de la ligne est au tarif habituel ;
--      - le prix annoncé au client (`expected_total_cents`) est revérifié : s'il a changé (offre
--        terminée, stock épuisé, prix modifié) la commande est refusée (`price_changed`) ;
--      - le prix appliqué et le tarif habituel sont conservés dans la commande.
--  * Le quota est rendu quand une commande est refusée, expirée ou annulée.

create table public.happy_hours (
  id                  uuid primary key default gen_random_uuid(),
  merchant_id         uuid not null references public.merchants (id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 60),
  discount_type       text not null check (discount_type in ('percent', 'price')),
  percent_off         smallint check (percent_off between 1 and 90),
  starts_on           date,
  ends_on             date,
  applies_to_pickup   boolean not null default true,
  applies_to_delivery boolean not null default true,
  quantity_limit      int check (quantity_limit between 1 and 100000),
  quantity_used       int not null default 0 check (quantity_used >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  unique (id, merchant_id),
  check ((discount_type = 'percent') = (percent_off is not null)),
  check (starts_on is null or ends_on is null or ends_on >= starts_on),
  check (applies_to_pickup or applies_to_delivery)
);

create index happy_hours_merchant_idx on public.happy_hours (merchant_id);

create table public.happy_hour_slots (
  id            uuid primary key default gen_random_uuid(),
  happy_hour_id uuid not null,
  merchant_id   uuid not null,
  weekday       smallint not null check (weekday between 1 and 7),  -- ISO : 1 = lundi
  starts_at     time not null,
  ends_at       time not null,                                      -- < starts_at = passe minuit
  check (starts_at <> ends_at),
  foreign key (happy_hour_id, merchant_id) references public.happy_hours (id, merchant_id) on delete cascade
);

create index happy_hour_slots_offer_idx on public.happy_hour_slots (happy_hour_id);

create table public.happy_hour_items (
  happy_hour_id    uuid not null,
  merchant_id      uuid not null,
  item_id          uuid not null,
  promo_price_cents int check (promo_price_cents >= 0),   -- renseigné pour une offre « prix »
  primary key (happy_hour_id, item_id),
  foreign key (happy_hour_id, merchant_id) references public.happy_hours (id, merchant_id) on delete cascade,
  foreign key (item_id, merchant_id) references public.menu_items (id, merchant_id) on delete cascade
);

create index happy_hour_items_item_idx on public.happy_hour_items (item_id);

-- Lecture publique si le commerce est publié ; écriture uniquement par les fonctions ci-dessous.
do $$
declare
  t text;
begin
  foreach t in array array['happy_hours', 'happy_hour_slots', 'happy_hour_items']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format($p$
      create policy "%1$s: lecture si commerce publié ou propriétaire"
        on public.%1$I for select
        to anon, authenticated
        using (
          exists (select 1 from public.merchants m where m.id = merchant_id and m.is_published)
          or public.is_merchant_owner(merchant_id)
        )$p$, t);
  end loop;
end;
$$;

-- Tarif conservé dans la commande.
alter table public.order_items
  add column regular_unit_cents int check (regular_unit_cents >= 0),  -- tarif habituel (avant offre)
  add column happy_hour_id      uuid references public.happy_hours (id) on delete set null,
  add column happy_hour_name    text;

-- Offres en vigueur à un instant donné, au plus une par produit (la meilleure).
--   p_mode : 'pickup' ou 'delivery'. Seules les vraies réductions et les offres avec du stock restant.
create or replace function public.active_happy_hours(p_merchant_id uuid, p_mode text, p_at timestamptz default now())
returns table (
  happy_hour_id uuid,
  name text,
  item_id uuid,
  regular_cents int,
  promo_cents int,
  ends_at timestamptz,
  quantity_remaining int
)
language sql
stable
security definer
set search_path = ''
as $$
  with parts as (
    select m.id, m.timezone,
           (p_at at time zone m.timezone)::date as d,
           (p_at at time zone m.timezone)::time as t,
           extract(isodow from (p_at at time zone m.timezone))::smallint as dow
    from public.merchants m
    where m.id = p_merchant_id and m.is_published
  ),
  candidates as (
    select h.id as hh_id, h.name as hh_name, hi.item_id as it_id, i.price_cents as regular,
           case h.discount_type
             when 'percent' then round(i.price_cents * (100 - h.percent_off) / 100.0)::int
             else hi.promo_price_cents
           end as promo,
           h.created_at, h.quantity_limit, h.quantity_used, h.ends_on, w.window_end, p.timezone
    from parts p
    join public.happy_hours h on h.merchant_id = p.id and h.is_active
    join public.happy_hour_items hi on hi.happy_hour_id = h.id
    join public.menu_items i on i.id = hi.item_id and i.is_available
    cross join lateral (
      -- Fin de la plage en cours (le lendemain si elle passe minuit), en heure de l'établissement.
      select min(case
               when s.starts_at < s.ends_at then p.d + s.ends_at
               when p.t >= s.starts_at then (p.d + 1) + s.ends_at
               else p.d + s.ends_at
             end) as window_end
      from public.happy_hour_slots s
      where s.happy_hour_id = h.id
        and public.time_in_window(s.weekday, s.starts_at, s.ends_at, p.dow, p.t)
    ) w
    where w.window_end is not null
      and (h.starts_on is null or p.d >= h.starts_on)
      and (h.ends_on is null or p.d <= h.ends_on)
      and ((p_mode = 'pickup' and h.applies_to_pickup) or (p_mode = 'delivery' and h.applies_to_delivery))
      and (h.quantity_limit is null or h.quantity_used < h.quantity_limit)
  )
  select distinct on (c.it_id)
         c.hh_id, c.hh_name, c.it_id, c.regular, c.promo,
         least(c.window_end at time zone c.timezone,
               case when c.ends_on is not null then (c.ends_on + 1)::timestamp at time zone c.timezone end),
         case when c.quantity_limit is null then null else c.quantity_limit - c.quantity_used end
  from candidates c
  where c.promo is not null and c.promo < c.regular
  order by c.it_id, c.promo asc, c.created_at asc, c.hh_id asc;
$$;

grant execute on function public.active_happy_hours(uuid, text, timestamptz) to anon, authenticated;

-- Colonne calculée : l'établissement a au moins une offre en vigueur (filtre de l'annuaire).
create or replace function public.has_happy_hour_now(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.active_happy_hours(m.id, 'pickup'))
      or exists (select 1 from public.active_happy_hours(m.id, 'delivery'));
$$;

grant execute on function public.has_happy_hour_now(public.merchants) to anon, authenticated;

-- Création / modification d'une offre en une transaction.
--   p_data : { name, discount_type, percent_off, starts_on, ends_on, applies_to_pickup, applies_to_delivery,
--              quantity_limit, is_active,
--              slots: [{ weekday, starts_at, ends_at }], items: [{ item_id, promo_price_cents }] }
create or replace function public.save_happy_hour(p_merchant_id uuid, p_id uuid, p_data jsonb)
returns public.happy_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.happy_hours;
  v_item jsonb;
  v_price int;
  v_type text := p_data ->> 'discount_type';
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'slots') is distinct from 'array'
     or jsonb_array_length(p_data -> 'slots') not between 1 and 70
     or jsonb_typeof(p_data -> 'items') is distinct from 'array'
     or jsonb_array_length(p_data -> 'items') not between 1 and 60
     or v_type not in ('percent', 'price') then
    raise exception 'invalid_happy_hour' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.happy_hours (merchant_id, name, discount_type, percent_off, starts_on, ends_on,
                                    applies_to_pickup, applies_to_delivery, quantity_limit, is_active)
    values (p_merchant_id, trim(p_data ->> 'name'), v_type,
            case when v_type = 'percent' then (p_data ->> 'percent_off')::smallint end,
            (p_data ->> 'starts_on')::date, (p_data ->> 'ends_on')::date,
            coalesce((p_data ->> 'applies_to_pickup')::boolean, true),
            coalesce((p_data ->> 'applies_to_delivery')::boolean, true),
            (p_data ->> 'quantity_limit')::int, coalesce((p_data ->> 'is_active')::boolean, true))
    returning * into v_offer;
  else
    update public.happy_hours
    set name = trim(p_data ->> 'name'), discount_type = v_type,
        percent_off = case when v_type = 'percent' then (p_data ->> 'percent_off')::smallint end,
        starts_on = (p_data ->> 'starts_on')::date, ends_on = (p_data ->> 'ends_on')::date,
        applies_to_pickup = coalesce((p_data ->> 'applies_to_pickup')::boolean, true),
        applies_to_delivery = coalesce((p_data ->> 'applies_to_delivery')::boolean, true),
        quantity_limit = (p_data ->> 'quantity_limit')::int,
        is_active = coalesce((p_data ->> 'is_active')::boolean, true)
    where id = p_id and merchant_id = p_merchant_id
    returning * into v_offer;
    if v_offer.id is null then
      raise exception 'happy_hour_not_found' using errcode = 'P0002';
    end if;
    delete from public.happy_hour_slots where happy_hour_id = v_offer.id;
    delete from public.happy_hour_items where happy_hour_id = v_offer.id;
  end if;

  insert into public.happy_hour_slots (happy_hour_id, merchant_id, weekday, starts_at, ends_at)
  select v_offer.id, p_merchant_id, (s ->> 'weekday')::smallint, (s ->> 'starts_at')::time, (s ->> 'ends_at')::time
  from jsonb_array_elements(p_data -> 'slots') s;

  for v_item in select * from jsonb_array_elements(p_data -> 'items') loop
    select price_cents into v_price from public.menu_items
    where id = (v_item ->> 'item_id')::uuid and merchant_id = p_merchant_id;
    if v_price is null then
      raise exception 'invalid_happy_hour' using errcode = '22023';  -- produit d'un autre commerce
    end if;
    -- Une offre « prix » doit être une vraie réduction.
    if v_type = 'price' and ((v_item ->> 'promo_price_cents') is null
                             or (v_item ->> 'promo_price_cents')::int >= v_price) then
      raise exception 'invalid_happy_hour' using errcode = '22023';
    end if;
    insert into public.happy_hour_items (happy_hour_id, merchant_id, item_id, promo_price_cents)
    values (v_offer.id, p_merchant_id, (v_item ->> 'item_id')::uuid,
            case when v_type = 'price' then (v_item ->> 'promo_price_cents')::int end);
  end loop;

  return v_offer;
end;
$$;

create or replace function public.set_happy_hour_active(p_id uuid, p_active boolean)
returns public.happy_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.happy_hours;
begin
  update public.happy_hours h set is_active = p_active
  where h.id = p_id and public.is_merchant_owner(h.merchant_id)
  returning * into v_offer;
  if v_offer.id is null then
    raise exception 'happy_hour_not_found' using errcode = 'P0002';
  end if;
  return v_offer;
end;
$$;

create or replace function public.delete_happy_hour(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.happy_hours h where h.id = p_id and public.is_merchant_owner(h.merchant_id);
  if not found then
    raise exception 'happy_hour_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.save_happy_hour, public.set_happy_hour_active, public.delete_happy_hour
  from public, anon;
grant execute on function public.save_happy_hour, public.set_happy_hour_active, public.delete_happy_hour
  to authenticated;

-- Le stock d'une offre est rendu quand la commande est refusée, expirée ou annulée.
create or replace function public.release_happy_hour_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('refused', 'expired', 'cancelled') and old.status not in ('refused', 'expired', 'cancelled') then
    update public.happy_hours h
    set quantity_used = greatest(h.quantity_used - x.units, 0)
    from (
      select happy_hour_id, sum(quantity)::int as units
      from public.order_items
      where order_id = new.id and happy_hour_id is not null
      group by happy_hour_id
    ) x
    where h.id = x.happy_hour_id and h.quantity_limit is not null;
  end if;
  return null;
end;
$$;

create trigger orders_release_happy_hour_quota
  after update of status on public.orders
  for each row execute function public.release_happy_hour_quota();

-- Création de commande : prix des offres appliqué et revérifié côté serveur.
create or replace function public.create_order(
  p_customer_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_customer_note text default null,
  p_delivery jsonb default null,
  p_meal_payment public.payment_method default 'card',
  p_delivery_payment public.payment_method default 'card'
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
  v_mode text;
  v_options_cents int;
  v_line_total int;
  v_offer record;
  v_promo_units int;
  v_remaining int;
begin
  if p_customer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null or not public.is_accepting_orders(v_merchant) then
    raise exception 'merchant_not_accepting' using errcode = '22023';
  end if;

  v_mode := case when p_delivery is not null and jsonb_typeof(p_delivery) = 'object' then 'delivery' else 'pickup' end;

  -- Retrait : seulement si l'établissement l'a activé (une dark kitchen sans accueil ne l'a pas).
  if (p_delivery is null or jsonb_typeof(p_delivery) <> 'object') and not v_merchant.offers_pickup then
    raise exception 'pickup_unavailable' using errcode = '22023';
  end if;

  -- Espèces : uniquement au comptoir (clic & collect), chez un restaurant qui l'accepte.
  if p_meal_payment = 'cash' then
    if p_delivery is not null and jsonb_typeof(p_delivery) = 'object' then
      raise exception 'cash_not_allowed_for_delivery' using errcode = '22023';
    end if;
    if not v_merchant.accepts_cash_pickup then
      raise exception 'cash_not_accepted' using errcode = '22023';
    end if;
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
    if not public.offers_delivery(v_merchant) then
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

    -- Contrôle souple : au moins un livreur rattaché peut prendre des courses. La course
    -- n'est attribuée qu'à l'acceptation d'un livreur (courier_accept_mission).
    if not exists (select 1 from public.available_couriers(p_merchant_id)) then
      raise exception 'no_courier_available' using errcode = '22023';
    end if;

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
        delivery_payment_method = p_delivery_payment
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
    -- Produit ou formule servi seulement à certaines heures (fuseau de l'établissement).
    if not public.is_in_slot(v_item.id) then
      raise exception 'item_out_of_slot' using errcode = '22023';
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
           coalesce(sum(o.price_delta_cents), 0)
    into v_options, v_options_cents
    from public.menu_options o
    join public.menu_option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids);
    v_unit := v_item.price_cents + v_options_cents;  -- plein tarif, suppléments compris
    v_line_total := 0;

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

      -- Le menu offert est toujours au plein tarif : il remplace l'offre, il ne s'y ajoute pas.
      insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                      line_total_cents, is_loyalty_menu, is_loyalty_reward)
      values (v_order.id, v_item.id, v_item.name, v_unit, 1, v_options, v_unit, true, true);
      v_subtotal := v_subtotal + v_unit;
      v_line_total := v_line_total + v_unit;
      v_discount := v_item.price_cents;  -- le menu est offert, pas ses suppléments
      v_reward_used := true;
      v_quantity := v_quantity - 1;
    end if;

    if v_quantity > 0 then
      -- Happy Hour : au plus une offre par produit, jamais cumulée avec une autre (voir active_happy_hours).
      v_promo_units := 0;
      select a.* into v_offer from public.active_happy_hours(p_merchant_id, v_mode) a where a.item_id = v_item.id;
      if v_offer.happy_hour_id is not null then
        if v_offer.quantity_remaining is null then
          v_promo_units := v_quantity;
        else
          -- Quota : verrou sur l'offre, deux commandes simultanées ne dépassent jamais le stock.
          select h.quantity_limit - h.quantity_used into v_remaining
          from public.happy_hours h where h.id = v_offer.happy_hour_id for update;
          v_promo_units := least(v_quantity, greatest(v_remaining, 0));
        end if;
        if v_promo_units > 0 then
          update public.happy_hours set quantity_used = quantity_used + v_promo_units
          where id = v_offer.happy_hour_id;
          -- Prix conservé dans la commande : prix promotionnel + suppléments, avec le tarif habituel.
          insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                          line_total_cents, is_loyalty_menu, regular_unit_cents,
                                          happy_hour_id, happy_hour_name)
          values (v_order.id, v_item.id, v_item.name, v_offer.promo_cents + v_options_cents, v_promo_units,
                  v_options, (v_offer.promo_cents + v_options_cents) * v_promo_units, v_item.is_loyalty_menu,
                  v_unit, v_offer.happy_hour_id, v_offer.name);
          v_subtotal := v_subtotal + (v_offer.promo_cents + v_options_cents) * v_promo_units;
          v_line_total := v_line_total + (v_offer.promo_cents + v_options_cents) * v_promo_units;
        end if;
      end if;
      if v_quantity - v_promo_units > 0 then
        insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                        line_total_cents, is_loyalty_menu)
        values (v_order.id, v_item.id, v_item.name, v_unit, v_quantity - v_promo_units, v_options,
                v_unit * (v_quantity - v_promo_units), v_item.is_loyalty_menu);
        v_subtotal := v_subtotal + v_unit * (v_quantity - v_promo_units);
        v_line_total := v_line_total + v_unit * (v_quantity - v_promo_units);
      end if;
    end if;

    -- Le client a vu un prix : s'il a changé entre-temps (offre terminée, stock épuisé, prix modifié),
    -- la commande est refusée plutôt que facturée autrement.
    if jsonb_typeof(v_line -> 'expected_total_cents') = 'number'
       and (v_line ->> 'expected_total_cents')::int <> v_line_total then
      raise exception 'price_changed' using errcode = '22023';
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
      is_loyalty_reward = v_reward_used,
      meal_payment_method = p_meal_payment,
      -- Espèces : rien à payer en ligne, la commande part directement au restaurant.
      status = case when p_meal_payment = 'cash' then 'placed'::public.order_status else status end,
      placed_at = case when p_meal_payment = 'cash' then now() else placed_at end
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, uuid, jsonb, text, jsonb, public.payment_method, public.payment_method)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, text, jsonb, public.payment_method, public.payment_method)
  to service_role;
