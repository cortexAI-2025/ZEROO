begin;
select plan(59);

-- Contexte (seed) : « Chez Samir » (48.8686, 2.3314) livre à 3 km pour 3,50 € ; Karim est
-- livreur, rattaché, actif et disponible. Nadia est cliente, Samir le commerçant.
delete from public.orders;
delete from public.loyalty_cards;
-- Seul le livreur de démo, rattaché et disponible (indépendant des tests de bout en bout).
delete from public.couriers where id <> '80000000-0000-0000-0000-000000000001';
update public.couriers set is_available = true, last_assigned_at = null;
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, t.opens, t.closes
from generate_series(1, 7) d, (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(opens, closes);

insert into auth.users (id, email) values
  ('70000000-0000-0000-0000-000000000002', 'nouveau-livreur@test.fr'),
  ('70000000-0000-0000-0000-000000000003', 'autre-livreur@test.fr');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Une adresse de livraison (≈ 650 m du restaurant par défaut).
create function pg_temp.addr(p_lat float8 default 48.8700, p_lng float8 default 2.3400, p_phone text default '06 98 76 54 32')
returns jsonb language sql as $$
  select jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                            'latitude', p_lat, 'longitude', p_lng, 'phone', p_phone, 'instructions', 'Digicode 1234')
$$;

create function pg_temp.kebab() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
    'option_ids', (select jsonb_agg(o.id) from public.menu_options o
                   where o.group_id = '60000000-0000-0000-0000-000000000003' and o.name = 'Blanche')))
$$;

create function pg_temp.menu() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000002', 'quantity', 2))
$$;

create function pg_temp.deliver_order(p_items jsonb, p_addr jsonb default pg_temp.addr()) returns uuid language sql as $$
  select id from public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                     p_items, null, p_addr)
$$;

create temporary table o (key text primary key, id uuid);
grant all on o to authenticated;

-- -----------------------------------------------------------------------------
-- SIRET
-- -----------------------------------------------------------------------------
select ok(public.is_valid_siret('73282932000074'), 'SIRET valide (clé de Luhn)');
select ok(not public.is_valid_siret('73282932000075') and not public.is_valid_siret('1234'),
          'SIRET mal formé ou clé fausse refusé');

-- -----------------------------------------------------------------------------
-- Inscription d'un livreur
-- -----------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$select public.create_courier('Léa', '0611223344', 'auto_entrepreneur', '12345678900015', 'bike')$$,
  '42501', null, 'un visiteur ne peut pas devenir livreur'
);
reset role;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.create_courier('Léa', '0611223344', 'auto_entrepreneur', '12345678900016', 'bike')$$,
  'invalid_siret', 'SIRET invalide refusé'
);
select throws_ok(
  $$select public.create_courier('Léa', '0611223344', 'auto_entrepreneur', '882 123 456 00015', 'bike')$$,
  'siret_taken', 'un SIRET déjà inscrit est refusé (espaces ignorés)'
);
select is(
  (select siret || '|' || is_available from public.create_courier('Léa M.', '06 11 22 33 44', 'auto_entrepreneur',
                                                                   '123 456 789 00015', 'bike')),
  '12345678900015|false', 'profil livreur créé, indisponible par défaut'
);
select throws_ok(
  $$select public.create_courier('Léa', '0611223344', 'societe', '73282932000074', 'car')$$,
  'courier_exists', 'un seul profil livreur par compte'
);
select is((select count(*)::int from public.couriers), 1, 'le livreur ne voit que son profil');
select is((select count(*)::int from public.courier_stripe_accounts), 0, 'ni les comptes Stripe des autres');

-- Disponibilité : compte de paiement, abonnement et restaurant requis.
select throws_ok($$select public.set_courier_availability(true)$$, 'courier_payments_not_ready',
                 'disponible impossible sans compte Stripe actif');
reset role;
insert into public.courier_stripe_accounts (courier_id, stripe_account_id, charges_enabled)
select id, 'acct_lea', true from public.couriers where siret = '12345678900015';
set local role authenticated;
select throws_ok($$select public.set_courier_availability(true)$$, 'courier_subscription_inactive',
                 'disponible impossible sans abonnement');
reset role;
insert into public.courier_subscriptions (courier_id, stripe_customer_id, status)
select id, 'cus_lea', 'trialing' from public.couriers where siret = '12345678900015';
set local role authenticated;
select throws_ok($$select public.set_courier_availability(true)$$, 'courier_no_merchant',
                 'disponible impossible sans restaurant partenaire');

-- Rattachement
select is((select status::text from public.request_merchant_link('30000000-0000-0000-0000-000000000001')),
          'pending', 'demande de rattachement envoyée');
select is((select status::text from public.request_merchant_link('30000000-0000-0000-0000-000000000001')),
          'pending', 'redemander est sans effet');
select throws_ok($$select public.decide_courier_link((select id from public.couriers), true)$$,
                 'courier_not_found', 'le livreur ne peut pas valider sa propre demande');
