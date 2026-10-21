-- Nouvelle gamme commerciale : droits par formule appliqués côté serveur.
--
-- Établissements (un abonnement = un établissement, pas de multisite) :
--   Start : Click & Collect, livraison, QR code et fidélité, précommandes programmées, paniers anti-gaspi.
--   Pro   : tout Start + Happy Hours, mini-site dans l'annuaire, statistiques avancées,
--           commandes groupées entreprises, campagne marketing mensuelle.
-- Livreurs :
--   Start : missions de livraison classiques, une course à la fois, hors livraison de nuit.
--   Pro   : plusieurs courses simultanées (groupage compatible) et livraison de nuit.
-- Un abonnement n'ouvre ses droits que lorsqu'il est en essai (`trialing`) ou actif (`active`) :
-- impayé (`past_due`), résilié ou expiré, les droits cessent (les données sont conservées).

alter table public.subscriptions add column created_at timestamptz not null default now();
update public.subscriptions set created_at = updated_at;
alter table public.courier_subscriptions
  add column plan text not null default 'start' check (plan in ('start', 'pro'));

-- Formule en vigueur d'un établissement : 'start', 'pro', ou null sans abonnement valide.
create or replace function public.merchant_plan_of(p_merchant_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.plan from public.subscriptions s
  where s.merchant_id = p_merchant_id and s.status in ('trialing', 'active');
$$;

create or replace function public.merchant_has_pro(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.merchant_plan_of(p_merchant_id) = 'pro', false);
$$;

create or replace function public.courier_plan_of(p_courier_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.plan from public.courier_subscriptions s
  where s.courier_id = p_courier_id and s.status in ('trialing', 'active');
$$;

revoke execute on function public.merchant_plan_of, public.merchant_has_pro, public.courier_plan_of
  from public, anon, authenticated;

-- Courses simultanées : une pour un livreur Start, deux (groupées) pour un livreur Pro.
create or replace function public.courier_capacity(p_courier_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case public.courier_plan_of(p_courier_id) when 'pro' then 2 else 1 end;
$$;
revoke execute on function public.courier_capacity from public, anon, authenticated;

create or replace function public.courier_at_capacity(p_courier_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.courier_active_count(p_courier_id) >= public.courier_capacity(p_courier_id);
$$;

-- Livraison de nuit : 22 h – 6 h, heure de Paris. Réservée aux livreurs Pro.
create or replace function public.is_night_delivery(p_at timestamptz)
returns boolean language sql immutable set search_path = '' as $$
  select extract(hour from (p_at at time zone 'Europe/Paris')) >= 22
      or extract(hour from (p_at at time zone 'Europe/Paris')) < 6;
$$;

-- Le livreur peut-il prendre une livraison à cette heure ? (formule + nuit)
create or replace function public.courier_can_deliver_at(p_courier_id uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.courier_plan_of(p_courier_id) is not null
     and (not public.is_night_delivery(p_at) or public.courier_plan_of(p_courier_id) = 'pro');
$$;
revoke execute on function public.courier_can_deliver_at from public, anon, authenticated;

-- Livraison d'un établissement : ouverte à Start et Pro (abonnement valide).
create or replace function public.has_delivery_option(m public.merchants)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.merchant_plan_of(m.id) is not null;
$$;

create or replace function public.check_delivery_option()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.delivery_enabled and not old.delivery_enabled and not public.has_delivery_option(new) then
    raise exception 'delivery_requires_subscription' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Plus de coupure de la livraison au changement de formule : elle dépend seulement de l'abonnement valide
-- (lue à chaque commande par `has_delivery_option`), sans modifier les réglages de l'établissement.
drop trigger if exists subscriptions_disable_delivery on public.subscriptions;
drop function if exists public.disable_delivery_without_pro();

-- Disponibilité des livreurs pour un établissement : la nuit, seulement les livreurs Pro.
create or replace function public.available_couriers(p_merchant_id uuid)
returns setof public.couriers language sql stable security definer set search_path = '' as $$
  select c.*
  from public.couriers c
  join public.merchant_couriers l on l.courier_id = c.id
  where l.merchant_id = p_merchant_id
    and l.status = 'approved'
    and public.is_online(c)
    and public.is_courier_active(c.id)
    and public.courier_can_deliver_at(c.id, now())
    and not public.courier_at_capacity(c.id);
$$;
revoke execute on function public.available_couriers from public, anon, authenticated;

-- Happy Hours : formule Pro. Hors Pro, les offres existantes restent enregistrées mais ne s'appliquent plus.

CREATE OR REPLACE FUNCTION public.active_happy_hours(p_merchant_id uuid, p_mode text, p_at timestamp with time zone DEFAULT now())
 RETURNS TABLE(happy_hour_id uuid, name text, item_id uuid, regular_cents integer, promo_cents integer, ends_at timestamp with time zone, quantity_remaining integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with parts as (
    select m.id, m.timezone,
           (p_at at time zone m.timezone)::date as d,
           (p_at at time zone m.timezone)::time as t,
           extract(isodow from (p_at at time zone m.timezone))::smallint as dow
    from public.merchants m
    where m.id = p_merchant_id and m.is_published and public.merchant_has_pro(m.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.save_happy_hour(p_merchant_id uuid, p_id uuid, p_data jsonb)
 RETURNS happy_hours
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer public.happy_hours;
  v_item jsonb;
  v_price int;
  v_type text := p_data ->> 'discount_type';
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if not public.merchant_has_pro(p_merchant_id) then
    raise exception 'feature_requires_pro' using errcode = 'P0001';
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
$function$;


-- Statistiques : Start voit les 7 derniers jours ; au-delà, formule Pro.

CREATE OR REPLACE FUNCTION public.merchant_sales_by_day(p_merchant_id uuid, p_days integer DEFAULT 7)
 RETURNS TABLE(day date, orders_count integer, revenue_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with guard as (
    select 1 where p_days <= 7 or public.merchant_has_pro(p_merchant_id)
  ), m as (
    select id, timezone from public.merchants
    where id = p_merchant_id and public.is_merchant_owner(p_merchant_id) and exists (select 1 from guard)
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
$function$;

CREATE OR REPLACE FUNCTION public.merchant_top_items(p_merchant_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(name text, quantity bigint, revenue_cents bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select i.name, sum(i.quantity)::bigint, sum(i.line_total_cents)::bigint
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.merchant_id = p_merchant_id
    and public.is_merchant_owner(p_merchant_id)
    and (p_days <= 7 or public.merchant_has_pro(p_merchant_id))
    and o.status in ('accepted', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered')
    and o.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
  group by i.name
  order by 2 desc, 3 desc
  limit 5;
$function$;


-- Missions : la nuit, seulement pour les livreurs Pro.

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
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = c.id)
    -- Groupage : avec une course en cours, seules les missions compatibles sont proposées.
    and not exists (
      select 1 from public.orders e
      where e.courier_id = c.id and e.status in ('accepted', 'preparing', 'ready', 'out_for_delivery')
        and not public.missions_compatible(e.id, o.id))
  order by o.accepted_at;
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
