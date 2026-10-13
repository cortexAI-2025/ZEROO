-- Missions de livraison, espèces et livraisons groupées.
--
--  * Le repas est payé en ligne (carte / Apple Pay / Google Pay) AVANT l'envoi au restaurant,
--    sauf retrait au comptoir en espèces (restaurants qui l'acceptent).
--  * La course n'est plus réservée à la commande : une fois la commande acceptée par le
--    restaurant, elle est proposée à tous les livreurs rattachés, disponibles et libres.
--    Le premier qui accepte l'obtient (courier_accept_mission).
--  * Au moment où le livreur accepte, le client règle la course (carte, sur le compte Stripe
--    du livreur) ou la remet en espèces à la livraison, selon son choix à la commande.
--    Course carte non payée dans les 5 minutes : elle retourne dans le pool.
--  * Un livreur peut tenir jusqu'à 2 livraisons en même temps (aussi pendant une tournée).

create type public.payment_method as enum ('card', 'cash');

alter table public.merchants
  add column accepts_cash_pickup boolean not null default false;
grant update (accepts_cash_pickup) on public.merchants to authenticated;

alter table public.orders
  add column meal_payment_method     public.payment_method not null default 'card',
  add column delivery_payment_method public.payment_method not null default 'card',
  add column delivery_payment_due_at timestamptz,  -- le client doit régler la course avant cette heure (carte)
  add constraint orders_cash_meal_pickup_only check (meal_payment_method = 'card' or fulfillment = 'pickup');

-- Livreurs déjà proposés / ayant renoncé : une course ne leur est pas reproposée.
create table public.order_courier_skips (
  order_id   uuid not null references public.orders (id) on delete cascade,
  courier_id uuid not null references public.couriers (id) on delete cascade,
  reason     text not null check (reason in ('released', 'payment_timeout')),
  created_at timestamptz not null default now(),
  primary key (order_id, courier_id)
);
alter table public.order_courier_skips enable row level security;  -- aucune policy : accès par fonctions uniquement
revoke all on public.order_courier_skips from anon, authenticated;

-- =============================================================================
-- Capacité des livreurs
-- =============================================================================

create or replace function public.max_courier_deliveries()
returns int language sql immutable as $$ select 2 $$;

create or replace function public.courier_active_count(p_courier_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.orders o
  where o.courier_id = p_courier_id
    and o.status in ('pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'out_for_delivery');
$$;

-- Au moins une course en cours (suppression de compte).
create or replace function public.is_courier_busy(p_courier_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.courier_active_count(p_courier_id) > 0 $$;

create or replace function public.courier_at_capacity(p_courier_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.courier_active_count(p_courier_id) >= public.max_courier_deliveries() $$;

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
    and not public.courier_at_capacity(c.id);
$$;

revoke execute on function public.max_courier_deliveries, public.courier_active_count, public.is_courier_busy,
  public.courier_at_capacity, public.available_couriers from public, anon, authenticated;

-- =============================================================================
-- Création de commande
-- =============================================================================

drop function public.create_order(uuid, uuid, jsonb, text, jsonb);
drop function public.courier_confirm_order(uuid);

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

-- =============================================================================
-- Paiements
-- =============================================================================

-- Repas autorisé : la commande part au restaurant (la course se règle plus tard).
create or replace function public.mark_order_authorized(p_order_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set meal_authorized_at = coalesce(meal_authorized_at, now()),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id),
      status = 'placed',
      placed_at = now()
  where id = p_order_id and status = 'pending_payment'
  returning *;
$$;

-- Course réglée par carte (encaissement immédiat sur le compte du livreur).
-- Le PaymentIntent doit être celui créé pour le livreur actuel (start/attach_delivery_payment).
create or replace function public.mark_delivery_authorized(p_order_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set delivery_authorized_at = coalesce(delivery_authorized_at, now()),
      delivery_paid_at = coalesce(delivery_paid_at, now())
  where id = p_order_id
    and courier_id is not null
    and delivery_payment_method = 'card'
    and delivery_payment_intent_id = p_payment_intent_id
    and status in ('placed', 'accepted', 'preparing', 'ready', 'out_for_delivery')
  returning *;
$$;

-- Le client règle la course : vérifie la commande et renvoie ce qu'il faut pour créer le paiement.
create or replace function public.start_delivery_payment(p_order_id uuid, p_customer_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id and customer_id = p_customer_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.fulfillment <> 'delivery' or v_order.courier_id is null
     or v_order.delivery_payment_method <> 'card' or v_order.delivery_authorized_at is not null
     or v_order.status not in ('placed', 'accepted', 'preparing', 'ready') then
    raise exception 'delivery_not_payable' using errcode = '22023';
  end if;
  return v_order;
end;
$$;

create or replace function public.attach_delivery_payment_intent(p_order_id uuid, p_courier_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set delivery_payment_intent_id = p_payment_intent_id
  where id = p_order_id and courier_id = p_courier_id and delivery_payment_intent_id is null
  returning *;
$$;

revoke execute on function public.mark_order_authorized, public.mark_delivery_authorized,
  public.start_delivery_payment, public.attach_delivery_payment_intent from public, anon, authenticated;
grant execute on function public.mark_order_authorized, public.mark_delivery_authorized,
  public.start_delivery_payment, public.attach_delivery_payment_intent to service_role;

-- =============================================================================
-- Missions
-- =============================================================================

-- Libère la course (renoncement ou délai de paiement dépassé) et renvoie ce qu'il faut annuler chez Stripe.
create or replace function public.release_mission_core(p_order_id uuid, p_reason text)
returns table (delivery_payment_intent_id text, courier_stripe_account_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  insert into public.order_courier_skips (order_id, courier_id, reason)
  values (p_order_id, v_order.courier_id, p_reason)
  on conflict do nothing;
  update public.orders o
  set courier_id = null, courier_name = null, courier_stripe_account_id = null, courier_accepted_at = null,
      delivery_payment_due_at = null, delivery_payment_intent_id = null, delivery_checkout_session_id = null
  where o.id = p_order_id;
  return query select v_order.delivery_payment_intent_id, v_order.courier_stripe_account_id;
end;
$$;

-- Le livreur renonce à une course qu'il a prise (tant qu'elle n'est ni payée ni remise).
create or replace function public.courier_release_mission(p_order_id uuid, p_actor uuid)
returns table (delivery_payment_intent_id text, courier_stripe_account_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select o.* into v_order
  from public.orders o
  join public.couriers c on c.id = o.courier_id and c.user_id = p_actor
  where o.id = p_order_id
  for update of o;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'preparing', 'ready') or v_order.delivery_authorized_at is not null then
    raise exception 'mission_locked' using errcode = '22023';
  end if;
  return query select * from public.release_mission_core(p_order_id, 'released');
end;
$$;

-- Courses à régler que le client n'a pas payées à temps : retour dans le pool.
create or replace function public.expire_unpaid_missions()
returns table (order_id uuid, delivery_payment_intent_id text, courier_stripe_account_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select o.id from public.orders o
    where o.fulfillment = 'delivery' and o.courier_id is not null
      and o.delivery_payment_method = 'card' and o.delivery_authorized_at is null
      and o.delivery_payment_due_at < now()
      and o.status in ('accepted', 'preparing', 'ready')
    for update skip locked
  loop
    return query select v_id, r.delivery_payment_intent_id, r.courier_stripe_account_id
                 from public.release_mission_core(v_id, 'payment_timeout') r;
  end loop;
end;
$$;

revoke execute on function public.release_mission_core, public.courier_release_mission, public.expire_unpaid_missions
  from public, anon, authenticated;
grant execute on function public.courier_release_mission, public.expire_unpaid_missions to service_role;

-- Missions proposées au livreur connecté (sans l'adresse précise du client).
create or replace function public.available_missions()
returns table (
  order_id uuid,
  merchant_id uuid,
  merchant_name text,
  merchant_address text,
  merchant_city text,
  delivery_city text,
  delivery_postal_code text,
  delivery_distance_m int,
  delivery_fee_cents int,
  payment_method public.payment_method,
  status public.order_status,
  estimated_ready_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, m.id, m.name, m.address_line, m.city, o.delivery_city, o.delivery_postal_code,
         o.delivery_distance_m, o.delivery_fee_cents, o.delivery_payment_method, o.status,
         o.estimated_ready_at, o.accepted_at
  from public.couriers c
  join public.merchant_couriers l on l.courier_id = c.id and l.status = 'approved'
  join public.orders o on o.merchant_id = l.merchant_id
  join public.merchants m on m.id = o.merchant_id
  where c.user_id = auth.uid()
    and c.is_available
    and public.is_courier_active(c.id)
    and not public.courier_at_capacity(c.id)
    and o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = c.id)
  order by o.accepted_at;
$$;

-- Le premier livreur qui accepte obtient la course. Verrou sur le livreur (capacité)
-- et sur la commande (skip locked : une acceptation simultanée perd).
create or replace function public.courier_accept_mission(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.couriers;
  v_order public.orders;
begin
  select * into v_courier from public.couriers where user_id = auth.uid() for update;
  if v_courier.id is null then
    raise exception 'courier_not_found' using errcode = 'P0002';
  end if;
  if not v_courier.is_available or not public.is_courier_active(v_courier.id) then
    raise exception 'courier_unavailable' using errcode = '22023';
  end if;
  if public.courier_at_capacity(v_courier.id) then
    raise exception 'courier_at_capacity' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.fulfillment = 'delivery' and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and exists (select 1 from public.merchant_couriers l
                where l.merchant_id = o.merchant_id and l.courier_id = v_courier.id and l.status = 'approved')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = v_courier.id)
  for update skip locked;
  if v_order.id is null then
    raise exception 'mission_unavailable' using errcode = 'P0002';
  end if;

  update public.orders
  set courier_id = v_courier.id,
      courier_name = split_part(v_courier.display_name, ' ', 1),
      courier_stripe_account_id = (select a.stripe_account_id from public.courier_stripe_accounts a
                                   where a.courier_id = v_courier.id),
      courier_accepted_at = now(),
      delivery_payment_due_at = case when delivery_payment_method = 'card' then now() + interval '5 minutes' end
  where id = p_order_id
  returning * into v_order;
  update public.couriers set last_assigned_at = now() where id = v_courier.id;
  return v_order;
end;
$$;

revoke execute on function public.available_missions, public.courier_accept_mission from public, anon;
grant execute on function public.available_missions, public.courier_accept_mission to authenticated;

-- Notifications : nouvelle mission pour les livreurs, course prise (le client doit la régler).
create or replace function public.notify_mission_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fulfillment <> 'delivery' then
    return null;
  end if;
  if new.courier_id is null and new.status = 'accepted'
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.courier_id is not null) then
    perform public.call_internal_function('notify-order-update', jsonb_build_object(
      'order_id', new.id, 'status', new.status, 'previous_status', null, 'event', 'mission_available'));
  elsif tg_op = 'UPDATE' and old.courier_id is null and new.courier_id is not null then
    perform public.call_internal_function('notify-order-update', jsonb_build_object(
      'order_id', new.id, 'status', new.status, 'previous_status', null, 'event', 'courier_assigned'));
  end if;
  return null;
end;
$$;

create trigger orders_notify_missions
  after insert or update of status, courier_id on public.orders
  for each row execute function public.notify_mission_events();

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

  -- Remise au livreur : un livreur doit avoir pris la course, et la course être payée (carte).
  if p_status = 'out_for_delivery' then
    if current_order.courier_id is null then
      raise exception 'courier_not_assigned' using errcode = '22023';
    end if;
    if current_order.delivery_payment_method = 'card' and current_order.delivery_authorized_at is null then
      raise exception 'delivery_not_paid' using errcode = '22023';
    end if;
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
      -- Carte : encaissé à l'acceptation. Espèces : encaissé au comptoir (retrait) ou à la porte (course).
      paid_at             = case when p_status = 'accepted' and stripe_payment_intent_id is not null then now()
                                 when p_status = 'collected' and meal_payment_method = 'cash' then now()
                                 else paid_at end,
      delivery_paid_at    = case when p_status = 'delivered' and delivery_payment_method = 'cash' then now()
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
