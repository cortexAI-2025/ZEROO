begin;
select plan(24);

-- Contexte : « Chez Samir » (seed), ouvert 24 h/24, cliente Nadia sans historique.
--   Menu Tacos 10,50 € et Menu Américain 9,50 € = menus formules ; Kebab et Canette = détail.
delete from public.orders;
delete from public.loyalty_cards;
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, t.opens, t.closes
from generate_series(1, 7) d, (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(opens, closes);

create function pg_temp.opt(p_item uuid, p_name text) returns uuid language sql as $$
  select o.id from public.menu_options o join public.menu_option_groups g on g.id = o.group_id
  where g.item_id = p_item and o.name = p_name
$$;

-- Commande créée par le serveur (Edge Function create-order) pour Nadia.
create function pg_temp.order_for(p_customer uuid, p_items jsonb) returns uuid language sql as $$
  select id from public.create_order(p_customer, '30000000-0000-0000-0000-000000000001', p_items)
$$;

-- Parcours complet jusqu'à la remise au client.
create function pg_temp.collect(p_order uuid) returns void language plpgsql as $$
begin
  perform public.mark_order_authorized(p_order, 'pi_' || p_order);
  perform public.apply_order_transition(p_order, '10000000-0000-0000-0000-000000000001', 'accepted', 10);
  perform public.apply_order_transition(p_order, '10000000-0000-0000-0000-000000000001', 'ready');
  perform public.apply_order_transition(p_order, '10000000-0000-0000-0000-000000000001', 'collected',
    p_pickup_code => (select pickup_code from public.orders where id = p_order));
end;
$$;

create function pg_temp.card() returns text language sql as $$
  select paid_menus_count || '/' || rewards_available || '/' || rewards_redeemed
  from public.loyalty_cards
  where user_id = '20000000-0000-0000-0000-000000000001' and merchant_id = '30000000-0000-0000-0000-000000000001'
$$;

create function pg_temp.tacos(p_qty int, p_reward boolean default false, p_options text[] default array['Algérienne'])
returns jsonb language sql as $$
  select jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000001', 'quantity', p_qty, 'use_reward', p_reward,
    'option_ids', (select jsonb_agg(pg_temp.opt('50000000-0000-0000-0000-000000000001', n)) from unnest(p_options) n)
  )
$$;

create temporary table o (key text primary key, id uuid);
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000099', 'sans-carte@test.fr');

-- -----------------------------------------------------------------------------
-- Décompte
-- -----------------------------------------------------------------------------
insert into o values ('first', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
  pg_temp.tacos(3),
  jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
    'option_ids', jsonb_build_array(pg_temp.opt('50000000-0000-0000-0000-000000000003', 'Blanche'))),
  jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000004', 'quantity', 2)
)));

select is(pg_temp.card(), null, 'pas de carte tant qu''aucune commande n''est récupérée');
select pg_temp.collect((select id from o where key = 'first'));
select is(pg_temp.card(), '3/0/0', '3 menus formules comptés, le kebab et les canettes (détail) ignorés');

select pg_temp.collect(pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000002', 'quantity', 7)
)));
select is(pg_temp.card(), '1/1/0', '3 + 7 = 10 menus : 1 menu offert, la carte repart à 1');

update public.orders set customer_note = 'modifié' where id = (select id from o where key = 'first');
select is(pg_temp.card(), '1/1/0', 'une commande récupérée n''est comptée qu''une fois');

-- Commande refusée ou non récupérée : rien n'est compté.
insert into o values ('refused', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(pg_temp.tacos(2))));
select public.mark_order_authorized((select id from o where key = 'refused'), 'pi_refused');
select public.apply_order_transition((select id from o where key = 'refused'), '10000000-0000-0000-0000-000000000001', 'refused');
select is(pg_temp.card(), '1/1/0', 'une commande refusée ne compte pas');

-- -----------------------------------------------------------------------------
-- Menu offert
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1, 'use_reward', true,
      'option_ids', jsonb_build_array(pg_temp.opt('50000000-0000-0000-0000-000000000003', 'Blanche')))))$$,
  '22023', 'invalid_reward',
  'refus : un produit au détail ne peut pas être offert'
);
select throws_ok(
  $$select pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(pg_temp.tacos(1, true), pg_temp.tacos(1, true, array['Samouraï'])))$$,
  '22023', 'invalid_reward',
  'refus : un seul menu offert par commande'
);
select throws_ok(
  $$select pg_temp.order_for('20000000-0000-0000-0000-000000000099', jsonb_build_array(pg_temp.tacos(1, true)))$$,
  '22023', 'no_reward_available',
  'refus : aucun menu offert disponible'
);
select is(pg_temp.card(), '1/1/0', 'les refus n''entament pas la carte');