select is((select count(*)::int from public.merchants where id = '30000000-0000-0000-0000-000000000001'), 1,
          'le livreur voit le restaurant');

-- Côté restaurant
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.couriers), 2, 'le restaurant voit ses livreurs et candidats');
select is(
  (select status::text from public.decide_courier_link(
    (select id from public.couriers where siret = '12345678900015'), true)),
  'approved', 'le restaurant accepte le livreur'
);
select lives_ok($$update public.merchants set delivery_fee_cents = 400, delivery_radius_m = 5000
                  where id = '30000000-0000-0000-0000-000000000001'$$,
                'le restaurant règle le prix de la course et son rayon');
select throws_ok($$update public.merchants set delivery_fee_cents = 10 where id = '30000000-0000-0000-0000-000000000001'$$,
                 '23514', null, 'course de moins de 0,50 € refusée (minimum Stripe)');
update public.merchants set delivery_fee_cents = 350, delivery_radius_m = 3000 where id = '30000000-0000-0000-0000-000000000001';

select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select is((select is_available from public.set_courier_availability(true)), true, 'Léa se rend disponible');
select lives_ok($$select public.set_courier_availability(false)$$, 'puis indisponible');

-- Refus : plus de nouvelle demande possible.
select pg_temp.as_user('70000000-0000-0000-0000-000000000003');
select public.create_courier('Tom', '0700000000', 'societe', '73282932000074', 'car');
select public.request_merchant_link('30000000-0000-0000-0000-000000000001');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select public.decide_courier_link((select id from public.couriers where siret = '73282932000074'), false);
select pg_temp.as_user('70000000-0000-0000-0000-000000000003');
select throws_ok($$select public.request_merchant_link('30000000-0000-0000-0000-000000000001')$$,
                 'link_rejected', 'un livreur refusé ne peut pas relancer sa demande');

-- Le client ne voit jamais la table des livreurs.
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.couriers), 0, 'le client ne voit aucun livreur');
reset role;

-- -----------------------------------------------------------------------------
-- Devis
-- -----------------------------------------------------------------------------
select is(
  (select available || '|' || fee_cents from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
  'true|350', 'livraison possible dans le rayon : 3,50 €'
);
select is(
  (select reason from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.9000, 2.4000)),
  'delivery_out_of_range', 'adresse hors du rayon'
);

-- -----------------------------------------------------------------------------
-- Commande livrée
-- -----------------------------------------------------------------------------
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), pg_temp.addr(48.9000, 2.4000))$$,
                 'delivery_out_of_range', 'commande hors du rayon refusée');
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), pg_temp.addr(p_phone => 'abc'))$$,
                 'invalid_delivery_phone', 'téléphone obligatoire pour la livraison');
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), '{"city": "Paris"}'::jsonb)$$,
                 'invalid_delivery_address', 'adresse incomplète refusée');

insert into o values ('a', pg_temp.deliver_order(pg_temp.menu()));
select is(
  (select fulfillment || '|' || status || '|' || total_cents || '|' || delivery_fee_cents || '|' || courier_name
          || '|' || courier_stripe_account_id || '|' || (delivery_code ~ '^\d{4}$')
   from public.orders where id = (select id from o where key = 'a')),
  'delivery|pending_payment|1900|350|Karim|acct_demo_karim|true',
  'livraison : repas 19 € pour le restaurant, course 3,50 € pour Karim, code de livraison'
);
select ok((select delivery_distance_m between 500 and 800 from public.orders where id = (select id from o where key = 'a')),
          'distance calculée');
select is(
  (select reason from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
  'no_courier_available', 'Karim est réservé : plus de livreur libre'
);
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab())$$, 'no_courier_available',
                 'une deuxième livraison simultanée est refusée');
select lives_ok($$select public.create_order('20000000-0000-0000-0000-000000000001',
                  '30000000-0000-0000-0000-000000000001', pg_temp.kebab())$$, 'le retrait reste possible');

-- Paiements : la commande part quand le repas ET la course sont autorisés.
select is((select status::text from public.mark_order_authorized((select id from o where key = 'a'), 'pi_repas')),
          'pending_payment', 'repas autorisé seul : en attente du paiement de la course');
select is((select status::text from public.mark_delivery_authorized((select id from o where key = 'a'), 'pi_course')),
          'placed', 'course autorisée : commande envoyée');

-- Le restaurant n'accepte qu'après la confirmation du livreur.
select throws_ok(
  $$select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001', 'accepted', 10)$$,
  'courier_not_confirmed', 'acceptation impossible avant la confirmation du livreur'
);

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select throws_ok($$select public.courier_confirm_order((select id from o where key = 'a'))$$, 'order_not_found',
                 'un autre livreur ne peut pas confirmer la course');
