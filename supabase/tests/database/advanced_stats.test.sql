begin;
select plan(9);

delete from public.orders;
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.addr() returns jsonb language sql as $$
  select jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                            'latitude', 48.8700, 'longitude', 2.3400, 'phone', '06 98 76 54 32')
$$;
create function pg_temp.kebab() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
    'option_ids', (select jsonb_agg(o.id) from public.menu_options o
                   where o.group_id = '60000000-0000-0000-0000-000000000003' and o.name = 'Blanche')))
$$;

create temporary table o (key text primary key, id uuid);
grant all on o to authenticated;

-- Une livraison acceptée par le restaurant, que personne n'a encore prise.
create function pg_temp.accepted_delivery(p_key text, p_merchant uuid, p_owner uuid, p_items jsonb) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.create_order('20000000-0000-0000-0000-000000000001', p_merchant,
                                               p_items, null, pg_temp.addr(), 'card', 'card');
  insert into o values (p_key, v_id);
  perform public.mark_order_authorized(v_id, 'pi_' || p_key);
  perform public.apply_order_transition(v_id, p_owner, 'accepted', 10);
end $$;



select pg_temp.accepted_delivery(k, '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', pg_temp.kebab())
from unnest(array['a', 'b', 'c']) k;

update public.subscriptions set plan = 'start', status = 'active' where merchant_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001') $$,
                 'P0001', 'feature_requires_pro', 'Start : statistiques avancées refusées');
select is((select count(*)::int from public.merchant_top_items('30000000-0000-0000-0000-000000000001', 30)), 0, 'Start : meilleures ventes limitées à 7 jours');
select ok((select count(*)::int from public.merchant_top_items('30000000-0000-0000-0000-000000000001', 7)) >= 1, 'Start : meilleures ventes sur 7 jours');
reset role;

update public.subscriptions set plan = 'pro' where merchant_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001', 30) ->> 'orders_count')::int, 3, 'Pro : 3 commandes comptées');
select is((public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001', 30) ->> 'delivery_orders')::int, 3, 'Pro : répartition par mode');
select is((public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001', 30) ->> 'unique_customers')::int, 1, 'Pro : clients uniques');
select is((public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001', 30) ->> 'returning_customers')::int, 1, 'Pro : clients fidèles');
select ok(jsonb_array_length(public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001', 30) -> 'peak_hours') >= 1, 'Pro : heures de pointe');
reset role;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.merchant_advanced_stats('30000000-0000-0000-0000-000000000001') $$,
                 'P0002', 'merchant_not_found', 'un client n''accède pas aux statistiques');
reset role;

select * from finish();
rollback;
