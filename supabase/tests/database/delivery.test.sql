begin;
select plan(88);

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
-- Commande livrée : repas payé en ligne, course prise puis réglée plus tard
-- -----------------------------------------------------------------------------
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), pg_temp.addr(48.9000, 2.4000))$$,
                 'delivery_out_of_range', 'commande hors du rayon refusée');
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), pg_temp.addr(p_phone => 'abc'))$$,
                 'invalid_delivery_phone', 'téléphone obligatoire pour la livraison');
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab(), '{"city": "Paris"}'::jsonb)$$,
                 'invalid_delivery_address', 'adresse incomplète refusée');
select throws_ok($$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                    pg_temp.kebab(), null, pg_temp.addr(), 'cash')$$,
                 'cash_not_allowed_for_delivery', 'le repas livré ne se paie pas en espèces');
select throws_ok($$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                    pg_temp.kebab(), null, null, 'cash')$$,
                 'cash_not_accepted', 'espèces refusées si le restaurant ne les accepte pas');

insert into o values ('a', pg_temp.deliver_order(pg_temp.menu()));
select is(
  (select fulfillment || '|' || status || '|' || total_cents || '|' || delivery_fee_cents || '|' || (courier_id is null)
          || '|' || delivery_payment_method || '|' || (delivery_code ~ '^\d{4}$')
   from public.orders where id = (select id from o where key = 'a')),
  'delivery|pending_payment|1900|350|true|card|true',
  'livraison : repas 19 € en attente de paiement, aucun livreur réservé, course 3,50 € à régler plus tard'
);
select ok((select delivery_distance_m between 500 and 800 from public.orders where id = (select id from o where key = 'a')),
          'distance calculée');
select is(
  (select available::text from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
  'true', 'aucun livreur n''est réservé par la commande');

-- Le repas autorisé suffit à envoyer la commande au restaurant.
select is((select status::text from public.mark_order_authorized((select id from o where key = 'a'), 'pi_repas')),
          'placed', 'repas autorisé : commande envoyée au restaurant');

-- Léa et Karim sont rattachés et disponibles.
update public.couriers set is_available = true;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.available_missions()), 0, 'pas de mission avant l''acceptation du restaurant');
reset role;

select is((select status::text from public.apply_order_transition((select id from o where key = 'a'),
            '10000000-0000-0000-0000-000000000001', 'accepted', 10)),
          'accepted', 'le restaurant accepte sans attendre un livreur');

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select delivery_fee_cents || '|' || payment_method || '|' || delivery_city from public.available_missions()),
          '350|card|Paris', 'Karim voit la mission (ville seulement, pas l''adresse)');
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.available_missions()), 1, 'Léa voit la même mission');
select is((select count(*)::int from public.orders), 0, 'sans voir la commande elle-même');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is(
  (select courier_name || '|' || (delivery_payment_due_at is not null)
   from public.courier_accept_mission((select id from o where key = 'a'))),
  'Karim|true', 'Karim accepte : le client a 5 minutes pour régler la course');
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select throws_ok($$select public.courier_accept_mission((select id from o where key = 'a'))$$,
                 'mission_unavailable', 'le premier qui accepte gagne');
select is((select count(*)::int from public.available_missions()), 0, 'la mission disparaît pour les autres');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is(
  (select delivery_address_line || '|' || delivery_phone from public.orders where id = (select id from o where key = 'a')),
  '5 rue Saint-Augustin|06 98 76 54 32', 'Karim voit l''adresse et le téléphone du client'
);
select is((select count(*)::int from public.order_items where order_id = (select id from o where key = 'a')), 1,
          'et le contenu de la commande');
reset role;

-- Course réglée par carte, sur le compte du livreur.
select is((select courier_stripe_account_id from public.start_delivery_payment((select id from o where key = 'a'),
            '20000000-0000-0000-0000-000000000001')),
          'acct_demo_karim', 'le client règle la course sur le compte de Karim');
select throws_ok($$select public.start_delivery_payment((select id from o where key = 'a'), '20000000-0000-0000-0000-000000000099')$$,
                 'order_not_found', 'un autre client ne peut pas payer cette course');