insert into o values ('reward', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
  pg_temp.tacos(2, true, array['Algérienne', 'Cheddar'])
)));
select is(
  (select subtotal_cents || '|' || discount_cents || '|' || total_cents || '|' || is_loyalty_reward from public.orders where id = (select id from o where key = 'reward')),
  '2300|1050|1250|true',
  '2 menus à 11,50 € dont 1 offert : seul le prix du menu (10,50 €) est déduit, le cheddar reste dû'
);
select is(
  (select array_agg(quantity || ':' || is_loyalty_reward order by is_loyalty_reward) from public.order_items where order_id = (select id from o where key = 'reward')),
  array['1:false', '1:true'],
  'la ligne est scindée : 1 menu payé + 1 menu offert'
);
select is(pg_temp.card(), '1/0/0', 'le menu offert est réservé dès la commande');
select throws_ok(
  $$select pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(pg_temp.tacos(1, true)))$$,
  '22023', 'no_reward_available',
  'le même menu offert ne peut pas servir deux fois'
);

select public.mark_order_authorized((select id from o where key = 'reward'), 'pi_reward');
select public.apply_order_transition((select id from o where key = 'reward'), '10000000-0000-0000-0000-000000000001', 'refused');
select is(pg_temp.card(), '1/1/0', 'commande refusée : le menu offert est rendu');

insert into o values ('cancelled', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(pg_temp.tacos(1, true))));
select public.apply_order_transition((select id from o where key = 'cancelled'), '20000000-0000-0000-0000-000000000001', 'cancelled');
select is(pg_temp.card(), '1/1/0', 'commande annulée par le client : le menu offert est rendu');

insert into o values ('free', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000002', 'quantity', 1, 'use_reward', true)
)));
select is(
  (select total_cents || '|' || discount_cents from public.orders where id = (select id from o where key = 'free')),
  '0|950',
  'menu seul offert : commande à 0 €'
);
update public.orders set created_at = now() - interval '1 hour' where id = (select id from o where key = 'free');
select public.expire_stale_orders();
select is(pg_temp.card(), '1/1/0', 'commande expirée : le menu offert est rendu');

update public.menu_options set price_delta_cents = 30 where name = 'Cheddar';
insert into o values ('tiny', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(
  pg_temp.tacos(1, true, array['Algérienne', 'Cheddar'])
)));
select is(
  (select total_cents || '|' || discount_cents from public.orders where id = (select id from o where key = 'tiny')),
  '0|1080',
  'reste inférieur au minimum Stripe (0,30 €) : offert aussi'
);
update public.menu_options set price_delta_cents = 100 where name = 'Cheddar';
select public.apply_order_transition((select id from o where key = 'tiny'), '20000000-0000-0000-0000-000000000001', 'cancelled');

-- Menu offert récupéré, avec un autre menu payé dans la même commande.
insert into o values ('redeemed', pg_temp.order_for('20000000-0000-0000-0000-000000000001', jsonb_build_array(pg_temp.tacos(2, true))));
select pg_temp.collect((select id from o where key = 'redeemed'));
select is(pg_temp.card(), '2/0/1', 'menu offert utilisé : seul le menu payé compte (+1), 1 menu offert consommé');

-- -----------------------------------------------------------------------------
-- Accès
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is((select count(*)::int from public.loyalty_cards), 1, 'le client voit sa carte');
select throws_ok(
  $$update public.loyalty_cards set rewards_available = 99$$,
  '42501', null,
  'le client ne peut pas modifier sa carte'
);
set local request.jwt.claims = '{"sub": "10000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is((select count(*)::int from public.loyalty_cards), 1, 'le commerçant voit les cartes de ses clients');
reset role;
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000077', 'autre-client@test.fr');
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000077", "role": "authenticated"}';
select is((select count(*)::int from public.loyalty_cards), 0, 'un autre client ne voit pas la carte');
reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok('select * from public.loyalty_cards', '42501', null, 'aucun accès anonyme');
reset role;

select * from finish();
rollback;
