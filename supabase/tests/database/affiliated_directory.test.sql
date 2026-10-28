begin;
select plan(7);

-- Annuaire des clients connectés : seuls les établissements affiliés (abonnement actif ou en essai,
-- paiement configuré). Le public non connecté voit tous les commerces publiés.
insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'affilie@test.fr'),
  ('f1000000-0000-0000-0000-000000000002', 'nonaffilie@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published, payment_link)
values
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'affilie-test', 'Affilié Test',
   'restaurant', '1 rue Affiliée', '75002', 'Paris', 48.8650, 2.3450, true, 'https://pay.exemple.test/a'),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', 'non-affilie-test', 'Non Affilié Test',
   'restaurant', '2 rue Non Affiliée', '75002', 'Paris', 48.8651, 2.3451, true, 'https://pay.exemple.test/n');
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('f2000000-0000-0000-0000-000000000001', 'cus_aff', 'sub_aff', 'trialing', 'start');

-- Public (sans filtre) : les deux établissements publiés sont visibles.
select ok(exists (select 1 from public.nearby_merchants(48.8650, 2.3450) where slug = 'non-affilie-test'),
          'public : un établissement non affilié reste visible');
select ok(exists (select 1 from public.search_merchants('Non Affilié')),
          'recherche publique : un établissement non affilié est trouvé');

-- Client connecté (filtre affiliés)
select ok(exists (select 1 from public.nearby_merchants(48.8650, 2.3450, 10000, 50, true) where slug = 'affilie-test'),
          'connecté : l’établissement affilié (essai) est listé');
select ok(not exists (select 1 from public.nearby_merchants(48.8650, 2.3450, 10000, 50, true) where slug = 'non-affilie-test'),
          'connecté : l’établissement non affilié n’est pas listé');
select ok(not exists (select 1 from public.search_merchants('Non Affilié', 50, true)),
          'recherche connectée : un établissement non affilié n’est pas trouvé');

-- Un abonnement résilié ne rend pas affilié
update public.subscriptions set status = 'canceled' where merchant_id = 'f2000000-0000-0000-0000-000000000001';
select ok(not exists (select 1 from public.nearby_merchants(48.8650, 2.3450, 10000, 50, true) where slug = 'affilie-test'),
          'abonnement résilié : l’établissement ne reste pas listé aux clients connectés');

-- Sans paiement configuré, pas d’affiliation même avec abonnement actif
update public.subscriptions set status = 'active' where merchant_id = 'f2000000-0000-0000-0000-000000000001';
update public.merchants set payment_link = null, accepts_cash_pickup = false where id = 'f2000000-0000-0000-0000-000000000001';
select ok(not exists (select 1 from public.nearby_merchants(48.8650, 2.3450, 10000, 50, true) where slug = 'affilie-test'),
          'abonnement actif mais paiement non configuré : pas affilié');

select * from finish();
rollback;