select is((select id from public.mark_delivery_authorized((select id from o where key = 'a'), 'pi_inconnu')), null::uuid,
          'un paiement non rattaché à cette course est ignoré');
select public.attach_delivery_payment_intent((select id from o where key = 'a'),
  (select courier_id from public.orders where id = (select id from o where key = 'a')), 'pi_course');

select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001', 'ready');
select throws_ok(
  $$select public.apply_order_transition((select id from o where key = 'a'), '10000000-0000-0000-0000-000000000001',
      'out_for_delivery', p_pickup_code => (select pickup_code from public.orders where id = (select id from o where key = 'a')))$$,
  'delivery_not_paid', 'pas de remise au livreur tant que la course n''est pas payée');
select is((select delivery_paid_at is not null from public.mark_delivery_authorized((select id from o where key = 'a'), 'pi_course')),
          true, 'course payée par carte');
select throws_ok($$select public.start_delivery_payment((select id from o where key = 'a'), '20000000-0000-0000-0000-000000000001')$$,
                 'delivery_not_payable', 'une course payée ne se repaie pas');
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
-- Capacité : 2 livraisons simultanées par livreur
-- -----------------------------------------------------------------------------
create function pg_temp.accepted_delivery(p_key text, p_method public.payment_method default 'card') returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                               pg_temp.kebab(), null, pg_temp.addr(), 'card', p_method);
  insert into o values (p_key, v_id);
  perform public.mark_order_authorized(v_id, 'pi_' || p_key);
  perform public.apply_order_transition(v_id, '10000000-0000-0000-0000-000000000001', 'accepted', 10);
end $$;

select pg_temp.accepted_delivery('b');
select pg_temp.accepted_delivery('c');
select pg_temp.accepted_delivery('d');
-- Léa se met indisponible : Karim est le seul livreur.
update public.couriers set is_available = false where siret = '12345678900015';

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.available_missions()), 3, 'Karim voit les 3 missions');
select lives_ok($$select public.courier_accept_mission((select id from o where key = 'b'))$$, 'Karim prend une première course');
select lives_ok($$select public.courier_accept_mission((select id from o where key = 'c'))$$, 'et une deuxième, en même temps');
select throws_ok($$select public.courier_accept_mission((select id from o where key = 'd'))$$,
                 'courier_at_capacity', 'pas de troisième : 2 livraisons simultanées au maximum');
