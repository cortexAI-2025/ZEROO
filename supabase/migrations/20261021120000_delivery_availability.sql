-- Disponibilité de livraison fiable.
--
--  * La disponibilité d'un livreur expire : « disponible » vaut 15 minutes, renouvelées par
--    `courier_heartbeat()` tant que l'app est ouverte. Un livreur déconnecté ou dont l'app est
--    fermée n'est plus proposé au client (plus de disponibilité périmée).
--  * `delivery_available_now` (colonne calculée) : livraison proposée ET au moins un livreur
--    rattaché, en ligne, avec de la capacité.
--  * Une mission que personne n'accepte dans les 15 minutes est signalée (`delivery_unclaimed_at`),
--    le client et le restaurant sont prévenus et peuvent annuler (`cancel_unclaimed_delivery`).
--    Aucun remboursement n'est simulé : le repas est payé directement au restaurant.

alter table public.couriers add column available_until timestamptz;

-- Les disponibilités existantes sont périmées dès maintenant : chaque livreur se remet en ligne.
update public.couriers set available_until = now() where is_available;

create or replace function public.courier_online_window()
returns interval language sql immutable as $$ select interval '15 minutes' $$;

-- Se mettre disponible ouvre la fenêtre ; se mettre indisponible la ferme.
create or replace function public.couriers_availability_window()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.is_available then
    new.available_until := null;
  elsif new.available_until is null or new.available_until <= now() then
    new.available_until := now() + public.courier_online_window();
  end if;
  return new;
end;
$$;

create trigger couriers_availability_window
  before insert or update of is_available on public.couriers
  for each row execute function public.couriers_availability_window();

-- En ligne = disponible et fenêtre non expirée (colonne calculée `is_online`, comme `m.is_open_now`).
create or replace function public.is_online(c public.couriers)
returns boolean
language sql
stable
set search_path = ''
as $$
  select c.is_available and c.available_until is not null and c.available_until > now();
$$;

grant execute on function public.is_online(public.couriers) to authenticated;

-- Signal de présence envoyé par l'app du livreur : prolonge la fenêtre tant qu'elle n'a pas expiré
-- (une disponibilité périmée ne se rétablit pas toute seule : le livreur la renouvelle lui-même).
create or replace function public.courier_heartbeat()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.couriers
  set available_until = now() + public.courier_online_window()
  where user_id = auth.uid() and is_available and available_until > now()
  returning available_until into v_until;
  return v_until;
end;
$$;

revoke execute on function public.courier_heartbeat from public, anon;
grant execute on function public.courier_heartbeat to authenticated;

-- Livreurs proposables, missions et prise en charge : seulement s'ils sont en ligne.
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
    and public.is_online(c)
    and public.is_courier_active(c.id)
    and not public.courier_at_capacity(c.id);
$$;

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
    and public.is_online(c)
    and public.is_courier_active(c.id)
    and not public.courier_at_capacity(c.id)
    and o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = c.id)
  order by o.accepted_at;
$$;

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
$$;


-- Livraison réellement proposable maintenant (colonne calculée `delivery_available_now`).
create or replace function public.delivery_available_now(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.offers_delivery(m) and exists (select 1 from public.available_couriers(m.id));
$$;

grant execute on function public.delivery_available_now(public.merchants) to anon, authenticated;

-- =============================================================================
-- Missions non acceptées
-- =============================================================================

create or replace function public.mission_wait_minutes()
returns int language sql immutable as $$ select 15 $$;

alter table public.orders add column delivery_unclaimed_at timestamptz;

-- Marque les livraisons acceptées par le restaurant que aucun livreur n'a prises à temps.
create or replace function public.flag_unclaimed_missions()
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set delivery_unclaimed_at = now()
  where o.fulfillment = 'delivery'
    and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and o.delivery_unclaimed_at is null
    and o.accepted_at < now() - make_interval(mins => public.mission_wait_minutes())
  returning o.id;
$$;

revoke execute on function public.flag_unclaimed_missions from public, anon, authenticated;
grant execute on function public.flag_unclaimed_missions to service_role;

create or replace function public.notify_unclaimed_mission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.delivery_unclaimed_at is null and new.delivery_unclaimed_at is not null then
    perform public.call_internal_function('notify-order-update', jsonb_build_object(
      'order_id', new.id, 'status', new.status, 'previous_status', null, 'event', 'mission_unclaimed'));
  end if;
  return null;
end;
$$;

create trigger orders_notify_unclaimed
  after update of delivery_unclaimed_at on public.orders
  for each row execute function public.notify_unclaimed_mission();

select cron.schedule('flag-unclaimed-missions', '* * * * *', 'select public.flag_unclaimed_missions()');

-- Annulation d'une livraison que personne ne prend, par le client ou par le restaurant.
-- Le repas est réglé directement au restaurant (lien de paiement) : ZeeRoo ne rembourse rien,
-- le restaurant et le client s'arrangent. Une récompense fidélité utilisée est rendue.
create or replace function public.cancel_unclaimed_delivery(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_actor text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.customer_id = auth.uid() then
    v_actor := 'customer';
  elsif public.is_merchant_owner(v_order.merchant_id) then
    v_actor := 'merchant';
  else
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.fulfillment <> 'delivery' or v_order.courier_id is not null
     or v_order.delivery_unclaimed_at is null
     or v_order.status not in ('accepted', 'preparing', 'ready') then
    raise exception 'mission_not_cancellable' using errcode = '22023';
  end if;

  update public.orders
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_actor,
      refusal_reason = 'no_courier'
  where id = p_order_id
  returning * into v_order;

  if v_order.is_loyalty_reward and v_order.customer_id is not null then
    update public.loyalty_cards
    set rewards_available = rewards_available + 1
    where user_id = v_order.customer_id and merchant_id = v_order.merchant_id;
  end if;
  return v_order;
end;
$$;

revoke execute on function public.cancel_unclaimed_delivery from public, anon;
grant execute on function public.cancel_unclaimed_delivery to authenticated;
