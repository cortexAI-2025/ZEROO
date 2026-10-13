begin;
select plan(31);

-- Contexte (seed) : Samir (10…01) possède « Chez Samir » (30…01) ; Nadia (20…01) est cliente ;
-- Karim (utilisateur 70…01, livreur 80…01) est rattaché.
delete from public.orders;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Une commande retirée, une livraison livrée (carte) et une livraison livrée (espèces), aujourd'hui.
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents,
                           created_at, collected_at)
values ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Nadia', 'collected', 1150, 1150, now(), now());
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents,
                           fulfillment, delivery_fee_cents, delivery_city, delivery_postal_code,
                           courier_id, courier_name, delivered_at, delivery_payment_method)
values ('a0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Nadia', 'delivered', 1700, 1700,
        'delivery', 350, 'Paris', '75002', '80000000-0000-0000-0000-000000000001', 'Karim', now(), 'card'),
       ('a0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Nadia', 'delivered', 850, 850,
        'delivery', 350, 'Paris', '75002', '80000000-0000-0000-0000-000000000001', 'Karim', now(), 'cash');
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents)
values ('a0000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Nadia', 'placed', 500, 500);
insert into public.order_items (order_id, name, unit_price_cents, quantity, line_total_cents) values
  ('a0000000-0000-0000-0000-000000000001', 'Menu américain', 950, 1, 950),
  ('a0000000-0000-0000-0000-000000000001', 'Boisson', 200, 1, 200),
  ('a0000000-0000-0000-0000-000000000002', 'Kebab galette', 850, 2, 1700),
  ('a0000000-0000-0000-0000-000000000003', 'Kebab galette', 850, 1, 850);

-- ---------------------------------------------------------------------------------------
-- Entreprise du restaurant et zone du livreur
-- ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set legal_name = 'Samir Food SAS', siret = '73282932000074',
                   vat_number = 'FR32732829320', contact_email = 'contact@chezsamir.fr'
                   where id = '30000000-0000-0000-0000-000000000001' $$,
  'le commerçant renseigne son entreprise');
select throws_ok($$ update public.merchants set siret = '12345678901234'
                    where id = '30000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'SIRET invalide refusé');
select throws_ok($$ update public.merchants set vat_number = 'FR12'
                    where id = '30000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'numéro de TVA invalide refusé');
reset role;
set local role anon;
select is((select legal_name from public.merchants where id = '30000000-0000-0000-0000-000000000001'),
  'Samir Food SAS', 'mentions légales visibles du public');
reset role;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.couriers set work_zone = 'Paris centre', display_name = 'Karim L.'
                   where id = '80000000-0000-0000-0000-000000000001' $$, 'le livreur modifie son profil');
select is((select work_zone from public.couriers where id = '80000000-0000-0000-0000-000000000001'),
  'Paris centre', 'zone enregistrée');
select throws_ok($$ update public.couriers set siret = '73282932000074' $$,
  '42501', null, 'le SIRET du livreur ne se modifie pas');
reset role;

-- ---------------------------------------------------------------------------------------
-- Avis
-- ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000004', 5) $$,
  'P0001', 'order_not_finished', 'pas d''avis avant la fin de la commande');
select throws_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'review_empty', 'un avis sans note est refusé');
select throws_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000001', 5, 4) $$,
  'P0001', 'review_no_courier', 'pas de note livreur pour un retrait');
select lives_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000001', 4, null, '  Très bon  ') $$,
  'avis sur un retrait');
select is((select comment from public.order_reviews where order_id = 'a0000000-0000-0000-0000-000000000001'),
  'Très bon', 'commentaire nettoyé');
select throws_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000001', 5) $$,
  'P0001', 'review_exists', 'un seul avis par commande');
select lives_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000002', 5, 5, 'Rapide') $$,
  'avis sur une livraison');
select lives_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000003', null, 4) $$,
  'note du livreur seule');
select is((select count(*)::int from public.order_reviews), 3, 'le client voit ses avis');
select throws_ok($$ insert into public.order_reviews (order_id, merchant_id, merchant_stars)
                    values ('a0000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 5) $$,
  '42501', null, 'pas d''écriture directe');
reset role;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.submit_order_review('a0000000-0000-0000-0000-000000000002', 1) $$,
  'P0002', 'order_not_found', 'un autre compte ne note pas la commande');
select is((select count(*)::int from public.order_reviews), 0, 'un autre compte ne voit pas les avis');
reset role;

set local role anon;
select results_eq($$ select average, reviews_count from public.merchant_ratings(array['30000000-0000-0000-0000-000000000001'::uuid]) $$,
  $$ values (4.5::numeric, 2) $$, 'note publique du restaurant');
reset role;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select results_eq($$ select average, reviews_count, stars_4, stars_5 from public.courier_rating_summary() $$,
  $$ values (4.50::numeric, 2, 1, 1) $$, 'note du livreur');
select is((select count(*)::int from public.order_reviews), 2, 'le livreur voit les avis de ses livraisons');
select results_eq($$ select runs_count, card_cents, cash_cents from public.courier_earnings_by_day(7) order by day desc limit 1 $$,
  $$ values (2, 350::bigint, 350::bigint) $$, 'gains du jour séparés carte / espèces');
select is((select count(*)::int from public.courier_earnings_by_day(7)), 7, '7 jours, jours vides compris');
reset role;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.order_reviews), 3, 'le restaurant voit ses avis');
select results_eq($$ select orders_count, revenue_cents from public.merchant_sales_by_day('30000000-0000-0000-0000-000000000001', 7) order by day desc limit 1 $$,
  $$ values (3, 3700::bigint) $$, 'ventes du jour (hors commande en attente)');
select results_eq($$ select name, quantity from public.merchant_top_items('30000000-0000-0000-0000-000000000001') limit 1 $$,
  $$ values ('Kebab galette'::text, 3::bigint) $$, 'meilleur produit');
reset role;

set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.merchant_sales_by_day('30000000-0000-0000-0000-000000000001', 7)), 0,
  'un client ne lit pas les ventes du restaurant');

-- ---------------------------------------------------------------------------------------
-- Adresses et favoris
-- ---------------------------------------------------------------------------------------
insert into public.customer_addresses (user_id, label, address_line, postal_code, city, latitude, longitude, is_default)
values ('20000000-0000-0000-0000-000000000001', 'Maison', '5 rue Saint-Augustin', '75002', 'Paris', 48.87, 2.34, true),
       ('20000000-0000-0000-0000-000000000001', 'Bureau', '18 rue de Richelieu', '75001', 'Paris', 48.865, 2.337, false);
select lives_ok($$ select public.set_default_address((select id from public.customer_addresses where label = 'Bureau')) $$,
  'changement d''adresse par défaut');
select is((select label from public.customer_addresses where is_default), 'Bureau', 'une seule adresse par défaut');
insert into public.customer_favorites (user_id, merchant_id)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
reset role;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.customer_addresses) + (select count(*)::int from public.customer_favorites),
  0, 'adresses et favoris privés');
reset role;

select * from finish();
rollback;
