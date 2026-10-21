begin;
select plan(54);

-- Contexte (seed) : « Chez Samir » (Europe/Paris, formule Pro, livraison activée), Nadia cliente avec
-- un menu offert disponible. Produits : Kebab 7,50 € (sauce obligatoire), Menu Tacos 10,50 €
-- (sauce obligatoire, supplément Cheddar +1 €, menu fidélité), Menu Américain 9,50 €, Canette 1,50 €.
delete from public.orders;
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;
update public.couriers set is_available = true, last_assigned_at = null;

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.paris(p_local text) returns timestamptz language sql as $$
  select p_local::timestamp at time zone 'Europe/Paris'
$$;
-- Plage d'une heure autour de maintenant (en heure de Paris), tous les jours : l'offre est en vigueur.
create function pg_temp.slots_now() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('weekday', d,
           'starts_at', ((now() at time zone 'Europe/Paris')::time - interval '1 hour')::time,
           'ends_at', ((now() at time zone 'Europe/Paris')::time + interval '1 hour')::time))
  from generate_series(1, 7) d
$$;
-- Plage qui ne contient pas maintenant (dans 3 à 4 heures).
create function pg_temp.slots_later() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('weekday', d,
           'starts_at', ((now() at time zone 'Europe/Paris')::time + interval '3 hours')::time,
           'ends_at', ((now() at time zone 'Europe/Paris')::time + interval '4 hours')::time))
  from generate_series(1, 7) d
$$;
create function pg_temp.items(variadic p_ids uuid[]) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('item_id', i)) from unnest(p_ids) i
$$;
create function pg_temp.offer(p_name text, p_percent int, p_items jsonb, p_extra jsonb default '{}')
returns uuid language sql as $$
  select id from public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
    jsonb_build_object('name', p_name, 'discount_type', 'percent', 'percent_off', p_percent,
                       'slots', pg_temp.slots_now(), 'items', p_items) || p_extra)
$$;
create function pg_temp.line(p_item uuid, p_qty int, p_opts text[] default '{}', p_expected int default null, p_reward boolean default false)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'item_id', p_item, 'quantity', p_qty,
    'option_ids', (select coalesce(jsonb_agg(o.id), '[]'::jsonb) from public.menu_options o
                   join public.menu_option_groups g on g.id = o.group_id
                   where g.item_id = p_item and o.name = any (p_opts)),
    'expected_total_cents', p_expected,
    'use_reward', case when p_reward then true end))
$$;
create function pg_temp.order_of(p_lines jsonb, p_delivery jsonb default null) returns public.orders language sql as $$
  select * from public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                    p_lines, null, p_delivery)
$$;

create temporary table ids (key text primary key, id uuid);
grant all on ids to authenticated;

-- Un autre commerce, pour les droits.
insert into auth.users (id, email) values ('e0000000-0000-0000-0000-000000000001', 'autre@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'autre-snack', 'Autre Snack',
        'snack', '2 rue X', '75003', 'Paris', 48.86, 2.36, true);
insert into public.menu_categories (id, merchant_id, name) values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Tout');
insert into public.menu_items (id, merchant_id, category_id, name, price_cents)
values ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'Burger', 900);

-- -----------------------------------------------------------------------------
-- Création et droits
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'p20', pg_temp.offer('Happy kebab', 20, pg_temp.items('50000000-0000-0000-0000-000000000003'));
select is((select percent_off::int from public.happy_hours where id = (select id from ids where key = 'p20')), 20,
          'le propriétaire crée une offre en pourcentage');
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
    jsonb_build_object('name', 'Mauvais prix', 'discount_type', 'price', 'slots', pg_temp.slots_now(),
                       'items', jsonb_build_array(jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000004', 'promo_price_cents', 150)))) $$,
  'invalid_happy_hour', 'un prix promotionnel doit être une vraie réduction');
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
    jsonb_build_object('name', 'Intrus', 'discount_type', 'percent', 'percent_off', 10, 'slots', pg_temp.slots_now(),
                       'items', pg_temp.items('e3000000-0000-0000-0000-000000000001'))) $$,
  'invalid_happy_hour', 'impossible de viser le produit d''un autre commerce');
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
    jsonb_build_object('name', 'Sans taux', 'discount_type', 'percent', 'slots', pg_temp.slots_now(),
                       'items', pg_temp.items('50000000-0000-0000-0000-000000000003'))) $$,
  '23514', null, 'une offre en pourcentage exige un taux');
