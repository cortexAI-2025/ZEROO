-- Étape (c) : recherche de commerces et passage de commande côté client.

-- =============================================================================
-- Recherche de commerces
-- =============================================================================

-- Commerces publiés autour d'un point, du plus proche au plus loin.
-- La position du client n'est utilisée que pour ce calcul : elle n'est jamais stockée.
create or replace function public.nearby_merchants(
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
  is_accepting_orders boolean
)
language sql
stable
set search_path = ''
as $$
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select m.id, m.slug, m.name, m.category, m.address_line, m.city,
         round(extensions.st_distance(m.location, here.point))::int,
         public.is_open_now(m),
         public.is_accepting_orders(m)
  from public.merchants m, here
  where m.is_published
    and extensions.st_dwithin(m.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by m.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$$;

-- Recherche par nom, ville ou code postal (sans géolocalisation).
create or replace function public.search_merchants(p_query text, p_limit int default 50)
returns table (
  id uuid,
  slug text,
  name text,
  category text,
  address_line text,
  city text,
  distance_m int,
  is_open boolean,
  is_accepting_orders boolean
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(extensions.unaccent(trim(p_query))) as term
  )
  select m.id, m.slug, m.name, m.category, m.address_line, m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m)
  from public.merchants m, q
  where m.is_published
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like '%' || q.term || '%'
      or lower(extensions.unaccent(m.city)) like q.term || '%'
      or m.postal_code like q.term || '%'
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.nearby_merchants, public.search_merchants to anon, authenticated;

-- Un client garde l'accès au nom et à l'adresse des commerces où il a commandé,
-- même s'ils ne sont plus publiés (historique, suivi de commande).
create policy "merchants: visibles des clients qui y ont commandé"
  on public.merchants for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.merchant_id = merchants.id and o.customer_id = (select auth.uid())
    )
  );

-- =============================================================================
-- Passage de commande
-- =============================================================================

-- p_items : [{ "item_id": uuid, "quantity": 2, "option_ids": [uuid, …] }, …]
-- Les prix sont recalculés à partir du menu en base : ceux affichés dans l'app
-- ne sont jamais crus sur parole.
--
-- Étape (c) : la commande est créée directement au statut « placed » (sans paiement).
-- Étape (d) : cette fonction sera appelée par l'Edge Function create-order, qui
-- créera la commande en « pending_payment » avec un PaymentIntent Stripe.
create or replace function public.create_order(
  p_merchant_id uuid,
  p_items jsonb,
  p_customer_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
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
  v_group record;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null or not public.is_accepting_orders(v_merchant) then
    raise exception 'merchant_not_accepting' using errcode = '22023';
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
                             customer_note, placed_at)
  values (
    p_merchant_id, uid,
    (select display_name from public.profiles where id = uid),
    'placed', 0, 0, nullif(trim(p_customer_note), ''), now()
  )
  returning * into v_order;

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

    insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options, line_total_cents)
    values (v_order.id, v_item.id, v_item.name, v_unit, v_quantity, v_options, v_unit * v_quantity);

    v_subtotal := v_subtotal + v_unit * v_quantity;
  end loop;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order from public, anon;
grant execute on function public.create_order to authenticated;
