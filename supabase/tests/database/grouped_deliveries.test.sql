begin;
select plan(22);

delete from public.orders;
delete from public.couriers where id <> '80000000-0000-0000-0000-000000000001';
update public.couriers set last_assigned_at = null;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'dark@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude,
                              is_published, payment_link)
values ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cuisine-fantome',
        'Cuisine Fantôme', 'dark_kitchen', '8 rue Cachée', '75003', 'Paris', 48.8600, 2.3600,
        true, 'https://pay.sumup.com/b2c/fantome');
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select 'd0000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;
insert into public.menu_categories (id, merchant_id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Bowls');
insert into public.menu_items (id, merchant_id, category_id, name, price_cents) values
  ('d2000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001', 'Bowl poulet', 1100);
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('d0000000-0000-0000-0000-000000000001', 'cus_fantome', 'sub_fantome', 'active', 'pro');
update public.merchants set delivery_enabled = true where id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001';
insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('d0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now());

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
create function pg_temp.bowl() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_id', 'd2000000-0000-0000-0000-000000000001', 'quantity', 1))
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
from unnest(array['a', 'b', 'd']) k;
select pg_temp.accepted_delivery('x', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', pg_temp.bowl());


-- Estimations de départ : tout est prêt dans 10 minutes, mêmes adresses de livraison.
update public.orders set estimated_ready_at = now() + interval '10 minutes';

select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'a')) $$, 'première course acceptée');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'b')) $$,
                'même restaurant, mêmes adresses, préparations alignées : deuxième course acceptée');

-- Remise à zéro de la tournée pour tester les refus.
reset role;
update public.orders set courier_id = null, status = 'accepted' where id in (select id from o);
update public.orders set courier_id = '80000000-0000-0000-0000-000000000001' where id = (select id from o where key = 'a');

-- Préparations trop éloignées dans le temps (> 15 min).
update public.orders set estimated_ready_at = now() + interval '40 minutes' where id = (select id from o where key = 'b');
select ok(not public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'b')),
          'écart de préparation > 15 min : incompatible');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'b')) $$,
                 '22023', 'mission_not_compatible', 'prise refusée côté serveur');
select ok(not exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'b')),
          'la mission incompatible n''est plus proposée');
select ok(exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'd')),
          'une mission compatible reste proposée');

-- Livraisons trop éloignées (> 2 km).
reset role;
update public.orders set estimated_ready_at = now() + interval '10 minutes';
update public.orders set delivery_latitude = 48.9500, delivery_longitude = 2.4500 where id = (select id from o where key = 'b');
select ok(not public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'b')),
          'adresses de livraison > 2 km : incompatible');
update public.orders set delivery_latitude = 48.8705, delivery_longitude = 2.3405 where id = (select id from o where key = 'b');
select ok(public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'b')),
          'adresses voisines : compatible');

-- Restaurants éloignés.
select ok(not public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'x'))
          or public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'x')),
          'restaurants différents : règle évaluée sans erreur');
update public.merchant_locations set latitude = 48.9000, longitude = 2.5000 where merchant_id = 'd0000000-0000-0000-0000-000000000001';
select ok(not public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'x')),
          'restaurants à plus de 1 km : incompatible');

-- Une course déjà récupérée n'accepte plus de groupage.
update public.orders set status = 'out_for_delivery' where id = (select id from o where key = 'a');
select ok(not public.missions_compatible((select id from o where key = 'a'), (select id from o where key = 'b')),
          'première course déjà en route : pas de groupage');
update public.orders set status = 'accepted' where id = (select id from o where key = 'a');

-- Tournée : arrêts numérotés, un arrêt de retrait pour deux commandes du même restaurant.
update public.orders set courier_id = '80000000-0000-0000-0000-000000000001' where id = (select id from o where key = 'b');
create temporary table stops as select * from public.route_for_courier('80000000-0000-0000-0000-000000000001');
select is((select count(*)::int from stops), 4, '2 retraits + 2 livraisons');
select is((select count(distinct stop_no)::int from stops where kind = 'pickup'), 1, 'un seul arrêt de retrait (même restaurant)');
select is((select count(distinct stop_no)::int from stops where kind = 'dropoff'), 2, 'deux arrêts de livraison distincts');
select ok((select min(stop_no) from stops where kind = 'dropoff') > (select max(stop_no) from stops where kind = 'pickup'),
          'retraits avant livraisons');
select ok((select bool_and(eta > now()) from stops), 'heures estimées dans le futur');

-- Statuts distincts : la commande a passe en route, la b reste en préparation.
update public.orders set status = 'out_for_delivery' where id = (select id from o where key = 'b');
select is((select status::text from public.orders where id = (select id from o where key = 'a')), 'accepted', 'statut propre à chaque commande (a)');
select is((select status::text from public.orders where id = (select id from o where key = 'b')), 'out_for_delivery', 'statut propre à chaque commande (b)');

-- ETA : visible du seul client de la commande, arrondie aux 5 minutes.
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(public.order_delivery_eta((select id from o where key = 'a')) is not null, 'le client voit l''heure estimée de sa commande');
select ok(extract(epoch from public.order_delivery_eta((select id from o where key = 'a')))::bigint % 300 = 0, 'arrondie aux 5 minutes');
select pg_temp.as_user('20000000-0000-0000-0000-000000000099');
select is(public.order_delivery_eta((select id from o where key = 'a')), null, 'un autre utilisateur n''obtient rien');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select ok(not exists (select 1 from public.courier_stops() where order_id not in (select id from o)), 'courier_stops : tournée du livreur uniquement');
reset role;

select * from finish();
rollback;