select throws_ok($$ insert into public.happy_hours (merchant_id, name, discount_type, percent_off)
                    values ('30000000-0000-0000-0000-000000000001', 'Direct', 'percent', 10) $$,
  '42501', null, 'aucune écriture directe : tout passe par les fonctions');
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
    jsonb_build_object('name', 'Vol', 'discount_type', 'percent', 'percent_off', 50, 'slots', pg_temp.slots_now(),
                       'items', pg_temp.items('50000000-0000-0000-0000-000000000003'))) $$,
  'merchant_not_found', 'un autre commerçant ne peut pas créer d''offre chez Samir');
select throws_ok($$ select public.delete_happy_hour((select id from ids where key = 'p20')) $$,
  'happy_hour_not_found', 'ni supprimer la sienne');
select throws_ok($$ select public.set_happy_hour_active((select id from ids where key = 'p20'), false) $$,
  'happy_hour_not_found', 'ni la désactiver');
reset role;
set local role anon;
select throws_ok($$ select public.save_happy_hour('30000000-0000-0000-0000-000000000001', null, '{}') $$,
  '42501', null, 'réservé aux comptes connectés');
reset role;

-- -----------------------------------------------------------------------------
-- Offres en vigueur
-- -----------------------------------------------------------------------------
select is((select promo_cents || '/' || regular_cents from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'),
          '600/750', '20 % sur le kebab : 7,50 € → 6,00 €');
select ok((select abs(extract(epoch from (ends_at - (now() + interval '1 hour')))) < 1
           from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'),
          'l''heure de fin de l''offre est connue (dans une heure)');
select ok((select m.has_happy_hour_now from public.merchants m where m.slug = 'chez-samir'),
          'colonne calculée has_happy_hour_now (filtre de l''annuaire)');
select ok(not (select m.has_happy_hour_now from public.merchants m where m.slug = 'autre-snack'),
          'un commerce sans offre n''en a pas');
set local role anon;
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')), 1,
          'un visiteur voit les offres en vigueur d''un commerce publié');
reset role;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
-- Arrondi : 15 % sur 9,50 € = 8,075 → 8,08 € (demi vers le haut).
insert into ids select 'p15', pg_temp.offer('Américain -15', 15, pg_temp.items('50000000-0000-0000-0000-000000000002'));
-- Prix fixe : canette à 1,00 €.
insert into ids select 'pcan', (select id from public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
  jsonb_build_object('name', 'Canette 1 €', 'discount_type', 'price', 'slots', pg_temp.slots_now(),
    'items', jsonb_build_array(jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000004', 'promo_price_cents', 100)))));
reset role;
select is((select promo_cents from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000002'), 808, 'arrondi au centime supérieur à la moitié');
select is((select promo_cents from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000004'), 100, 'offre à prix fixe');

-- Mode : retrait seul / livraison seule.
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'ppick', pg_temp.offer('Retrait -50', 50, pg_temp.items('50000000-0000-0000-0000-000000000001'),
                                              '{"applies_to_delivery": false}');
reset role;
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000001'), 1, 'offre « retrait » en vigueur au retrait');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'delivery')
           where item_id = '50000000-0000-0000-0000-000000000001'), 0, 'mais pas en livraison');

-- Validité et activation.
update public.happy_hours set ends_on = (now() at time zone 'Europe/Paris')::date - 1 where id = (select id from ids where key = 'ppick');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000001'), 0, 'période de validité terminée : plus d''offre');
update public.happy_hours set ends_on = null, starts_on = (now() at time zone 'Europe/Paris')::date + 1 where id = (select id from ids where key = 'ppick');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000001'), 0, 'période pas encore commencée');
update public.happy_hours set starts_on = null, is_active = false where id = (select id from ids where key = 'ppick');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000001'), 0, 'offre désactivée');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select ok((select is_active from public.set_happy_hour_active((select id from ids where key = 'ppick'), true)),
          'le propriétaire la réactive');
reset role;
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000001'), 1, 'de nouveau en vigueur');
update public.happy_hours set is_active = false where id = (select id from ids where key = 'ppick');

-- Plage qui passe minuit : vendredi 22 h → samedi 3 h (6 et 7 novembre 2026, heure d'hiver).
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'pnuit', (select id from public.save_happy_hour('30000000-0000-0000-0000-000000000001', null,
  jsonb_build_object('name', 'Nuit', 'discount_type', 'percent', 'percent_off', 25,
    'slots', '[{"weekday": 5, "starts_at": "22:00", "ends_at": "03:00"}]'::jsonb,
    'items', pg_temp.items('50000000-0000-0000-0000-000000000001'))));
reset role;
update public.happy_hours set is_active = false where id <> (select id from ids where key = 'pnuit');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-07 01:00'))), 1,
          'passe minuit : encore en vigueur le samedi à 1 h');
select is((select ends_at from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-06 23:30'))),
          pg_temp.paris('2026-11-07 03:00'), 'et elle finit le samedi à 3 h');
select is((select ends_at from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-07 01:00'))),
          pg_temp.paris('2026-11-07 03:00'), 'même heure de fin passé minuit');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-07 03:00'))), 0,
          'terminée à 3 h pile');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-06 21:59'))), 0,
          'pas avant 22 h');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup', pg_temp.paris('2026-11-06 02:00'))), 0,
          'pas le vendredi à 2 h (la plage commence le vendredi soir)');
update public.happy_hours set is_active = false where id = (select id from ids where key = 'pnuit');
update public.happy_hours set is_active = true where id in (select id from ids where key in ('p20', 'p15', 'pcan'));

-- Chevauchement : une seule offre par produit, jamais cumulée ; le prix le plus bas gagne.
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'p30', pg_temp.offer('Kebab -30', 30, pg_temp.items('50000000-0000-0000-0000-000000000003'));
reset role;
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'), 1, 'deux offres sur le kebab : une seule retenue');
select is((select name from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'), 'Kebab -30', 'la plus avantageuse (525 € < 600 €) gagne');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'p30b', pg_temp.offer('Kebab -30 bis', 30, pg_temp.items('50000000-0000-0000-0000-000000000003'));
reset role;
update public.happy_hours set created_at = now() - interval '1 day' where id = (select id from ids where key = 'p30b');
select is((select name from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'), 'Kebab -30 bis',
          'à prix égal, l''offre la plus ancienne gagne (règle déterministe)');
update public.happy_hours set is_active = false where id in (select id from ids where key in ('p30', 'p30b'));

-- -----------------------------------------------------------------------------
-- Commande : prix appliqué, conservé et revérifié
-- -----------------------------------------------------------------------------
insert into ids select 'o1', (pg_temp.order_of(jsonb_build_array(
  pg_temp.line('50000000-0000-0000-0000-000000000003', 2, '{Blanche}', 1200)))).id;
select is((select subtotal_cents from public.orders where id = (select id from ids where key = 'o1')), 1200,
          'kebab ×2 à 6,00 € : sous-total 12,00 €');
select is((select unit_price_cents || '/' || regular_unit_cents || '/' || happy_hour_name from public.order_items
           where order_id = (select id from ids where key = 'o1')),
          '600/750/Happy kebab', 'prix appliqué, tarif habituel et nom de l''offre conservés dans la commande');
select throws_ok($$ select pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 2, '{Blanche}', 1500))) $$,
  'price_changed', 'prix annoncé différent du prix réel : commande refusée');
select lives_ok($$ select pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 1, '{Blanche}'))) $$,
  'sans prix annoncé, le prix du serveur s''applique');

-- Les suppléments restent au plein tarif : Tacos 10,50 € -20 % = 8,40 € + Cheddar 1,00 €.
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'ptacos', pg_temp.offer('Tacos -20', 20, pg_temp.items('50000000-0000-0000-0000-000000000001'));
reset role;
insert into ids select 'o2', (pg_temp.order_of(jsonb_build_array(
  pg_temp.line('50000000-0000-0000-0000-000000000001', 1, '{Blanche,Cheddar}', 940)))).id;
select is((select unit_price_cents || '/' || regular_unit_cents from public.order_items where order_id = (select id from ids where key = 'o2')),
          '940/1150', 'la réduction ne porte pas sur les suppléments');

-- Menu offert (fidélité) : au plein tarif, les autres unités profitent de l'offre.
insert into ids select 'o3', (pg_temp.order_of(jsonb_build_array(
  pg_temp.line('50000000-0000-0000-0000-000000000001', 2, '{Blanche}', 1890, true)))).id;
select is((select subtotal_cents || '/' || discount_cents || '/' || total_cents from public.orders where id = (select id from ids where key = 'o3')),
          '1890/1050/840', 'menu offert au plein tarif (10,50 €), l''autre menu à 8,40 € : reste à payer 8,40 €');
select is((select count(*)::int from public.order_items where order_id = (select id from ids where key = 'o3') and is_loyalty_reward and happy_hour_id is null),
          1, 'la ligne du menu offert n''est pas rattachée à l''offre');

-- Offre terminée pendant la préparation du panier.
update public.happy_hours set is_active = false where id = (select id from ids where key = 'ptacos');
select throws_ok($$ select pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000001', 1, '{Blanche}', 840))) $$,
  'price_changed', 'offre terminée entre-temps : le client est prévenu, pas facturé au tarif habituel à son insu');
insert into ids select 'o4', (pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000001', 1, '{Blanche}', 1050)))).id;
select is((select unit_price_cents from public.order_items where order_id = (select id from ids where key = 'o4')),
          1050, 'avec le prix habituel annoncé, la commande passe');

-- Livraison : une offre « retrait seul » ne s'applique pas.
update public.happy_hours set is_active = true, applies_to_delivery = false where id = (select id from ids where key = 'ptacos');
insert into ids select 'od', (pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000001', 1, '{Blanche}', 1050)),
  jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                     'latitude', 48.8700, 'longitude', 2.3400, 'phone', '06 98 76 54 32'))).id;
