-- Formules, créneaux de disponibilité par produit, moments de repas, fermetures exceptionnelles.
--
--  * `menu_items.is_formula` : une formule est un produit dont les composants sont des groupes
--    d'options obligatoires (système existant) ; elle suit les mêmes règles de prix et de fidélité.
--  * `menu_items.meal_periods` : moments de consommation (petit déjeuner, déjeuner, dîner, nuit).
--  * `menu_item_slots` : créneaux hebdomadaires (passage de minuit possible) pendant lesquels un
--    produit ou une formule est servi. Sans créneau : servi pendant toute l'ouverture.
--  * `merchant_closures` : fermetures exceptionnelles (congés, travaux), prioritaires sur les horaires.
--  * `create_order` refuse un produit hors créneau (`item_out_of_slot`).

-- Fenêtre hebdomadaire [starts, ends) : même règle pour les horaires, les créneaux de menu et,
-- plus loin, les promotions. starts > ends = la fenêtre passe minuit (le soir, puis le lendemain matin).
create or replace function public.time_in_window(
  p_weekday smallint, p_starts time, p_ends time, p_dow smallint, p_time time
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_starts < p_ends then p_weekday = p_dow and p_time >= p_starts and p_time < p_ends
    else (p_weekday = p_dow and p_time >= p_starts)
      or (p_weekday = (case when p_dow = 1 then 7 else p_dow - 1 end) and p_time < p_ends)
  end;
$$;

alter table public.menu_items
  add column is_formula boolean not null default false,
  add column meal_periods text[] not null default '{}'
    check (meal_periods <@ array['breakfast', 'lunch', 'dinner', 'night']::text[]);

create table public.menu_item_slots (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  item_id     uuid not null,
  weekday     smallint not null check (weekday between 1 and 7),  -- ISO : 1 = lundi
  starts_at   time not null,
  ends_at     time not null,                                      -- < starts_at = passe minuit
  check (starts_at <> ends_at),
  foreign key (item_id, merchant_id) references public.menu_items (id, merchant_id) on delete cascade
);

create index menu_item_slots_item_idx on public.menu_item_slots (item_id);

create table public.merchant_closures (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text check (char_length(reason) <= 100),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index merchant_closures_merchant_idx on public.merchant_closures (merchant_id, ends_at);

-- Lecture publique si le commerce est publié, écriture par le propriétaire (comme le menu).
do $$
declare
  t text;
begin
  foreach t in array array['menu_item_slots', 'merchant_closures']
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

-- Fermeture exceptionnelle sur des jours entiers, en heure de l'établissement :
-- du début du premier jour (p_from) à la fin du dernier (p_to inclus).
create or replace function public.add_closure(p_merchant_id uuid, p_from date, p_to date, p_reason text default null)
returns public.merchant_closures
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_closure public.merchant_closures;
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 366 then
    raise exception 'invalid_closure' using errcode = '22023';
  end if;
  select timezone into v_tz from public.merchants where id = p_merchant_id;
  insert into public.merchant_closures (merchant_id, starts_at, ends_at, reason)
  values (p_merchant_id, p_from::timestamp at time zone v_tz, (p_to + 1)::timestamp at time zone v_tz,
          nullif(trim(p_reason), ''))
  returning * into v_closure;
  return v_closure;
end;
$$;

revoke execute on function public.add_closure from public, anon;
grant execute on function public.add_closure to authenticated;

-- Ouverture : horaires (plusieurs plages, passage de minuit) moins les fermetures exceptionnelles.
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
             and public.time_in_window(h.weekday, h.opens_at, h.closes_at, p.dow, p.t)
         )
     and not exists (
           select 1 from public.merchant_closures c
           where c.merchant_id = p_merchant_id and p_at >= c.starts_at and p_at < c.ends_at
         );
$$;

-- Le produit est-il servi à cet instant ? Sans créneau : oui (dans les limites de l'ouverture).
create or replace function public.is_in_slot(p_item_id uuid, p_at timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with local as (
    select (p_at at time zone m.timezone) as ts
    from public.menu_items i
    join public.merchants m on m.id = i.merchant_id
    where i.id = p_item_id
  ),
  parts as (
    select extract(isodow from ts)::smallint as dow, ts::time as t from local
  )
  select not exists (select 1 from public.menu_item_slots s where s.item_id = p_item_id)
      or exists (
           select 1
           from public.menu_item_slots s, parts p
           where s.item_id = p_item_id
             and public.time_in_window(s.weekday, s.starts_at, s.ends_at, p.dow, p.t)
         );
$$;

-- Remplace tous les créneaux d'un produit en une seule transaction.
-- p_slots : [{ "weekday": 1, "starts_at": "11:00", "ends_at": "15:00" }, …] ; [] = servi toute l'ouverture.
create or replace function public.set_item_slots(p_item_id uuid, p_slots jsonb)
returns setof public.menu_item_slots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
begin
  select merchant_id into v_merchant_id from public.menu_items where id = p_item_id;
  if v_merchant_id is null or not public.is_merchant_owner(v_merchant_id) then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) > 70 then
    raise exception 'invalid_slots' using errcode = '22023';
  end if;

  delete from public.menu_item_slots where item_id = p_item_id;

  return query
  insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
  select v_merchant_id, p_item_id, (slot ->> 'weekday')::smallint, (slot ->> 'starts_at')::time, (slot ->> 'ends_at')::time
  from jsonb_array_elements(p_slots) as slot
  returning *;
end;
$$;

revoke execute on function public.set_item_slots from public, anon;
grant execute on function public.set_item_slots to authenticated;

-- Colonne calculée `is_in_slot_now` exposée par PostgREST.
create or replace function public.is_in_slot_now(i public.menu_items)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_in_slot(i.id, now());
$$;

grant execute on function public.is_in_slot(uuid, timestamptz), public.is_in_slot_now(public.menu_items)
  to anon, authenticated;

-- Commande : un produit hors créneau est refusé par le serveur.
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
begin
  if p_customer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null or not public.is_accepting_orders(v_merchant) then
    raise exception 'merchant_not_accepting' using errcode = '22023';
  end if;

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
