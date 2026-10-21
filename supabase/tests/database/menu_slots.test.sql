begin;
select plan(60);

-- Contexte (seed) : « Chez Samir » (Europe/Paris), propriétaire Samir, cliente Nadia.
delete from public.orders;
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Instant en heure de Paris (lundi 2 novembre 2026 = ISO 1, heure d'hiver).
create function pg_temp.paris(p_local text) returns timestamptz language sql as $$
  select p_local::timestamp at time zone 'Europe/Paris'
$$;
create function pg_temp.kebab(p_with_sauce boolean default true) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
    'option_ids', case when p_with_sauce then
      (select jsonb_agg(o.id) from public.menu_options o
       where o.group_id = '60000000-0000-0000-0000-000000000003' and o.name = 'Blanche') else '[]'::jsonb end))
$$;

-- -----------------------------------------------------------------------------
-- Fenêtre hebdomadaire (horaires, créneaux de menu, promotions)
-- -----------------------------------------------------------------------------
select ok(public.time_in_window(1::smallint, '11:00', '15:00', 1::smallint, '12:00'), 'dans la plage');
select ok(public.time_in_window(1::smallint, '11:00', '15:00', 1::smallint, '11:00'), 'le début est inclus');
select ok(not public.time_in_window(1::smallint, '11:00', '15:00', 1::smallint, '15:00'), 'la fin est exclue');
select ok(not public.time_in_window(1::smallint, '11:00', '15:00', 2::smallint, '12:00'), 'un autre jour ne compte pas');
select ok(public.time_in_window(5::smallint, '22:00', '03:00', 5::smallint, '23:00'), 'passe minuit : le soir');
select ok(public.time_in_window(5::smallint, '22:00', '03:00', 6::smallint, '02:00'), 'passe minuit : le lendemain matin');
select ok(not public.time_in_window(5::smallint, '22:00', '03:00', 6::smallint, '03:00'), 'passe minuit : fin exclue');
select ok(not public.time_in_window(5::smallint, '22:00', '03:00', 5::smallint, '02:00'), 'passe minuit : pas la veille au matin');
select ok(public.time_in_window(7::smallint, '22:00', '03:00', 1::smallint, '01:00'), 'dimanche soir jusqu''à lundi matin');

-- -----------------------------------------------------------------------------
-- Boulangerie : petit déjeuner le matin, formule déjeuner à midi, baguette toute la journée
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000001', 'boulanger@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published, payment_link)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'la-mie-doree', 'La Mie Dorée',
        'boulangerie', '3 rue du Four', '75005', 'Paris', 48.8450, 2.3500, true, 'https://pay.sumup.com/b2c/mie');
insert into public.menu_categories (id, merchant_id, name) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Formules');
insert into public.menu_items (id, merchant_id, category_id, name, price_cents, is_formula, meal_periods) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'Petit déjeuner', 450, true, '{breakfast}'),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'Formule déjeuner', 990, true, '{lunch}'),
  ('b3000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
   'Baguette tradition', 130, false, '{}');
insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
select 'b1000000-0000-0000-0000-000000000001'::uuid, v.item::uuid, d, v.s::time, v.e::time
from generate_series(1, 6) d,
     (values ('b3000000-0000-0000-0000-000000000001', '06:00', '11:00'),
             ('b3000000-0000-0000-0000-000000000002', '11:00', '15:00')) v(item, s, e);
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select 'b1000000-0000-0000-0000-000000000001', d, '06:00', '19:00' from generate_series(1, 6) d;

select ok(public.is_in_slot('b3000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-02 08:00')),
          'boulangerie 8 h : le petit déjeuner est servi');
select ok(not public.is_in_slot('b3000000-0000-0000-0000-000000000002', pg_temp.paris('2026-11-02 08:00')),
          'boulangerie 8 h : pas encore la formule déjeuner');
select ok(public.is_in_slot('b3000000-0000-0000-0000-000000000003', pg_temp.paris('2026-11-02 08:00')),
          'boulangerie 8 h : la baguette (sans créneau) est servie');
select ok(not public.is_in_slot('b3000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-02 12:00')),
          'boulangerie 12 h : plus de petit déjeuner');
select ok(public.is_in_slot('b3000000-0000-0000-0000-000000000002', pg_temp.paris('2026-11-02 12:00')),
          'boulangerie 12 h : la formule déjeuner est servie');
select ok(public.is_in_slot('b3000000-0000-0000-0000-000000000003', pg_temp.paris('2026-11-02 12:00')),
          'boulangerie 12 h : la baguette aussi');
select ok(not public.is_in_slot('b3000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-08 08:00')),
          'dimanche : pas de créneau défini, pas de petit déjeuner');
select ok(not public.is_in_slot('b3000000-0000-0000-0000-000000000002', pg_temp.paris('2026-11-02 15:00')),
          'la formule s''arrête à 15 h pile');