select is((select count(*)::int from public.available_missions()), 0, 'plus de mission proposée au livreur complet');
reset role;
select is(
  (select reason from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
  'no_courier_available', 'devis : aucun livreur avec de la capacité');
select throws_ok($$select pg_temp.deliver_order(pg_temp.kebab())$$, 'no_courier_available',
                 'commande livrée refusée tant qu''aucun livreur n''est libre');

-- Renoncement, paiement obligatoire, délai de paiement.
select is((select count(*)::int from public.courier_release_mission((select id from o where key = 'c'),
            '70000000-0000-0000-0000-000000000001')), 1, 'Karim renonce à la course c');
select is((select (courier_id is null)::text from public.orders where id = (select id from o where key = 'c')), 'true',
          'la course retourne dans le pool');
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select throws_ok($$select public.courier_accept_mission((select id from o where key = 'c'))$$,
                 'mission_unavailable', 'une course abandonnée n''est pas reproposée au même livreur');
select lives_ok($$select public.courier_accept_mission((select id from o where key = 'd'))$$, 'la capacité libérée permet de prendre d');
select throws_ok($$select count(*) from public.order_courier_skips$$, '42501', null, 'la table des renoncements est inaccessible aux clients de l''API');
reset role;
select public.attach_delivery_payment_intent((select id from o where key = 'b'),
  (select courier_id from public.orders where id = (select id from o where key = 'b')), 'pi_b_course');
select public.mark_delivery_authorized((select id from o where key = 'b'), 'pi_b_course');
select throws_ok($$select public.courier_release_mission((select id from o where key = 'b'), '70000000-0000-0000-0000-000000000001')$$,
                 'mission_locked', 'une course déjà payée ne peut plus être abandonnée');

select public.attach_delivery_payment_intent((select id from o where key = 'd'),
  (select courier_id from public.orders where id = (select id from o where key = 'd')), 'pi_d_course');
select is((select count(*)::int from public.expire_unpaid_missions()), 0, 'délai de paiement pas encore dépassé');
update public.orders set delivery_payment_due_at = now() - interval '1 minute' where id = (select id from o where key = 'd');
select is((select delivery_payment_intent_id from public.expire_unpaid_missions()
           where order_id = (select id from o where key = 'd')),
          'pi_d_course', 'course non payée à temps : libérée, paiement à annuler chez Stripe');
select is((select (courier_id is null)::text || '|' || (delivery_payment_intent_id is null)::text
           from public.orders where id = (select id from o where key = 'd')), 'true|true', 'la course d retourne dans le pool');
select is((select reason from public.order_courier_skips where order_id = (select id from o where key = 'd')),
          'payment_timeout', 'le livreur défaillant n''est pas reproposé');
select is((select id from public.mark_delivery_authorized((select id from o where key = 'd'), 'pi_d_course')), null::uuid,
          'un paiement tardif de l''ancien livreur n''est pas pris en compte');

-- -----------------------------------------------------------------------------
-- Espèces
-- -----------------------------------------------------------------------------
-- Course en espèces : Léa (disponible à nouveau) la prend, aucun paiement en ligne à attendre.
update public.couriers set is_available = true where siret = '12345678900015';
select pg_temp.accepted_delivery('e', 'cash');
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select is((select (delivery_payment_due_at is null)::text || '|' || delivery_payment_method
           from public.courier_accept_mission((select id from o where key = 'e'))),
          'true|cash', 'course en espèces : pas de délai de paiement');
reset role;
select public.apply_order_transition((select id from o where key = 'e'), '10000000-0000-0000-0000-000000000001', 'ready');
select is(
  (select status::text from public.apply_order_transition((select id from o where key = 'e'), '10000000-0000-0000-0000-000000000001',
      'out_for_delivery', p_pickup_code => (select pickup_code from public.orders where id = (select id from o where key = 'e')))),
  'out_for_delivery', 'espèces : remise au livreur sans paiement en ligne');
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000002');
select is((select (delivery_paid_at is not null)::text from public.courier_mark_delivered((select id from o where key = 'e'),
            (select delivery_code from public.orders where id = (select id from o where key = 'e')))),
          'true', 'course en espèces encaissée à la livraison');
reset role;

-- Retrait en espèces au comptoir (restaurant qui l'accepte).
update public.merchants set accepts_cash_pickup = true where id = '30000000-0000-0000-0000-000000000001';
insert into o values ('f', (select id from public.create_order('20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', pg_temp.kebab(), null, null, 'cash')));
select is((select status || '|' || meal_payment_method || '|' || (stripe_payment_intent_id is null)
           from public.orders where id = (select id from o where key = 'f')),
          'placed|cash|true', 'retrait en espèces : la commande part directement, sans paiement en ligne');
select public.apply_order_transition((select id from o where key = 'f'), '10000000-0000-0000-0000-000000000001', 'accepted', 10);
select public.apply_order_transition((select id from o where key = 'f'), '10000000-0000-0000-0000-000000000001', 'ready');
select is((select (paid_at is not null)::text from public.apply_order_transition((select id from o where key = 'f'),
            '10000000-0000-0000-0000-000000000001', 'collected',
            p_pickup_code => (select pickup_code from public.orders where id = (select id from o where key = 'f')))),
          'true', 'espèces encaissées au retrait');

-- -----------------------------------------------------------------------------
-- Livraison sans livreur, expiration, RGPD
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.set_customer_departure((select id from o where key = 'b'), '20000000-0000-0000-0000-000000000001', 60, 'walk')$$,
  'order_not_found', '« Je pars maintenant » réservé au retrait'
);

insert into o values ('g', pg_temp.deliver_order(pg_temp.kebab()));
select public.mark_order_authorized((select id from o where key = 'g'), 'pi_g');
update public.orders set placed_at = now() - interval '11 minutes' where id = (select id from o where key = 'g');
select is(
  (select stripe_payment_intent_id from public.expire_stale_orders() where order_id = (select id from o where key = 'g')),
  'pi_g', 'expiration : le repas non accepté est libéré chez Stripe'
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