select is((select count(*)::int from public.orders), 0, 'un autre livreur ne voit pas la course');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is(
  (select delivery_address_line || '|' || delivery_phone from public.orders where id = (select id from o where key = 'a')),
  '5 rue Saint-Augustin|06 98 76 54 32', 'Karim voit l''adresse et le téléphone du client'
);
select is((select count(*)::int from public.order_items where order_id = (select id from o where key = 'a')), 1,
          'et le contenu de la commande');
select ok((select courier_accepted_at is not null from public.courier_confirm_order((select id from o where key = 'a'))),
          'Karim confirme la course');
reset role;

select is(
  (select status || '|' || (paid_at is not null) || '|' || (delivery_paid_at is not null)
   from public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001', 'accepted', 10)),
  'accepted|true|true', 'le restaurant accepte : repas et course encaissés'
);
select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001', 'ready');
select throws_ok(
  $$select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001', 'collected',
      p_pickup_code => (select pickup_code from public.orders where id = (select id from o where key = 'a')))$$,
  'invalid_transition: ready -> collected', 'une commande livrée n''est pas « récupérée » au comptoir'
);
select throws_ok(
  $$select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001',
      'out_for_delivery', p_pickup_code => 'ZZZZ')$$,
  'invalid_pickup_code', 'remise au livreur : code de retrait vérifié'
);
select is(
  (select status::text from public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001',
      'out_for_delivery', p_pickup_code => (select pickup_code from public.orders where id = (select id from o where key = 'a')))),
  'out_for_delivery', 'commande remise au livreur'
);

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$select public.courier_mark_delivered((select id from o where key = 'a'), '0000')$$, 'order_not_found',
                 'seul le livreur valide la livraison');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.courier_mark_delivered((select id from o where key = 'a'),
      case (select delivery_code from public.orders where id = (select id from o where key = 'a')) when '0000' then '1111' else '0000' end)$$,
  'invalid_delivery_code', 'code de livraison faux refusé'
);
select is(
  (select status::text from public.courier_mark_delivered((select id from o where key = 'a'),
      (select delivery_code from public.orders where id = (select id from o where key = 'a')))),
  'delivered', 'livrée avec le code du client'
);
select is((select today_cents || '|' || today_count from public.courier_earnings_summary()), '350|1',
          'revenus du jour de Karim : 3,50 €');
reset role;
select is(
  (select paid_menus_count from public.loyalty_cards
   where user_id = '20000000-0000-0000-0000-000000000001' and merchant_id = '30000000-0000-0000-0000-000000000001'),
  2, 'les 2 menus livrés comptent pour la fidélité'
);
select is((select revenue_cents from public.merchant_today_summary('30000000-0000-0000-0000-000000000001')), 0::bigint,
          'chiffre d''affaires réservé au propriétaire');

-- -----------------------------------------------------------------------------
-- Le livreur décline, expiration, RGPD
-- -----------------------------------------------------------------------------
insert into o values ('b', pg_temp.deliver_order(pg_temp.kebab()));
select public.mark_order_authorized((select id from o where key = 'b'), 'pi_b');
select public.mark_delivery_authorized((select id from o where key = 'b'), 'pi_b_course');
select is(
  (select status || '|' || cancelled_by from public.apply_order_transition((select id from o where key = 'b'),
      '70000000-0000-0000-0000-000000000001', 'cancelled')),
  'cancelled|courier', 'Karim décline : commande annulée, sans débit'
);
select is(
  (select available::text from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
  'true', 'Karim est de nouveau libre'
);
select throws_ok(
  $$select public.set_customer_departure((select id from o where key = 'b'), '20000000-0000-0000-0000-000000000001', 60, 'walk')$$,
  'order_not_found', '« Je pars maintenant » réservé au retrait'
);

insert into o values ('c', pg_temp.deliver_order(pg_temp.kebab()));
select public.mark_order_authorized((select id from o where key = 'c'), 'pi_c');
select public.mark_delivery_authorized((select id from o where key = 'c'), 'pi_c_course');
update public.orders set placed_at = now() - interval '11 minutes' where id = (select id from o where key = 'c');
select is(
  (select delivery_payment_intent_id from public.expire_stale_orders() where order_id = (select id from o where key = 'c')),
  'pi_c_course', 'expiration : le paiement de la course est aussi libéré'
);

update public.orders set delivered_at = now() - interval '8 days' where id = (select id from o where key = 'a');
select is(public.purge_delivery_details(), 1, 'adresse effacée 7 jours après la livraison');
select is(
  (select coalesce(delivery_address_line, '-') || '|' || coalesce(delivery_phone, '-') || '|' || delivery_city
   from public.orders where id = (select id from o where key = 'a')),
  '-|-|Paris', 'seule la ville est conservée'
);

-- Suppression de compte : abonnement à résilier d'abord.
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select throws_ok($$select public.delete_my_account()$$, 'courier_subscription_active',
                 'un livreur abonné doit résilier avant de supprimer son compte');
reset role;

select * from finish();
rollback;