select is((select unit_price_cents from public.order_items where order_id = (select id from ids where key = 'od')), 1050,
          'livraison : l''offre réservée au retrait n''est pas appliquée');
update public.happy_hours set is_active = false where id = (select id from ids where key = 'ptacos');

-- -----------------------------------------------------------------------------
-- Quota
-- -----------------------------------------------------------------------------
update public.happy_hours set is_active = false;
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'pq', pg_temp.offer('Stock limité', 20, pg_temp.items('50000000-0000-0000-0000-000000000003'), '{"quantity_limit": 3}');
reset role;
insert into ids select 'q1', (pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 2, '{Blanche}', 1200)))).id;
select is((select quantity_used from public.happy_hours where id = (select id from ids where key = 'pq')), 2, 'le quota consommé suit les unités vendues');
select is((select quantity_remaining from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'), 1, 'il en reste une');
select throws_ok($$ select pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 2, '{Blanche}', 1200))) $$,
  'price_changed', 'il ne reste qu''une unité : annoncer deux unités en promotion est refusé');
insert into ids select 'q2', (pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 2, '{Blanche}', 1350)))).id;
select is((select string_agg(quantity || 'x' || unit_price_cents, ' + ' order by unit_price_cents) from public.order_items
           where order_id = (select id from ids where key = 'q2')),
          '1x600 + 1x750', 'au-delà du stock : 1 unité en promotion, le reste au tarif habituel');
