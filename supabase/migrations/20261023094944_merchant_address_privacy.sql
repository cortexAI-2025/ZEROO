-- Adresse précise d'un établissement : jamais lisible par l'API publique.
--
-- Avant : `merchants.address_line / latitude / longitude / location` étaient lisibles pour tout
-- établissement publié. L'application masquait l'adresse d'une dark kitchen (sans retrait) à l'écran,
-- mais l'API la renvoyait. Désormais l'adresse précise vit dans `merchant_locations`, table fermée
-- (aucun droit pour `anon` / `authenticated`, RLS sans politique). Seules des fonctions
-- `security definer` la lisent :
--   * `merchant_address_line / merchant_latitude / merchant_longitude` (colonnes calculées que l'app lit
--     avec un alias) : la valeur n'est rendue qu'à un établissement qui accueille du public (retrait
--     proposé), à son propriétaire et aux livreurs qu'il a acceptés ; sinon `null` ;
--   * l'annuaire, les distances de livraison, l'attribution des courses et le groupage.
-- `postal_code` et `city` restent publics : c'est la zone de service d'une dark kitchen.
--
-- Compatibilité : les colonnes de `merchants` restent écrivables (création, modification par le
-- propriétaire) ; un déclencheur envoie la valeur vers `merchant_locations` et laisse `null` dans
-- `merchants`. Les lectures directes de ces colonnes renvoient donc `null`.

create table public.merchant_locations (
  merchant_id  uuid primary key references public.merchants (id) on delete cascade
                    deferrable initially deferred,
  address_line text not null check (char_length(address_line) between 3 and 200),
  latitude     double precision not null check (latitude between -90 and 90),
  longitude    double precision not null check (longitude between -180 and 180),
  location     extensions.geography(Point, 4326)
                    generated always as (
                      extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                    ) stored
);
create index merchant_locations_location_idx on public.merchant_locations using gist (location);
alter table public.merchant_locations enable row level security;
revoke all on public.merchant_locations from anon, authenticated;

insert into public.merchant_locations (merchant_id, address_line, latitude, longitude)
select id, address_line, latitude, longitude from public.merchants;

-- Les colonnes de `merchants` deviennent un simple passage d'écriture.
drop index public.merchants_location_idx;
alter table public.merchants drop column location;
alter table public.merchants alter column address_line drop not null;
alter table public.merchants alter column latitude drop not null;
alter table public.merchants alter column longitude drop not null;
update public.merchants set address_line = null, latitude = null, longitude = null;

create or replace function public.route_merchant_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.address_line is not null or new.latitude is not null or new.longitude is not null then
    update public.merchant_locations l set
      address_line = coalesce(new.address_line, l.address_line),
      latitude = coalesce(new.latitude, l.latitude),
      longitude = coalesce(new.longitude, l.longitude)
    where l.merchant_id = new.id;
    if not found then
      insert into public.merchant_locations (merchant_id, address_line, latitude, longitude)
      values (new.id, new.address_line, new.latitude, new.longitude);
    end if;
    new.address_line := null;
    new.latitude := null;
    new.longitude := null;
  end if;
  return new;
end;
$$;

create trigger merchants_route_location
  before insert or update on public.merchants
  for each row execute function public.route_merchant_location();

-- Accès internes (fonctions security definer uniquement).
create or replace function public.merchant_point(p_merchant_id uuid)
returns extensions.geography language sql stable security definer set search_path = '' as $$
  select l.location from public.merchant_locations l where l.merchant_id = p_merchant_id;
$$;
create or replace function public.merchant_lat(p_merchant_id uuid)
returns double precision language sql stable security definer set search_path = '' as $$
  select l.latitude from public.merchant_locations l where l.merchant_id = p_merchant_id;
$$;
create or replace function public.merchant_lng(p_merchant_id uuid)
returns double precision language sql stable security definer set search_path = '' as $$
  select l.longitude from public.merchant_locations l where l.merchant_id = p_merchant_id;
