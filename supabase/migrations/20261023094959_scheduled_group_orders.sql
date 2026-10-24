-- Précommandes programmées (Start et Pro) et commandes groupées entreprises (Pro).
--
-- Précommande : le client choisit un créneau futur (au plus 14 jours). Le serveur vérifie que
-- l'établissement est ouvert à ce moment (horaires et fermetures), que les produits y sont servis
-- (créneaux de menu) et que le délai de préparation est respecté. Les Happy Hours se calculent à
-- l'heure choisie. Une livraison programmée n'exige pas de livreur en ligne maintenant : il faut au
-- moins un livreur rattaché, actif et autorisé à cette heure (nuit : formule Pro). La mission n'apparaît
-- aux livreurs que 45 minutes avant l'heure demandée ; le délai « personne n'a pris la course » part de là.
--
-- Commande groupée entreprise (formule Pro) : précommande avec nom de l'entreprise et nombre de
-- convives, délai minimal et montant minimal fixés par l'établissement. Aucune facturation ZeeRoo :
-- la commande est payée directement à l'établissement, comme toute autre.

alter table public.orders
  add column scheduled_for timestamptz,
  add column is_group_order boolean not null default false,
  add column company_name text check (char_length(company_name) between 2 and 120),
  add column headcount int check (headcount between 2 and 1000),
  add check (not is_group_order or (company_name is not null and headcount is not null and scheduled_for is not null));

create index orders_scheduled_idx on public.orders (merchant_id, scheduled_for) where scheduled_for is not null;

alter table public.merchants
  add column group_orders_enabled boolean not null default false,
  add column group_min_lead_hours int not null default 24 check (group_min_lead_hours between 2 and 168),
  add column group_min_headcount int not null default 5 check (group_min_headcount between 2 and 100),
  add column group_min_total_cents int not null default 0 check (group_min_total_cents between 0 and 1000000);

grant update (group_orders_enabled, group_min_lead_hours, group_min_headcount, group_min_total_cents)
  on public.merchants to authenticated;

-- Activer les commandes groupées demande la formule Pro ; la désactivation reste toujours possible.
create or replace function public.check_group_orders_option()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.group_orders_enabled and not coalesce(old.group_orders_enabled, false)
     and not public.merchant_has_pro(new.id) then
    raise exception 'feature_requires_pro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger merchants_check_group_orders
  before update of group_orders_enabled on public.merchants
  for each row execute function public.check_group_orders_option();

