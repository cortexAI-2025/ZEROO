-- Livraisons groupées, première version maîtrisée.
--
-- Un livreur garde la limite de 2 livraisons simultanées. La deuxième n'est prise que si elle est
-- **compatible** avec la première :
--   * retraits proches : même restaurant, ou restaurants à 1 km au plus l'un de l'autre ;
--   * livraisons proches : adresses à 2 km au plus l'une de l'autre ;
--   * préparations alignées : heures de fin de préparation à 15 minutes au plus d'écart ;
--   * la première course n'a pas encore été récupérée (un livreur en route vers un client termine
--     d'abord sa livraison).
-- Chaque commande garde son propre statut, son code de livraison, son prix de course et son client :
-- aucune coordonnée d'un client n'est partagée avec les autres clients, et **aucune remise ni
-- répartition financière n'est inventée** (le prix de la course est celui du restaurant, avant
-- validation, pour chaque commande).
--
--   * `courier_stops()` : la tournée du livreur (arrêts numérotés, heure estimée à chaque arrêt) ;
--   * `order_delivery_eta()` : l'heure de livraison estimée annoncée au client, pour sa seule commande.
-- Les heures sont des estimations (vitesse moyenne par véhicule + 3 minutes par arrêt), jamais un
-- engagement : le livreur n'est pas géolocalisé.

create or replace function public.grouping_max_pickup_gap_m() returns int language sql immutable as $$ select 1000 $$;
create or replace function public.grouping_max_drop_gap_m() returns int language sql immutable as $$ select 2000 $$;
create or replace function public.grouping_max_ready_gap_minutes() returns int language sql immutable as $$ select 15 $$;

-- Deux courses peuvent-elles être confiées au même livreur ? (p_existing est déjà à lui)
create or replace function public.missions_compatible(p_existing uuid, p_candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.status <> 'out_for_delivery'
       and (a.merchant_id = b.merchant_id
            or extensions.st_distance(ma.location, mb.location) <= public.grouping_max_pickup_gap_m())
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
$$;

revoke execute on function public.missions_compatible from public, anon, authenticated;

-- Tournée d'un livreur : retraits (un arrêt par restaurant, le plus tôt prêt d'abord) puis livraisons
-- (plus proche voisin). `stop_no` est le numéro d'arrêt : deux commandes du même restaurant partagent
-- le même arrêt de retrait. `eta` est une estimation.
create or replace function public.route_for_courier(p_courier_id uuid)
returns table (
  stop_no int,
  kind text,
  order_id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  eta timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    select m.id as merchant_id, m.name as merchant_name, m.location as geo, m.latitude as lat, m.longitude as lng,
           max(coalesce(x.estimated_ready_at, now())) as ready_at
    from public.orders x
    join public.merchants m on m.id = x.merchant_id
    where x.courier_id = p_courier_id and x.status in ('accepted', 'preparing', 'ready')
    group by m.id, m.name, m.location, m.latitude, m.longitude
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
      select m.location into v_pos from public.orders x join public.merchants m on m.id = x.merchant_id
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
$$;

revoke execute on function public.route_for_courier from public, anon, authenticated;

-- La tournée du livreur connecté.
create or replace function public.courier_stops()
returns table (
  stop_no int,
  kind text,
  order_id uuid,
  label text,
  latitude double precision,
  longitude double precision,
  eta timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.route_for_courier(public.current_courier_id()) r;
$$;

revoke execute on function public.courier_stops from public, anon;
grant execute on function public.courier_stops to authenticated;

-- Heure de livraison estimée, annoncée au client pour **sa** commande seulement, arrondie aux 5 minutes
-- supérieures. Avec un livreur : position dans sa tournée ; sans livreur encore : fin de préparation
-- + trajet à 20 km/h + 3 minutes. Une estimation, jamais un engagement.
create or replace function public.order_delivery_eta(p_order_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
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
             m.location,
             extensions.st_setsrid(extensions.st_makepoint(v_order.delivery_longitude, v_order.delivery_latitude), 4326)::extensions.geography)
    into v_dist from public.merchants m where m.id = v_order.merchant_id;
    v_eta := greatest(now(), coalesce(v_order.estimated_ready_at, now()))
             + make_interval(secs => coalesce(v_dist, 0) / (20000.0 / 60) * 60) + interval '3 minutes';
  end if;
  -- Arrondi aux 5 minutes supérieures.
  return to_timestamp(ceil(extract(epoch from v_eta) / 300) * 300);
end;
$$;

revoke execute on function public.order_delivery_eta from public, anon;
grant execute on function public.order_delivery_eta to authenticated;

-- Missions proposées et prise en charge : seules les courses compatibles avec la course en cours.
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
    -- Groupage : avec une course en cours, seules les missions compatibles sont proposées.
    and not exists (
      select 1 from public.orders e
      where e.courier_id = c.id and e.status in ('accepted', 'preparing', 'ready', 'out_for_delivery')
        and not public.missions_compatible(e.id, o.id))
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
$$;
