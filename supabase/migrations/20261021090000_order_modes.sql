-- Modes de commande par établissement (retrait, livraison, ou les deux) et dark kitchens.
--
--  * Nouvelle catégorie `dark_kitchen` (cuisine sans boutique).
--  * `offers_pickup` : l'établissement propose le retrait sur place. Une dark kitchen ne le propose
--    pas par défaut, et son adresse précise n'est alors pas exposée par l'annuaire public.
--  * `pickup_instructions` : consignes de retrait affichées au client.
--  * Un établissement n'est « ouvert aux commandes » que s'il a au moins un mode actif :
--    retrait, ou livraison (formule Pro).
--  * `create_order` refuse un retrait non proposé et revérifie la formule Pro pour la livraison.

alter table public.merchants drop constraint merchants_category_check;
alter table public.merchants add constraint merchants_category_check
  check (category in ('snack', 'sandwicherie', 'restaurant', 'boulangerie', 'dark_kitchen', 'autre'));

alter table public.merchants
  add column offers_pickup boolean not null default true,
  add column pickup_instructions text check (char_length(pickup_instructions) <= 300);

grant update (offers_pickup, pickup_instructions) on public.merchants to authenticated;

-- À la création, une dark kitchen n'offre pas le retrait (le propriétaire peut l'activer ensuite).
create or replace function public.merchants_default_modes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category = 'dark_kitchen' then
    new.offers_pickup := false;
  end if;
  return new;
end;
$$;

create trigger merchants_default_modes
  before insert on public.merchants
  for each row execute function public.merchants_default_modes();

-- Livraison effectivement proposée : activée par le commerçant et incluse dans sa formule (Pro).
create or replace function public.offers_delivery(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.delivery_enabled and public.has_delivery_option(m);
$$;

-- Au moins un mode de commande actif.
create or replace function public.has_order_mode(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.offers_pickup or public.offers_delivery(m);
$$;

grant execute on function public.offers_delivery(public.merchants), public.has_order_mode(public.merchants)
  to anon, authenticated;

-- Désactiver le retrait suppose une livraison active : sinon l'établissement n'aurait plus aucun mode.
create or replace function public.check_order_mode()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.offers_pickup and not new.offers_pickup and not public.offers_delivery(new) then
    raise exception 'order_mode_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger merchants_check_order_mode
  before update of offers_pickup on public.merchants
  for each row execute function public.check_order_mode();

create or replace function public.is_accepting_orders(m public.merchants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select m.is_published
     and not public.is_paused_now(m)
     and public.is_open_now(m)
     and public.is_payments_ready(m)
     and public.is_subscription_active(m)
     and public.has_order_mode(m);
$$;

-- Position affichée au public : exacte pour un établissement qui accueille, sinon ramenée à une
-- grille d'environ 1 km, et distance arrondie à 500 m (la zone de service suffit au client).
create or replace function public.public_distance_m(m public.merchants, p_point extensions.geography)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when m.offers_pickup then round(extensions.st_distance(m.location, p_point))::int
    else (round(extensions.st_distance(
            extensions.st_snaptogrid(m.location::extensions.geometry, 0.01)::extensions.geography,
            p_point) / 500) * 500)::int
  end;
$$;

-- Annuaire : modes proposés, adresse masquée pour un établissement qui n'accueille pas le public.
drop function public.nearby_merchants(double precision, double precision, int, int);
drop function public.search_merchants(text, int);

create function public.nearby_merchants(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m int default 10000,
  p_limit int default 50
)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  address_line text,
  city text,
  distance_m int,
  is_open boolean,
  is_accepting_orders boolean,
  offers_pickup boolean,
  offers_delivery boolean
)
language sql
stable
set search_path = ''
as $$
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then m.address_line end,
         m.city,
         public.public_distance_m(m, here.point),
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m)
  from public.merchants m, here
  where m.is_published
    and extensions.st_dwithin(m.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by m.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.search_merchants(p_query text, p_limit int default 50)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  address_line text,
  city text,
  distance_m int,
  is_open boolean,
  is_accepting_orders boolean,
  offers_pickup boolean,
  offers_delivery boolean
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(extensions.unaccent(trim(p_query))) as term
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then m.address_line end,
         m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m)
  from public.merchants m, q
  where m.is_published
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like '%' || q.term || '%'
      or lower(extensions.unaccent(m.city)) like q.term || '%'
      or (m.offers_pickup and m.postal_code like q.term || '%')
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.nearby_merchants, public.search_merchants to anon, authenticated;

-- Création de commande : retrait seulement s'il est proposé ; livraison seulement en formule Pro.
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