-- Délai minimal de préparation d'une précommande.
create or replace function public.scheduled_min_lead_minutes(p_merchant_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(m.default_prep_minutes, 15) + 15 from public.merchants m where m.id = p_merchant_id;
$$;
revoke execute on function public.scheduled_min_lead_minutes from public, anon, authenticated;

drop function public.create_order(uuid, uuid, jsonb, text, jsonb, public.payment_method, public.payment_method);

CREATE OR REPLACE FUNCTION public.create_order(p_customer_id uuid, p_merchant_id uuid, p_items jsonb, p_customer_note text DEFAULT NULL::text, p_delivery jsonb DEFAULT NULL::jsonb, p_meal_payment payment_method DEFAULT 'card'::payment_method, p_delivery_payment payment_method DEFAULT 'card'::payment_method, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone, p_group jsonb DEFAULT NULL::jsonb)
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
  v_at timestamptz := coalesce(p_scheduled_for, now());
  v_group_name text;
  v_headcount int;
begin
  if p_customer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'merchant_not_accepting' using errcode = '22023';
  end if;
  -- Commande groupée entreprise : formule Pro, option activée, délai et effectif minimaux.
  if p_group is not null then
    if jsonb_typeof(p_group) <> 'object' then
      raise exception 'invalid_group_order' using errcode = '22023';
    end if;
    if not public.merchant_has_pro(p_merchant_id) or not v_merchant.group_orders_enabled then
      raise exception 'group_orders_unavailable' using errcode = '22023';
    end if;
    v_group_name := trim(p_group ->> 'company_name');
    begin
      v_headcount := (p_group ->> 'headcount')::int;
    exception when others then
      raise exception 'invalid_group_order' using errcode = '22023';
    end;
    if p_scheduled_for is null
       or char_length(coalesce(v_group_name, '')) not between 2 and 120
       or v_headcount is null or v_headcount < v_merchant.group_min_headcount or v_headcount > 1000 then
      raise exception 'invalid_group_order' using errcode = '22023';
    end if;
    if p_scheduled_for < now() + make_interval(hours => v_merchant.group_min_lead_hours) then
      raise exception 'group_lead_time' using errcode = '22023';
    end if;
  end if;

  if p_scheduled_for is null then
    if not public.is_accepting_orders(v_merchant) then
      raise exception 'merchant_not_accepting' using errcode = '22023';
    end if;
  else
    -- Précommande : l'établissement peut être fermé maintenant, il doit être ouvert à l'heure choisie.
    if not (v_merchant.is_published and not public.is_paused_now(v_merchant)
            and public.is_payments_ready(v_merchant) and public.is_subscription_active(v_merchant)
            and public.has_order_mode(v_merchant)) then
      raise exception 'merchant_not_accepting' using errcode = '22023';
    end if;
    if p_scheduled_for < now() + make_interval(mins => public.scheduled_min_lead_minutes(p_merchant_id))
       or p_scheduled_for > now() + interval '14 days' then
      raise exception 'invalid_schedule' using errcode = '22023';
    end if;
    if not public.is_merchant_open(p_merchant_id, p_scheduled_for) then
      raise exception 'merchant_closed_at_slot' using errcode = '22023';
    end if;
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
    if p_scheduled_for is null then
      if not exists (select 1 from public.available_couriers(p_merchant_id)) then
        raise exception 'no_courier_available' using errcode = '22023';
      end if;
    elsif not exists (
      select 1 from public.merchant_couriers l
      where l.merchant_id = p_merchant_id and l.status = 'approved'
        and public.is_courier_active(l.courier_id)
        and public.courier_can_deliver_at(l.courier_id, p_scheduled_for)
    ) then
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
    if not public.is_in_slot(v_item.id, v_at) then
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
      select a.* into v_offer from public.active_happy_hours(p_merchant_id, v_mode, v_at) a where a.item_id = v_item.id;
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

  -- Commande groupée : montant minimal de l'établissement.
  if p_group is not null and v_subtotal - v_discount < v_merchant.group_min_total_cents then
    raise exception 'group_minimum_not_reached' using errcode = '22023';
  end if;

  update public.orders
  set scheduled_for = p_scheduled_for,
      is_group_order = p_group is not null,
      company_name = v_group_name,
      headcount = v_headcount,
      subtotal_cents = v_subtotal,
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

revoke execute on function public.create_order(uuid, uuid, jsonb, text, jsonb, public.payment_method, public.payment_method, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, text, jsonb, public.payment_method, public.payment_method, timestamptz, jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.apply_order_transition(p_order_id uuid, p_actor uuid, p_status order_status, p_prep_minutes integer DEFAULT NULL::integer, p_refusal_reason text DEFAULT NULL::text, p_pickup_code text DEFAULT NULL::text)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- Remise au livreur : un livreur doit avoir pris la course.
  if p_status = 'out_for_delivery' and current_order.courier_id is null then
    raise exception 'courier_not_assigned' using errcode = '22023';
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
      -- Espèces : encaissé au comptoir (retrait) ou à la porte (livraison). Carte : confirmé
      -- par le professionnel (merchant_confirm_payment, courier_confirm_delivery_payment).
      paid_at             = case when p_status = 'collected' and meal_payment_method = 'cash' then coalesce(paid_at, now())
                                 else paid_at end,
      delivery_paid_at    = case when p_status = 'delivered' and delivery_payment_method = 'cash'
                                 then coalesce(delivery_paid_at, now())
                                 else delivery_paid_at end,
      estimated_ready_at  = case when p_status = 'accepted' then coalesce(scheduled_for, now() + make_interval(mins => p_prep_minutes))
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
    and public.courier_can_deliver_at(c.id, coalesce(o.estimated_ready_at, now()))
    and o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    -- Précommande : la mission apparaît 45 minutes avant l'heure demandée.
    and (o.scheduled_for is null or o.scheduled_for - interval '45 minutes' <= now())
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = c.id)
    -- Groupage : avec une course en cours, seules les missions compatibles sont proposées.
    and not exists (
      select 1 from public.orders e
      where e.courier_id = c.id and e.status in ('accepted', 'preparing', 'ready', 'out_for_delivery')
        and not public.missions_compatible(e.id, o.id))
  order by o.accepted_at;
$function$;

CREATE OR REPLACE FUNCTION public.flag_unclaimed_missions()
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.orders o
  set delivery_unclaimed_at = now()
  where o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and o.delivery_unclaimed_at is null
    and greatest(o.accepted_at, coalesce(o.scheduled_for - interval '45 minutes', o.accepted_at))
        < now() - make_interval(mins => public.mission_wait_minutes())
  returning o.id;
$function$;

CREATE OR REPLACE FUNCTION public.courier_accept_mission(p_order_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_courier public.couriers;
  v_order public.orders;
begin
  select * into v_courier from public.couriers where user_id = auth.uid() for update;
  if v_courier.id is null then
    raise exception 'courier_not_found' using errcode = 'P0002';
  end if;
  if not public.is_online(v_courier) or not public.is_courier_active(v_courier.id) then
    raise exception 'courier_unavailable' using errcode = '22023';
  end if;
  if public.courier_at_capacity(v_courier.id) then
    raise exception 'courier_at_capacity' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.fulfillment = 'delivery' and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and (o.scheduled_for is null or o.scheduled_for - interval '45 minutes' <= now())
    and exists (select 1 from public.merchant_couriers l
                where l.merchant_id = o.merchant_id and l.courier_id = v_courier.id and l.status = 'approved')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = v_courier.id)
  for update skip locked;
  if v_order.id is null then
    raise exception 'mission_unavailable' using errcode = 'P0002';
  end if;

  -- Livraison de nuit : formule Pro.
  if not public.courier_can_deliver_at(v_courier.id, coalesce(v_order.estimated_ready_at, now())) then
    raise exception 'night_requires_pro' using errcode = '22023';
  end if;

  -- Groupage : une deuxième course n'est prise que si elle est compatible avec la course en cours.
  if exists (
    select 1 from public.orders e
    where e.courier_id = v_courier.id and e.status in ('accepted', 'preparing', 'ready', 'out_for_delivery')
      and not public.missions_compatible(e.id, v_order.id)
  ) then
    raise exception 'mission_not_compatible' using errcode = '22023';
  end if;

  update public.orders
  set courier_id = v_courier.id,
      courier_name = split_part(v_courier.display_name, ' ', 1),
      courier_accepted_at = now(),
      delivery_payment_due_at = null,
      delivery_payment_declared_at = null
  where id = p_order_id
  returning * into v_order;
  update public.couriers set last_assigned_at = now() where id = v_courier.id;
  return v_order;
end;
$function$;

-- Devis de livraison : pour une précommande, un livreur rattaché et autorisé à cette heure suffit (pas besoin qu'il soit en ligne maintenant).
drop function public.merchant_delivery_quote(uuid, double precision, double precision);
CREATE OR REPLACE FUNCTION public.merchant_delivery_quote(p_merchant_id uuid, p_latitude double precision, p_longitude double precision, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
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
  elsif p_scheduled_for is null and not exists (select 1 from public.available_couriers(p_merchant_id)) then
    return query select false, 'no_courier_available'::text, v_merchant.delivery_fee_cents, v_distance;
  elsif p_scheduled_for is not null and not exists (
    select 1 from public.merchant_couriers l
    where l.merchant_id = p_merchant_id and l.status = 'approved'
      and public.is_courier_active(l.courier_id)
      and public.courier_can_deliver_at(l.courier_id, p_scheduled_for)
  ) then
    return query select false, 'no_courier_available'::text, v_merchant.delivery_fee_cents, v_distance;
  else
    return query select true, null::text, v_merchant.delivery_fee_cents, v_distance;
  end if;
end;
$function$;
grant execute on function public.merchant_delivery_quote(uuid, double precision, double precision, timestamptz) to anon, authenticated, service_role;
