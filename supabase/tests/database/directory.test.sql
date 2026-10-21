begin;
select plan(18);

-- Contexte (seed) : « Chez Samir » (snack Paris 2e, retrait + livraison Pro, Karim en ligne).
-- On ajoute une dark kitchen (livraison seule) et une boulangerie avec un petit déjeuner.
delete from public.orders;
update public.couriers set is_available = true, last_assigned_at = null;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'dark@test.fr'),
  ('b0000000-0000-0000-0000-000000000001', 'boulanger@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cuisine-fantome', 'Cuisine Fantôme',
   'dark_kitchen', '8 rue Cachée', '75003', 'Paris', 48.8600, 2.3600, true),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'la-mie-doree', 'La Mie Dorée',
   'boulangerie', '3 rue du Four', '75005', 'Paris', 48.8450, 2.3500, true);
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('d0000000-0000-0000-0000-000000000001', 'cus_f', 'sub_f', 'active', 'pro'),
       ('b1000000-0000-0000-0000-000000000001', 'cus_b', 'sub_b', 'active', 'start');
update public.merchants set delivery_enabled = true where id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001';
insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('d0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now());
insert into public.menu_categories (id, merchant_id, name) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Matin');
insert into public.menu_items (id, merchant_id, category_id, name, price_cents, meal_periods) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'Petit déjeuner', 450, '{breakfast}'),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'Formule déjeuner', 990, '{lunch}');


-- Colonnes de l'annuaire
select ok((select delivery_available_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'),
          'Chez Samir : livraison disponible maintenant');
select ok((select delivery_available_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'cuisine-fantome'),
          'la dark kitchen aussi (Karim y est rattaché)');
select ok(not (select delivery_available_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'),
          'boulangerie en formule Start : pas de livraison');
select is((select offers_pickup from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'), true,
          'la boulangerie propose le retrait');

-- Livreur hors ligne : la livraison disparaît de l'annuaire.
update public.couriers set available_until = now() - interval '1 minute';
select ok(not (select delivery_available_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'),
          'livreur hors ligne : livraison non disponible');
select ok((select offers_delivery from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'),
          'mais toujours proposée par le restaurant');
update public.couriers set available_until = now() + interval '1 day';

-- Carte : position précise seulement pour un établissement qui accueille le public
select is((select latitude from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'), 48.8450::float8,
          'carte : la boulangerie est placée');
select is((select latitude from public.nearby_merchants(48.8600, 2.3500) where slug = 'cuisine-fantome'), null,
          'carte : la dark kitchen n''a pas de position précise');
select is((select longitude from public.nearby_merchants(48.8600, 2.3500) where slug = 'cuisine-fantome'), null,
          'ni de longitude');
select is((select latitude from public.search_merchants('fantome')), null, 'idem dans la recherche par nom');
select is((select latitude from public.search_merchants('mie dorée')), 48.8450::float8, 'recherche : la boulangerie a sa position');

-- Moments de repas
select is((select meal_periods from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'),
          array['breakfast', 'lunch']::text[], 'moments de repas servis par la boulangerie');
select is((select meal_periods from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'), '{}'::text[],
          'aucun moment défini : liste vide');
update public.menu_items set is_available = false where id = 'b3000000-0000-0000-0000-000000000002';
select is((select meal_periods from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'),
          array['breakfast']::text[], 'un produit en rupture ne compte plus');

-- Happy Hour
select ok(not (select has_happy_hour_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'),
          'pas de Happy Hour : filtre inactif');
insert into public.happy_hours (id, merchant_id, name, discount_type, percent_off)
values ('f0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Midi', 'percent', 20);
insert into public.happy_hour_slots (happy_hour_id, merchant_id, weekday, starts_at, ends_at)
select 'f0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', d,
       ((now() at time zone 'Europe/Paris')::time - interval '1 hour')::time,
       ((now() at time zone 'Europe/Paris')::time + interval '1 hour')::time from generate_series(1, 7) d;
insert into public.happy_hour_items (happy_hour_id, merchant_id, item_id)
values ('f0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003');
select ok((select has_happy_hour_now from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'),
          'Happy Hour en vigueur : badge et filtre');

-- Seuls les établissements publiés
update public.merchants set is_published = false where id = 'b1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.nearby_merchants(48.8600, 2.3500) where slug = 'la-mie-doree'), 0,
          'un établissement non publié n''apparaît pas');
set local role anon;
select is((select count(*)::int from public.nearby_merchants(48.8600, 2.3500) where slug = 'chez-samir'), 1,
          'un visiteur peut consulter l''annuaire');
reset role;

select * from finish();
rollback;
