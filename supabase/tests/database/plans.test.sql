begin;
select plan(26);

delete from public.orders;
update public.couriers set last_assigned_at = null;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

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
from unnest(array['a', 'b', 'n']) k;
-- Heure de préparation fixe, de jour (11 h à Paris) : « maintenant + 10 min » faisait passer ces commandes
-- en « livraison de nuit » (22 h – 6 h, réservée aux livreurs Pro) quand le test tournait la nuit, et les
-- assertions sur la formule Start échouaient selon l'heure d'exécution. La règle de nuit est testée plus
-- bas avec des horaires explicites.
update public.orders set estimated_ready_at = timestamptz '2099-01-02 10:00:00+00';

-- -----------------------------------------------------------------------------
-- Établissement : droits par formule
-- -----------------------------------------------------------------------------
select is(public.merchant_plan_of('30000000-0000-0000-0000-000000000001'), 'pro', 'Chez Samir : Pro (essai ou actif)');
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is(public.merchant_plan_of('30000000-0000-0000-0000-000000000001'), 'start', 'formule Start');
select ok((select public.has_delivery_option(m) from public.merchants m where id = '30000000-0000-0000-0000-000000000001'),
          'Start : la livraison est incluse');
select ok(not public.merchant_has_pro('30000000-0000-0000-0000-000000000001'), 'Start : pas Pro');

-- Happy Hours : Pro seulement
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null, '{}'::jsonb) $$,
                 'P0001', 'feature_requires_pro', 'Start : créer une Happy Hour est refusé');
reset role;
update public.subscriptions set plan = 'pro' where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.happy_hours (id, merchant_id, name, discount_type, percent_off, applies_to_pickup, applies_to_delivery,
                                starts_on, ends_on, is_active)
values ('f0000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'Test', 'percent', 20, true, true,
        current_date - 1, current_date + 30, true);
insert into public.happy_hour_slots (happy_hour_id, merchant_id, weekday, starts_at, ends_at)
select 'f0000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;
insert into public.happy_hour_items (happy_hour_id, merchant_id, item_id)
values ('f0000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')), 1,
          'Pro : l''offre s''applique');
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')), 0,
          'retour à Start : l''offre est conservée mais ne s''applique plus');
select is((select count(*)::int from public.happy_hours where id = 'f0000000-0000-0000-0000-0000000000a1'), 1,
          'retour à Start : aucune donnée supprimée');
update public.subscriptions set status = 'past_due' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is(public.merchant_plan_of('30000000-0000-0000-0000-000000000001'), null, 'impayé : plus de droits');
update public.subscriptions set plan = 'pro', status = 'active' where merchant_id = '30000000-0000-0000-0000-000000000001';

-- Statistiques : 7 jours pour Start, davantage pour Pro
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.merchant_sales_by_day('30000000-0000-0000-0000-000000000001', 7)), 7, 'Start : 7 jours');
select is((select count(*)::int from public.merchant_sales_by_day('30000000-0000-0000-0000-000000000001', 30)), 0, 'Start : 30 jours refusés');
reset role;
update public.subscriptions set plan = 'pro' where merchant_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.merchant_sales_by_day('30000000-0000-0000-0000-000000000001', 30)), 30, 'Pro : 30 jours');
reset role;

-- -----------------------------------------------------------------------------
-- Livreur : Start (une course, pas de nuit) et Pro (deux courses, nuit)
-- -----------------------------------------------------------------------------
update public.courier_subscriptions set plan = 'start' where courier_id = '80000000-0000-0000-0000-000000000001';
select is(public.courier_capacity('80000000-0000-0000-0000-000000000001'), 1, 'livreur Start : une course à la fois');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'a')) $$, 'Start : première course');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'b')) $$,
                 '22023', 'courier_at_capacity', 'Start : pas de deuxième course');
reset role;
update public.courier_subscriptions set plan = 'pro' where courier_id = '80000000-0000-0000-0000-000000000001';
select is(public.courier_capacity('80000000-0000-0000-0000-000000000001'), 2, 'livreur Pro : deux courses');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'b')) $$, 'Pro : deuxième course compatible');
reset role;

-- Nuit : 23 h à Paris, uniquement pour les livreurs Pro
select ok(public.is_night_delivery(timestamptz '2026-10-20 21:30:00+00'), '23 h 30 (Paris) : nuit');
select ok(public.is_night_delivery(timestamptz '2026-10-20 03:00:00+00'), '5 h (Paris) : nuit');
select ok(not public.is_night_delivery(timestamptz '2026-10-20 12:00:00+00'), '14 h (Paris) : jour');
select ok(not public.is_night_delivery(timestamptz '2026-10-20 04:00:00+00'), '6 h (Paris) : jour');
update public.orders set courier_id = null, status = 'accepted';
update public.orders set estimated_ready_at = timestamptz '2099-01-02 21:30:00+00' where id = (select id from o where key = 'n');
update public.courier_subscriptions set plan = 'start' where courier_id = '80000000-0000-0000-0000-000000000001';
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(not exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'n')),
          'Start : la mission de nuit n''est pas proposée');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'n')) $$,
                 '22023', 'night_requires_pro', 'Start : la prise d''une mission de nuit est refusée côté serveur');
reset role;
update public.courier_subscriptions set plan = 'pro' where courier_id = '80000000-0000-0000-0000-000000000001';
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'n')),
          'Pro : la mission de nuit est proposée');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'n')) $$, 'Pro : mission de nuit acceptée');
reset role;
update public.courier_subscriptions set status = 'canceled' where courier_id = '80000000-0000-0000-0000-000000000001';
select is(public.courier_plan_of('80000000-0000-0000-0000-000000000001'), null, 'abonnement livreur résilié : plus de formule');

select * from finish();
rollback;