select is((select quantity_used from public.happy_hours where id = (select id from ids where key = 'pq')), 3, 'quota atteint');
select is((select count(*)::int from public.active_happy_hours('30000000-0000-0000-0000-000000000001', 'pickup')
           where item_id = '50000000-0000-0000-0000-000000000003'), 0, 'offre épuisée : elle n''est plus proposée');
insert into ids select 'q3', (pg_temp.order_of(jsonb_build_array(pg_temp.line('50000000-0000-0000-0000-000000000003', 1, '{Blanche}', 750)))).id;
select is((select unit_price_cents from public.order_items where order_id = (select id from ids where key = 'q3')),
          750, 'épuisée : tarif habituel');
-- Le stock est rendu quand une commande est annulée, refusée ou expirée.
update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system' where id = (select id from ids where key = 'q1');
select is((select quantity_used from public.happy_hours where id = (select id from ids where key = 'pq')), 1,
          'commande annulée : ses 2 unités en promotion sont rendues');
update public.orders set status = 'expired', cancelled_at = now() where id = (select id from ids where key = 'q1');
select is((select quantity_used from public.happy_hours where id = (select id from ids where key = 'pq')), 1,
          'une commande déjà annulée ne rend rien deux fois');

-- Suppression : les commandes passées gardent leur prix.
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.delete_happy_hour((select id from ids where key = 'pq')) $$, 'le propriétaire supprime une offre');
reset role;
select is((select unit_price_cents from public.order_items where order_id = (select id from ids where key = 'q2') and happy_hour_name is not null),
          600, 'les commandes passées gardent le prix appliqué et le nom de l''offre');
select ok((select happy_hour_id is null from public.order_items where order_id = (select id from ids where key = 'q2') and happy_hour_name is not null),
          'sans lien vers l''offre supprimée');

select * from finish();
rollback;
