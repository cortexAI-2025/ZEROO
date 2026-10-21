begin;
select plan(44);

-- Isolation vis-à-vis des données de démo (seed.sql) ; annulé par le rollback final.
delete from public.orders;
delete from public.merchants;

-- Acteurs : deux commerçants, un client.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'samir@test.fr'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'lea@test.fr'),
  ('cccccccc-0000-0000-0000-000000000001', 'client@test.fr');
-- Professionnels : e-mail et téléphone vérifiés (voir pro_verification.test.sql).
update auth.users set email_confirmed_at = now(), phone = '3361000000' || right(id::text, 1), phone_confirmed_at = now()
where id::text like 'aaaaaaaa-%';

-- -----------------------------------------------------------------------------
-- Création du commerce
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

select is(
  (select slug from public.create_merchant('Chez Samir — Snack Délices', 'snack', '12 rue de la Paix', '75002', 'Paris', 48.8686, 2.3314)),
  'chez-samir-snack-delices',
  'le slug est calculé sans accents ni ponctuation'
);

select throws_ok(
  $$select public.create_merchant('Deuxième', 'snack', '1 rue A', '75001', 'Paris', 48.86, 2.34)$$,
  '23505', 'merchant_already_exists',
  'un compte ne peut créer qu''un seul commerce'
);

select throws_ok(
  $$insert into public.merchants (owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'X', 'snack', 'rue', '75001', 'Paris', 1, 1)$$,
  '42501', null,
  'l''insertion directe dans merchants est interdite'
);

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated"}';
select is(
  (select slug from public.create_merchant('Chez Samir', 'restaurant', '3 rue B', '69001', 'Lyon', 45.76, 4.83)),
  'chez-samir',
  'slug de base'
);
reset role;

-- Doublon de slug : suffixe numérique.
insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'autre@test.fr', now(), '33610000003', now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "role": "authenticated"}';
select is(
  (select slug from public.create_merchant('Chez Samir !', 'snack', '4 rue C', '13001', 'Marseille', 43.29, 5.37)),
  'chez-samir-2',
  'un slug déjà pris reçoit un suffixe'
);
reset role;

select ok(
  (select l.location is not null from public.merchant_locations l join public.merchants m on m.id = l.merchant_id where m.slug = 'chez-samir'),
  'la position géographique est calculée depuis latitude / longitude (merchant_locations)'
);

-- -----------------------------------------------------------------------------
-- Visibilité et modification
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from public.merchants), 0, 'un visiteur ne voit pas les commerces non publiés');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(
  (select count(*)::int from public.merchants),
  1,
  'un commerçant voit son commerce non publié, pas ceux des autres'
);

update public.merchants set is_published = true, default_prep_minutes = 12
where slug = 'chez-samir-snack-delices';
select is(
  (select default_prep_minutes from public.merchants where slug = 'chez-samir-snack-delices'),
  12,
  'le propriétaire modifie son commerce'
);

select throws_ok(
  $$update public.merchants set owner_id = 'aaaaaaaa-0000-0000-0000-000000000002' where slug = 'chez-samir-snack-delices'$$,
  '42501', null,
  'le propriétaire ne peut pas céder son commerce'
);

update public.merchants set name = 'Piraté' where slug = 'chez-samir';
reset role;
select is((select name from public.merchants where slug = 'chez-samir'), 'Chez Samir', 'on ne modifie pas le commerce d''un autre');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from public.merchants), 1, 'un commerce publié est visible des visiteurs');
reset role;

