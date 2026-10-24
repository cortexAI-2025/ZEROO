-- Reprise fidèle d'une migration appliquée directement sur le projet hébergé (version 20261023101709),
-- absente de Git jusqu'ici. L'annuaire renvoie l'adresse et les coordonnées de tous les établissements
-- publiés, dark kitchens comprises : la migration 20261024154834_restore_private_dark_kitchen_location
-- rétablit la règle (position précise réservée aux établissements qui accueillent du public).
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
         ml.address_line,
         m.city,
         public.public_distance_m(m, here.point),
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         ml.latitude,
         ml.longitude
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
         ml.address_line,
         m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         ml.latitude,
         ml.longitude
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