select ok(public.is_merchant_open('b1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-02 08:00')),
          'boulangerie ouverte le matin');
select ok(not public.is_merchant_open('b1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-02 20:00')),
          'boulangerie fermée le soir');
-- L'instant UTC compte autant que le fuseau de l'établissement (7 h UTC = 8 h à Paris en hiver).
select ok(public.is_in_slot('b3000000-0000-0000-0000-000000000001', '2026-11-02 07:00+00'),
          'le fuseau Europe/Paris est appliqué');
select ok(not public.is_in_slot('b3000000-0000-0000-0000-000000000001', '2026-11-02 12:00+00'),
          '12 h UTC = 13 h à Paris : hors créneau');
select ok((select m.is_in_slot_now from public.menu_items m where m.id = 'b3000000-0000-0000-0000-000000000003'),
          'colonne calculée is_in_slot_now (produit sans créneau)');
select ok((select is_formula from public.menu_items where id = 'b3000000-0000-0000-0000-000000000001'),
          'le petit déjeuner est une formule');
select throws_ok($$ update public.menu_items set meal_periods = '{brunch}' where id = 'b3000000-0000-0000-0000-000000000003' $$,
                 '23514', null, 'moment de repas inconnu refusé');

-- -----------------------------------------------------------------------------
-- Dark kitchen ouverte de 22 h à 3 h (le vendredi soir, jusqu'au samedi matin)
-- -----------------------------------------------------------------------------
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000001', 'nuit@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published, payment_link)
values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'cuisine-de-nuit', 'Cuisine de Nuit',
        'dark_kitchen', '9 rue Noire', '75011', 'Paris', 48.8600, 2.3800, true, 'https://pay.sumup.com/b2c/nuit');
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
values ('c1000000-0000-0000-0000-000000000001', 5, '22:00', '03:00');
insert into public.menu_categories (id, merchant_id, name) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Nuit');
insert into public.menu_items (id, merchant_id, category_id, name, price_cents, meal_periods) values
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
   'Bowl de nuit', 1200, '{night}');
insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
values ('c1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 5, '22:00', '03:00');

-- Vendredi 6 novembre 2026 (ISO 5).
select ok(public.is_merchant_open('c1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-06 23:30')),
          'dark kitchen ouverte le vendredi à 23 h 30');
select ok(public.is_merchant_open('c1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-07 02:00')),
          'toujours ouverte le samedi à 2 h (fin de la plage de vendredi)');
select ok(not public.is_merchant_open('c1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-07 03:00')),
          'fermée à 3 h pile');
select ok(not public.is_merchant_open('c1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-06 21:59')),
          'fermée avant 22 h');
select ok(not public.is_merchant_open('c1000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-06 02:00')),
          'fermée le vendredi à 2 h : la plage du jeudi n''existe pas');
select ok(public.is_in_slot('c3000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-07 01:00')),
          'le menu de nuit est servi après minuit');
select ok(not public.is_in_slot('c3000000-0000-0000-0000-000000000001', pg_temp.paris('2026-11-06 15:00')),
          'le menu de nuit n''est pas servi l''après-midi');

-- -----------------------------------------------------------------------------
-- Commande : le serveur refuse un produit hors créneau
-- -----------------------------------------------------------------------------
insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
select '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', d,
       ((now() at time zone 'Europe/Paris')::time + interval '2 hours')::time,
       ((now() at time zone 'Europe/Paris')::time + interval '3 hours')::time
from generate_series(1, 7) d;
select ok(not (select m.is_in_slot_now from public.menu_items m where m.id = '50000000-0000-0000-0000-000000000003'),
          'le kebab n''est servi que dans 2 h');
select throws_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.kebab()) $$,
                 'item_out_of_slot', 'commande refusée hors créneau');
delete from public.menu_item_slots where item_id = '50000000-0000-0000-0000-000000000003';
insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
select '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', d,
       ((now() at time zone 'Europe/Paris')::time - interval '1 hour')::time,
       ((now() at time zone 'Europe/Paris')::time + interval '1 hour')::time
from generate_series(1, 7) d;
select lives_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.kebab()) $$,
                'commande acceptée dans le créneau');
delete from public.menu_item_slots where item_id = '50000000-0000-0000-0000-000000000003';
select lives_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.kebab()) $$,
                'sans créneau, le produit est commandable pendant l''ouverture');

-- Formule : ses composants obligatoires sont exigés par le serveur.
update public.menu_items set is_formula = true where id = '50000000-0000-0000-0000-000000000003';
select throws_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.kebab(false)) $$,
                 'invalid_options', 'formule sans composant obligatoire refusée');
select is((select subtotal_cents from public.create_order('20000000-0000-0000-0000-000000000001',
            '30000000-0000-0000-0000-000000000001', pg_temp.kebab())), 750, 'formule avec composant : prix de la carte');