-- -----------------------------------------------------------------------------
-- Menu
-- -----------------------------------------------------------------------------
create temporary table ids (key text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into ids
select 'samir', id from public.merchants where slug = 'chez-samir-snack-delices';

with c as (
  insert into public.menu_categories (merchant_id, name)
  select id, 'Sandwichs' from ids where key = 'samir'
  returning id
)
insert into ids select 'cat', id from c;

with i as (
  insert into public.menu_items (merchant_id, category_id, name, price_cents, is_loyalty_menu)
  select (select id from ids where key = 'samir'), (select id from ids where key = 'cat'), 'Menu Tacos', 850, true
  returning id
)
insert into ids select 'item', id from i;

select is((select count(*)::int from public.menu_items), 1, 'le commerçant ajoute des produits à son menu');

with g as (
  insert into public.menu_option_groups (merchant_id, item_id, name, min_select, max_select)
  select (select id from ids where key = 'samir'), (select id from ids where key = 'item'), 'Sauce', 1, 1
  returning id
)
insert into public.menu_options (merchant_id, group_id, name)
select (select id from ids where key = 'samir'), id, unnest(array['Algérienne', 'Samouraï']) from g;
select is((select count(*)::int from public.menu_options), 2, 'le commerçant ajoute des options');

-- Léa tente d'écrire dans le menu de Samir.
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated"}';
insert into ids select 'lea', id from public.merchants where slug = 'chez-samir';

select throws_ok(
  $$insert into public.menu_categories (merchant_id, name) select id, 'Pirate' from ids where key = 'samir'$$,
  '42501', null,
  'un commerçant ne peut pas écrire dans le menu d''un autre'
);

select throws_ok(
  $$insert into public.menu_items (merchant_id, category_id, name, price_cents)
    select (select id from ids where key = 'lea'), (select id from ids where key = 'cat'), 'Intrus', 100$$,
  '23503', null,
  'un produit ne peut pas être rangé dans la catégorie d''un autre commerce'
);

update public.menu_items set price_cents = 1 where name = 'Menu Tacos';
reset role;
select is((select price_cents from public.menu_items where name = 'Menu Tacos'), 850, 'on ne modifie pas les prix d''un autre');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is((select count(*)::int from public.menu_items), 1, 'le menu d''un commerce publié est visible des visiteurs');
reset role;

-- -----------------------------------------------------------------------------
-- Horaires, pause et disponibilité
-- -----------------------------------------------------------------------------
-- Mercredi 7 octobre 2026 (ISO 3), heures de Paris (UTC+2).
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select id, 3, '11:00'::time, '14:30'::time from ids where key = 'samir'
union all
select id, 3, '18:00'::time, '02:00'::time from ids where key = 'samir';

select ok(public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-07 12:00+02'), 'ouvert à midi');
select ok(not public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-07 15:00+02'), 'fermé entre les services');
select ok(public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-07 23:30+02'), 'ouvert le soir');
select ok(public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-08 01:30+02'), 'toujours ouvert après minuit (créneau de la veille)');
select ok(not public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-08 12:00+02'), 'fermé le jeudi (aucun créneau)');
select ok(public.is_merchant_open((select id from ids where key = 'samir'), '2026-10-07 10:30Z'), 'tient compte du fuseau horaire du commerce');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(
  (select count(*)::int from public.set_opening_hours(
    (select id from ids where key = 'samir'),
    '[{"weekday": 3, "opens_at": "11:00", "closes_at": "14:30"}, {"weekday": 3, "opens_at": "18:00", "closes_at": "02:00"}]'
  )),
  2,
  'set_opening_hours remplace les créneaux'
);
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$select public.set_opening_hours((select id from ids where key = 'samir'), '[]')$$,
  'P0002', 'merchant_not_found',
  'on ne modifie pas les horaires d''un autre commerce'
);
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

update public.merchants set is_paused = true, paused_until = now() + interval '30 minutes' where slug = 'chez-samir-snack-delices';
select ok(public.is_paused_now(m), 'pause active') from public.merchants m where slug = 'chez-samir-snack-delices';
update public.merchants set paused_until = now() - interval '1 minute' where slug = 'chez-samir-snack-delices';
select ok(not public.is_paused_now(m), 'une pause temporisée expire d''elle-même') from public.merchants m where slug = 'chez-samir-snack-delices';

-- -----------------------------------------------------------------------------
-- Commandes
-- -----------------------------------------------------------------------------
insert into public.orders (id, merchant_id, customer_id, customer_name, pickup_code, status, subtotal_cents, total_cents, placed_at)
select 'dddddddd-0000-0000-0000-000000000001', id, 'cccccccc-0000-0000-0000-000000000001', 'Nadia', 'K7P2', 'placed', 850, 850, now()
from ids where key = 'samir';
insert into public.order_items (order_id, name, unit_price_cents, quantity, line_total_cents)
values ('dddddddd-0000-0000-0000-000000000001', 'Menu Tacos', 850, 1, 850);

set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000001", "role": "authenticated"}';
select is((select count(*)::int from public.order_items), 1, 'le client voit sa commande et son contenu');
select throws_ok(
  $$insert into public.orders (merchant_id, subtotal_cents, total_cents) select id, 0, 0 from ids where key = 'samir'$$,
  '42501', null,
  'un client ne peut pas créer de commande directement (passage par le serveur)'
);
select throws_ok(
  $$select public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'collected', p_pickup_code => 'K7P2')$$,
  'P0002', 'order_not_found',
  'un client ne peut pas changer le statut de sa commande'
);

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "role": "authenticated"}';
select is((select count(*)::int from public.orders), 0, 'un autre commerçant ne voit pas la commande');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$select public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'accepted', p_prep_minutes => 10)$$,
  '22023', 'payment_action_required',
  'accepter directement est interdit : il faut passer par l''Edge Function (capture du paiement)'
);
select throws_ok(
  $$select public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'ready')$$,
  '22023', null,
  'transition interdite : placed -> ready'
);
select throws_ok(
  $$select public.apply_order_transition('dddddddd-0000-0000-0000-000000000001', auth.uid(), 'accepted')$$,
  '42501', null,
  'le moteur de transitions est réservé au serveur'
);
reset role;
select throws_ok(
  $$select public.apply_order_transition('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'accepted')$$,
  '22023', 'prep_minutes_required',
  'accepter exige un délai de préparation'
);
select throws_ok(
  $$select public.apply_order_transition('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'accepted', 10)$$,
  'P0002', 'order_not_found',
  'un autre commerçant ne peut pas accepter la commande'
);
select ok(
  (select estimated_ready_at between now() + interval '9 minutes' and now() + interval '11 minutes'
   from public.apply_order_transition('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'accepted', 10)),
  'accepter avec 10 min fixe l''heure de prêt'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(
  (select revenue_cents from public.merchant_today_summary((select id from ids where key = 'samir'))),
  850::bigint,
  'le chiffre d''affaires du jour compte les commandes acceptées'
);
select lives_ok($$select public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'ready')$$, 'commande prête');
select throws_ok(
  $$select public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'collected', p_pickup_code => 'AAAA')$$,
  '22023', 'invalid_pickup_code',
  'remise refusée avec un mauvais code de retrait'
);
select is(
  (select status::text from public.set_order_status('dddddddd-0000-0000-0000-000000000001', 'collected', p_pickup_code => ' k7p2 ')),
  'collected',
  'remise acceptée avec le bon code (casse et espaces ignorés)'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  'select public.delete_my_account()',
  '23503', 'merchant_owner_cannot_delete',
  'un propriétaire de commerce ne peut pas supprimer son compte directement'
);
reset role;

-- RGPD : suppression du compte client.
delete from auth.users where id = 'cccccccc-0000-0000-0000-000000000001';
select is(
  (select row(customer_id, customer_name)::text from public.orders where id = 'dddddddd-0000-0000-0000-000000000001'),
  '(,)',
  'la commande est conservée mais anonymisée après suppression du compte client'
);

select * from finish();
rollback;
