-- Annuaire géolocalisé : filtres (ouvert, retrait, livraison disponible, Happy Hour, moment de repas)
-- et carte. Les fonctions renvoient de quoi filtrer côté application et placer les établissements.
--
--  * `delivery_available_now` : livraison proposée ET un livreur peut la prendre maintenant.
--  * `has_happy_hour_now`     : au moins une offre en vigueur.
--  * `meal_periods`           : moments de repas servis par les produits disponibles.
--  * `latitude` / `longitude` : seulement pour un établissement qui accueille le public ; une dark
--    kitchen n'a pas de position précise sur la carte (sa zone de service suffit).

-- Moments de repas (petit déjeuner, déjeuner, dîner, nuit) des produits disponibles d'un commerce.
create or replace function public.meal_periods_of(m public.merchants)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p order by p), '{}')
  from public.menu_items i
  join public.menu_categories c on c.id = i.category_id and c.is_active
  cross join lateral unnest(i.meal_periods) p
  where i.merchant_id = m.id and i.is_available;
$$;

grant execute on function public.meal_periods_of(public.merchants) to anon, authenticated;

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
  offers_delivery boolean,
  delivery_available_now boolean,
  has_happy_hour_now boolean,
  meal_periods text[],
  latitude double precision,
  longitude double precision
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
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then m.latitude end,
         case when m.offers_pickup then m.longitude end
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
  offers_delivery boolean,
  delivery_available_now boolean,
  has_happy_hour_now boolean,
  meal_periods text[],
  latitude double precision,
  longitude double precision
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
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then m.latitude end,
         case when m.offers_pickup then m.longitude end
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