-- -----------------------------------------------------------------------------
-- Droits sur les créneaux
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
                   values ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 1, '11:00', '15:00') $$,
                'le propriétaire définit un créneau');
select throws_ok($$ insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
                    values ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 1, '11:00', '15:00') $$,
                 '42501', null, 'mais pas sur le menu d''un autre commerce');
select throws_ok($$ insert into public.menu_item_slots (merchant_id, item_id, weekday, starts_at, ends_at)
                    values ('30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 1, '11:00', '11:00') $$,
                 '23514', null, 'un créneau doit avoir une durée');
select is((select count(*)::int from public.set_item_slots('50000000-0000-0000-0000-000000000003',
            '[{"weekday": 1, "starts_at": "11:00", "ends_at": "15:00"}, {"weekday": 2, "starts_at": "11:00", "ends_at": "15:00"}]')),
          2, 'set_item_slots remplace les créneaux d''un produit');
select is((select count(*)::int from public.menu_item_slots where item_id = '50000000-0000-0000-0000-000000000003'), 2,
          'et seulement ceux-là');
select is((select count(*)::int from public.set_item_slots('50000000-0000-0000-0000-000000000003', '[]')), 0,
          'une liste vide = servi toute l''ouverture');
select throws_ok($$ select public.set_item_slots('b3000000-0000-0000-0000-000000000003', '[]') $$,
                 'item_not_found', 'impossible de modifier le menu d''un autre commerce');
reset role;
set local role anon;
select throws_ok($$ select public.set_item_slots('50000000-0000-0000-0000-000000000003', '[]') $$,
                 '42501', null, 'réservé aux comptes connectés');
select is((select count(*)::int from public.menu_item_slots where item_id = 'b3000000-0000-0000-0000-000000000001'), 6,
          'les créneaux d''un commerce publié sont publics');
reset role;
update public.merchants set is_published = false where id = 'b1000000-0000-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.menu_item_slots where item_id = 'b3000000-0000-0000-0000-000000000001'), 0,
          'ceux d''un commerce non publié ne le sont pas');
reset role;

-- -----------------------------------------------------------------------------
-- Fermetures exceptionnelles
-- -----------------------------------------------------------------------------
select ok(public.is_merchant_open('30000000-0000-0000-0000-000000000001'), 'Chez Samir est ouvert');
insert into public.merchant_closures (merchant_id, starts_at, ends_at, reason)
values ('30000000-0000-0000-0000-000000000001', now() - interval '1 hour', now() + interval '1 hour', 'Congés');
select ok(not public.is_merchant_open('30000000-0000-0000-0000-000000000001'), 'fermeture exceptionnelle : fermé');
select throws_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', pg_temp.kebab()) $$,
                 'merchant_not_accepting', 'aucune commande pendant une fermeture exceptionnelle');
select ok(public.is_merchant_open('30000000-0000-0000-0000-000000000001', now() + interval '2 hours'),
          'rouvert après la fin de la fermeture');
select ok(public.is_merchant_open('30000000-0000-0000-0000-000000000001', now() - interval '2 hours'),
          'et ouvert avant son début');
set local role authenticated;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.merchant_closures (merchant_id, starts_at, ends_at)
                    values ('30000000-0000-0000-0000-000000000001', now(), now() + interval '1 day') $$,
                 '42501', null, 'un autre commerçant ne peut pas fermer Chez Samir');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into public.merchant_closures (merchant_id, starts_at, ends_at)
                    values ('30000000-0000-0000-0000-000000000001', now(), now() - interval '1 day') $$,
                 '23514', null, 'la fin doit suivre le début');
select is((select starts_at from public.add_closure('30000000-0000-0000-0000-000000000001', '2026-12-24', '2026-12-26', 'Noël')),
          '2026-12-24 00:00:00+01'::timestamptz, 'fermeture sur jours entiers : début à minuit, heure de Paris');
select is((select ends_at from public.merchant_closures where reason = 'Noël'),
          '2026-12-27 00:00:00+01'::timestamptz, 'et fin le lendemain du dernier jour');
select ok(not public.is_merchant_open('30000000-0000-0000-0000-000000000001', '2026-12-26 23:30:00+01'),
          'fermé le dernier jour jusqu''à minuit');
select ok(public.is_merchant_open('30000000-0000-0000-0000-000000000001', '2026-12-27 00:30:00+01'),
          'rouvert le lendemain');
select throws_ok($$ select public.add_closure('30000000-0000-0000-0000-000000000001', '2026-12-26', '2026-12-24') $$,
                 'invalid_closure', 'la fin doit suivre le début');
select throws_ok($$ select public.add_closure('b1000000-0000-0000-0000-000000000001', '2026-12-24', '2026-12-26') $$,
                 'merchant_not_found', 'impossible de fermer le commerce d''un autre');
reset role;

select * from finish();
rollback;
