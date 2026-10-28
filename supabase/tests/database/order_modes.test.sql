begin;
select plan(29);

-- Contexte (seed) : « Chez Samir » (snack, formule Pro, livraison activée, retrait par défaut),
-- Karim est livreur rattaché, actif et disponible. On ajoute une dark kitchen sans retrait.
delete from public.orders;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

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
values ('d0000000-0000-0000-0000-000000000001', 'cus_fantome', 'sub_fantome', 'active', 'start');
insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('d0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now());
update public.couriers set is_available = true, last_assigned_at = null;

create function pg_temp.bowl() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_id', 'd2000000-0000-0000-0000-000000000001', 'quantity', 1))
$$;
create function pg_temp.addr() returns jsonb language sql as $$
  select jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                            'latitude', 48.8700, 'longitude', 2.3400, 'phone', '06 98 76 54 32')
$$;

-- -----------------------------------------------------------------------------
-- Catégories
-- -----------------------------------------------------------------------------
select is((select category from public.merchants where id = 'd0000000-0000-0000-0000-000000000001'),
          'dark_kitchen', 'la catégorie dark_kitchen est acceptée');
select throws_ok($$ update public.merchants set category = 'food-truck' where slug = 'chez-samir' $$,
                 '23514', null, 'une catégorie inconnue est refusée');
select is((select count(*)::int from public.merchants where category in ('boulangerie', 'snack', 'sandwicherie', 'restaurant')),
          1, 'les catégories existantes sont conservées (le snack du seed)');

-- -----------------------------------------------------------------------------
-- Modes proposés
-- -----------------------------------------------------------------------------
select ok((select offers_pickup from public.merchants where slug = 'chez-samir'),
          'un snack propose le retrait par défaut');
select ok(not (select offers_pickup from public.merchants where slug = 'cuisine-fantome'),
          'une dark kitchen ne propose pas le retrait par défaut');
select ok((select m.offers_delivery from public.merchants m where m.slug = 'chez-samir'),
          'Chez Samir : livraison proposée (Pro, activée)');
select ok(not (select m.offers_delivery from public.merchants m where m.slug = 'cuisine-fantome'),
          'dark kitchen en formule Start : pas de livraison');
select ok(not (select m.has_order_mode from public.merchants m where m.slug = 'cuisine-fantome'),
          'sans retrait ni livraison, aucun mode de commande');
select ok(not (select m.is_accepting_orders from public.merchants m where m.slug = 'cuisine-fantome'),
          'un établissement sans mode de commande n''accepte pas de commandes');
select throws_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl(), null, pg_temp.addr()) $$,
  'merchant_not_accepting', 'commande refusée tant qu''aucun mode n''est actif');

-- Passage en formule Pro, livraison activée : la dark kitchen devient commandable en livraison seulement.
update public.subscriptions set plan = 'pro' where merchant_id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set delivery_enabled = true where id = 'd0000000-0000-0000-0000-000000000001';
select ok((select m.is_accepting_orders from public.merchants m where m.slug = 'cuisine-fantome'),
          'dark kitchen Pro avec livraison : commandes acceptées');
select throws_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl()) $$,
  'pickup_unavailable', 'retrait refusé par le serveur quand l''établissement ne le propose pas');
select lives_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl(), null, pg_temp.addr()) $$,
  'livraison acceptée par la dark kitchen');

-- Abonnement résilié : le réglage est conservé, mais le serveur refuse toute commande.
update public.subscriptions set status = 'canceled' where merchant_id = 'd0000000-0000-0000-0000-000000000001';
select ok((select delivery_enabled from public.merchants where slug = 'cuisine-fantome'),
          'résiliation : le réglage de livraison est conservé');
select throws_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl(), null, pg_temp.addr()) $$,
  'merchant_not_accepting', 'plus aucune commande possible sans mode actif');

-- Formule Start : la livraison est incluse. L'abonnement est revérifié à chaque commande.
update public.subscriptions set status = 'active', plan = 'start' where merchant_id = 'd0000000-0000-0000-0000-000000000001';
-- La résiliation a dépublié la fiche : le professionnel la republie une fois réabonné.
update public.merchants set is_published = true where id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set delivery_enabled = true, offers_pickup = true where id = 'd0000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl(), null, pg_temp.addr()) $$,
  'formule Start : la livraison est acceptée');
select lives_ok(
  $$ select public.create_order('20000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
                                pg_temp.bowl()) $$,
  'le retrait reste possible quand il est activé');

-- -----------------------------------------------------------------------------
-- Réglages par le propriétaire
-- -----------------------------------------------------------------------------
update public.merchants set delivery_enabled = false where id = 'd0000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select throws_ok($$ update public.merchants set offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001' $$,
                 'order_mode_required', 'impossible de couper le retrait sans livraison active');
select lives_ok($$ update public.merchants set pickup_instructions = 'Sonnez au portail bleu, 2e porte.'
                   where id = 'd0000000-0000-0000-0000-000000000001' $$,
                'le propriétaire renseigne ses consignes de retrait');
select throws_ok($$ update public.merchants set pickup_instructions = repeat('x', 301)
                    where id = 'd0000000-0000-0000-0000-000000000001' $$,
                 '23514', null, 'consignes limitées à 300 caractères');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set offers_pickup = false where slug = 'chez-samir' $$,
                'Chez Samir (Pro, livraison) peut couper le retrait');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.merchants where slug = 'chez-samir' and not offers_pickup), 1,
          'les réglages publics restent lisibles par un autre compte');
reset role;
update public.merchants set offers_pickup = true where slug = 'chez-samir';

set local role anon;
select throws_ok($$ update public.merchants set offers_pickup = false where slug = 'chez-samir' $$,
                 '42501', null, 'un visiteur ne modifie pas les modes de commande');
reset role;

-- -----------------------------------------------------------------------------
-- Annuaire public : adresse masquée pour un établissement qui n'accueille pas le public
-- -----------------------------------------------------------------------------
update public.subscriptions set plan = 'pro' where merchant_id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set delivery_enabled = true where id = 'd0000000-0000-0000-0000-000000000001';
update public.merchants set offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001';

select is((select address_line from public.nearby_merchants(48.8600, 2.3600) where slug = 'cuisine-fantome'),
          null, 'annuaire : adresse précise d''une dark kitchen non exposée');
select is((select address_line from public.nearby_merchants(48.8600, 2.3600) where slug = 'chez-samir'),
          '12 rue de la Paix', 'annuaire : adresse d''un établissement qui accueille exposée');
select ok((select distance_m % 500 = 0 from public.nearby_merchants(48.8600, 2.3600) where slug = 'cuisine-fantome'),
          'annuaire : distance d''une dark kitchen arrondie à 500 m');
select is((select offers_delivery from public.nearby_merchants(48.8600, 2.3600) where slug = 'cuisine-fantome'),
          true, 'annuaire : modes de commande exposés');
select is((select count(*)::int from public.search_merchants('fantome')), 1, 'recherche par nom d''une dark kitchen');
select is((select count(*)::int from public.search_merchants('75003')), 0,
          'recherche par code postal : une dark kitchen sans accueil n''est pas localisable');

select * from finish();
rollback;
