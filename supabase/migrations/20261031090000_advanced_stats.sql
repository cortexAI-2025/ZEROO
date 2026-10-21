-- Statistiques avancées (formule Pro) : une seule fonction, réservée au propriétaire d'un établissement Pro.
-- Les statistiques de base (7 jours : ventes par jour et meilleures ventes) restent disponibles en Start.

create or replace function public.merchant_advanced_stats(p_merchant_id uuid, p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz;
  v_tz text;
  v_result jsonb;
begin
  if not public.is_merchant_owner(p_merchant_id) then
    raise exception 'merchant_not_found' using errcode = 'P0002';
  end if;
  if not public.merchant_has_pro(p_merchant_id) then
    raise exception 'feature_requires_pro' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.merchants where id = p_merchant_id;
  v_since := now() - make_interval(days => v_days);

  with valid as (
    select o.* from public.orders o
    where o.merchant_id = p_merchant_id and o.created_at >= v_since
      and o.status in ('accepted', 'preparing', 'ready', 'collected', 'out_for_delivery', 'delivered')
  ), lost as (
    select count(*) as n from public.orders o
    where o.merchant_id = p_merchant_id and o.created_at >= v_since
      and o.status in ('refused', 'expired', 'cancelled')
  ), customers as (
    select customer_id, count(*) as n from valid where customer_id is not null group by customer_id
  ), hours as (
    select extract(hour from (created_at at time zone v_tz))::int as h, count(*) as n
    from valid group by 1
  ), items as (
    select i.name, sum(i.quantity)::bigint as qty, sum(i.line_total_cents)::bigint as revenue
    from public.order_items i join valid v on v.id = i.order_id
    group by i.name order by 2 desc, 3 desc limit 10
  )
  select jsonb_build_object(
    'period_days', v_days,
    'orders_count', (select count(*) from valid),
    'revenue_cents', (select coalesce(sum(total_cents), 0) from valid),
    'average_basket_cents', (select coalesce(round(avg(total_cents)), 0)::int from valid),
    'cancelled_or_refused_count', (select n from lost),
    'pickup_orders', (select count(*) from valid where fulfillment = 'pickup'),
    'delivery_orders', (select count(*) from valid where fulfillment = 'delivery'),
    'scheduled_orders', (select count(*) from valid where scheduled_for is not null),
    'group_orders', (select count(*) from valid where is_group_order),
    'unique_customers', (select count(*) from customers),
    'returning_customers', (select count(*) from customers where n >= 2),
    'happy_hour_units', (select coalesce(sum(i.quantity), 0) from public.order_items i join valid v on v.id = i.order_id where i.happy_hour_id is not null),
    'peak_hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', n) order by h), '[]'::jsonb) from hours),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', qty, 'revenue_cents', revenue)), '[]'::jsonb) from items)
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.merchant_advanced_stats from public, anon;
grant execute on function public.merchant_advanced_stats to authenticated;
