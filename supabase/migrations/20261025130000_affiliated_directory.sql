-- Annuaire des clients connectés : seuls les établissements affiliés (abonnement actif ou en essai,
-- paiement configuré) sont listés. Le public non connecté continue de voir tous les commerces publiés.
drop function if exists public.nearby_merchants(double precision, double precision, integer, integer);
drop function if exists public.search_merchants(text, integer);

CREATE OR REPLACE FUNCTION public.nearby_merchants(p_latitude double precision, p_longitude double precision, p_radius_m integer DEFAULT 10000, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
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
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and extensions.st_dwithin(ml.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by ml.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.search_merchants(p_query text, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
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
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like '%' || q.term || '%'
      or lower(extensions.unaccent(m.city)) like q.term || '%'
      or (m.offers_pickup and m.postal_code like q.term || '%')
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$function$;

revoke execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) from public;
grant execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) to anon, authenticated;