$$;
create or replace function public.merchant_address(p_merchant_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select l.address_line from public.merchant_locations l where l.merchant_id = p_merchant_id;
$$;
revoke execute on function public.merchant_point, public.merchant_lat, public.merchant_lng, public.merchant_address
  from public, anon, authenticated;

-- Qui peut voir l'adresse précise ? Un établissement publié qui accueille du public (retrait),
-- son propriétaire, un livreur qu'il a accepté.
create or replace function public.can_see_merchant_address(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id
      and (
        (m.is_published and m.offers_pickup)
        or m.owner_id = (select auth.uid())
        or exists (
          select 1 from public.merchant_couriers mc
          where mc.merchant_id = m.id and mc.status = 'approved'
            and mc.courier_id = public.current_courier_id()
        )
      )
  );
$$;
revoke execute on function public.can_see_merchant_address from public, anon, authenticated;

-- Colonnes calculées lues par l'app (`address_line:merchant_address_line`, ...).
create or replace function public.merchant_address_line(m public.merchants)
returns text language sql stable security definer set search_path = '' as $$
  select public.merchant_address(m.id) where public.can_see_merchant_address(m.id);
$$;
create or replace function public.merchant_latitude(m public.merchants)
returns double precision language sql stable security definer set search_path = '' as $$
  select public.merchant_lat(m.id) where public.can_see_merchant_address(m.id);
$$;
create or replace function public.merchant_longitude(m public.merchants)
returns double precision language sql stable security definer set search_path = '' as $$
  select public.merchant_lng(m.id) where public.can_see_merchant_address(m.id);
$$;
grant execute on function public.merchant_address_line, public.merchant_latitude, public.merchant_longitude
  to anon, authenticated;

-- Fonctions qui lisaient la position dans `merchants`.

CREATE OR REPLACE FUNCTION public.merchant_delivery_quote(p_merchant_id uuid, p_latitude double precision, p_longitude double precision)
 RETURNS TABLE(available boolean, reason text, fee_cents integer, distance_m integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_merchant public.merchants;
  v_distance int;
begin
  select * into v_merchant from public.merchants where id = p_merchant_id and is_published;
  if v_merchant.id is null or not v_merchant.delivery_enabled or not public.has_delivery_option(v_merchant) then
    return query select false, 'delivery_unavailable'::text, null::int, null::int;
    return;
  end if;
  v_distance := round(extensions.st_distance(
    public.merchant_point(v_merchant.id),
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
$function$;

CREATE OR REPLACE FUNCTION public.create_order(p_customer_id uuid, p_merchant_id uuid, p_items jsonb, p_customer_note text DEFAULT NULL::text, p_delivery jsonb DEFAULT NULL::jsonb, p_meal_payment payment_method DEFAULT 'card'::payment_method, p_delivery_payment payment_method DEFAULT 'card'::payment_method)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      public.merchant_point(v_merchant.id),
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
$function$;

CREATE OR REPLACE FUNCTION public.available_missions()
 RETURNS TABLE(order_id uuid, merchant_id uuid, merchant_name text, merchant_address text, merchant_city text, delivery_city text, delivery_postal_code text, delivery_distance_m integer, delivery_fee_cents integer, payment_method payment_method, status order_status, estimated_ready_at timestamp with time zone, accepted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select o.id, m.id, m.name, public.merchant_address(m.id), m.city, o.delivery_city, o.delivery_postal_code,
         o.delivery_distance_m, o.delivery_fee_cents, o.delivery_payment_method, o.status,
         o.estimated_ready_at, o.accepted_at
  from public.couriers c
  join public.merchant_couriers l on l.courier_id = c.id and l.status = 'approved'
  join public.orders o on o.merchant_id = l.merchant_id
  join public.merchants m on m.id = o.merchant_id
  where c.user_id = auth.uid()
    and public.is_online(c)
    and public.is_courier_active(c.id)
    and not public.courier_at_capacity(c.id)
    and o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = c.id)
    -- Groupage : avec une course en cours, seules les missions compatibles sont proposées.
    and not exists (
      select 1 from public.orders e
      where e.courier_id = c.id and e.status in ('accepted', 'preparing', 'ready', 'out_for_delivery')
        and not public.missions_compatible(e.id, o.id))
  order by o.accepted_at;
$function$;

CREATE OR REPLACE FUNCTION public.public_distance_m(m merchants, p_point geography)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when m.offers_pickup then round(extensions.st_distance(public.merchant_point(m.id), p_point))::int
    else (round(extensions.st_distance(
            extensions.st_snaptogrid(public.merchant_point(m.id)::extensions.geometry, 0.01)::extensions.geography,
            p_point) / 500) * 500)::int
  end;
$function$;

CREATE OR REPLACE FUNCTION public.missions_compatible(p_existing uuid, p_candidate uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select a.status <> 'out_for_delivery'
       and (a.merchant_id = b.merchant_id
            or extensions.st_distance(public.merchant_point(ma.id), public.merchant_point(mb.id)) <= public.grouping_max_pickup_gap_m())
       and (a.delivery_latitude is null or b.delivery_latitude is null
            or extensions.st_distance(
                 extensions.st_setsrid(extensions.st_makepoint(a.delivery_longitude, a.delivery_latitude), 4326)::extensions.geography,
                 extensions.st_setsrid(extensions.st_makepoint(b.delivery_longitude, b.delivery_latitude), 4326)::extensions.geography
               ) <= public.grouping_max_drop_gap_m())
       and (a.estimated_ready_at is null or b.estimated_ready_at is null
            or abs(extract(epoch from (a.estimated_ready_at - b.estimated_ready_at))) <= public.grouping_max_ready_gap_minutes() * 60)
    from public.orders a
    join public.orders b on b.id = p_candidate
    join public.merchants ma on ma.id = a.merchant_id
    join public.merchants mb on mb.id = b.merchant_id
    where a.id = p_existing
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.order_delivery_eta(p_order_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.orders;
  v_eta timestamptz;
  v_dist numeric;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_id = auth.uid() and fulfillment = 'delivery'
    and status in ('accepted', 'preparing', 'ready', 'out_for_delivery');
  if v_order.id is null then
    return null;
  end if;

  if v_order.courier_id is not null then
    select r.eta into v_eta from public.route_for_courier(v_order.courier_id) r
    where r.order_id = p_order_id and r.kind = 'dropoff';
  end if;
  if v_eta is null then
    select extensions.st_distance(
             public.merchant_point(m.id),
             extensions.st_setsrid(extensions.st_makepoint(v_order.delivery_longitude, v_order.delivery_latitude), 4326)::extensions.geography)
    into v_dist from public.merchants m where m.id = v_order.merchant_id;
    v_eta := greatest(now(), coalesce(v_order.estimated_ready_at, now()))
             + make_interval(secs => coalesce(v_dist, 0) / (20000.0 / 60) * 60) + interval '3 minutes';
  end if;
  -- Arrondi aux 5 minutes supérieures.
  return to_timestamp(ceil(extract(epoch from v_eta) / 300) * 300);
end;
$function$;

CREATE OR REPLACE FUNCTION public.route_for_courier(p_courier_id uuid)
 RETURNS TABLE(stop_no integer, kind text, order_id uuid, label text, latitude double precision, longitude double precision, eta timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_speed numeric;                 -- mètres par minute
  v_time timestamptz := now();
  v_pos extensions.geography;
  v_no int := 0;
  v_handover interval := interval '3 minutes';
  g record;
  o record;
  v_pending uuid[];
  v_next uuid;
  v_best numeric;
  v_dist numeric;
  v_dest extensions.geography;
begin
  select (case c.vehicle when 'foot' then 5 when 'bike' then 15 when 'car' then 20 else 25 end) * 1000.0 / 60
  into v_speed from public.couriers c where c.id = p_courier_id;
  if v_speed is null then
    return;
  end if;

  -- 1. Retraits
  for g in
    select m.id as merchant_id, m.name as merchant_name, public.merchant_point(m.id) as geo, public.merchant_lat(m.id) as lat, public.merchant_lng(m.id) as lng,
           max(coalesce(x.estimated_ready_at, now())) as ready_at
    from public.orders x
    join public.merchants m on m.id = x.merchant_id
    where x.courier_id = p_courier_id and x.status in ('accepted', 'preparing', 'ready')
    group by m.id, m.name
    order by min(x.estimated_ready_at) nulls last, m.id
  loop
    v_no := v_no + 1;
    if v_pos is not null then
      v_time := v_time + make_interval(secs => extensions.st_distance(v_pos, g.geo) / v_speed * 60);
    end if;
    v_time := greatest(v_time, g.ready_at) + v_handover;
    v_pos := g.geo;
    for o in
      select x.id from public.orders x
      where x.courier_id = p_courier_id and x.merchant_id = g.merchant_id and x.status in ('accepted', 'preparing', 'ready')
      order by x.created_at, x.id
    loop
      stop_no := v_no; kind := 'pickup'; order_id := o.id; label := g.merchant_name;
      latitude := g.lat; longitude := g.lng; eta := v_time;
      return next;
    end loop;
  end loop;

  -- 2. Livraisons, de proche en proche.
  select array_agg(x.id order by x.created_at, x.id) into v_pending
  from public.orders x
  where x.courier_id = p_courier_id and x.status in ('accepted', 'preparing', 'ready', 'out_for_delivery');

  while coalesce(array_length(v_pending, 1), 0) > 0 loop
    if v_pos is null then
      select public.merchant_point(m.id) into v_pos from public.orders x join public.merchants m on m.id = x.merchant_id
      where x.id = v_pending[1];
    end if;
    v_next := null;
    v_best := null;
    for o in select x.id, x.delivery_latitude as lat, x.delivery_longitude as lng from public.orders x where x.id = any (v_pending) order by x.created_at, x.id loop
      v_dist := case when o.lat is null then 0 else extensions.st_distance(
        v_pos, extensions.st_setsrid(extensions.st_makepoint(o.lng, o.lat), 4326)::extensions.geography) end;
      if v_best is null or v_dist < v_best then
        v_best := v_dist;
        v_next := o.id;
      end if;
    end loop;
    select x.delivery_city, x.delivery_latitude, x.delivery_longitude into g
    from public.orders x where x.id = v_next;
    v_no := v_no + 1;
    v_time := v_time + make_interval(secs => v_best / v_speed * 60) + v_handover;
    if g.delivery_latitude is not null then
      v_pos := extensions.st_setsrid(extensions.st_makepoint(g.delivery_longitude, g.delivery_latitude), 4326)::extensions.geography;
    end if;
    stop_no := v_no; kind := 'dropoff'; order_id := v_next; label := g.delivery_city;
    latitude := g.delivery_latitude; longitude := g.delivery_longitude; eta := v_time;
    return next;
    v_pending := array_remove(v_pending, v_next);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.nearby_merchants(p_latitude double precision, p_longitude double precision, p_radius_m integer DEFAULT 10000, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         public.public_distance_m(m, here.point),
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, here
  where m.is_published
    and extensions.st_dwithin(ml.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by ml.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.search_merchants(p_query text, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with q as (
    select lower(extensions.unaccent(trim(p_query))) as term
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, q
  where m.is_published
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like '%' || q.term || '%'
      or lower(extensions.unaccent(m.city)) like q.term || '%'
      or (m.offers_pickup and m.postal_code like q.term || '%')
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$function$;
