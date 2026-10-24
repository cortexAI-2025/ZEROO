-- Rétablit la règle de confidentialité : la position précise (adresse, latitude, longitude) d'un établissement
-- n'est visible que s'il accueille du public (retrait proposé), de son propriétaire et des livreurs qu'il a
-- acceptés. Une dark kitchen sans retrait n'expose que sa zone de service (ville, code postal).
-- Corrige les migrations 20261023101157 et 20261023101709, appliquées directement en ligne, qui rendaient
-- publique la position de tout établissement publié.
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
revoke execute on function public.can_see_merchant_address(uuid) from public, anon, authenticated;

-- Annuaire : adresse et coordonnées seulement pour un établissement qui accueille du public.
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
