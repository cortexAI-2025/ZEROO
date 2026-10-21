begin;
select plan(46);

-- Contexte (seed) : « Chez Samir » (publié, abonnement Pro en essai), propriétaire Samir, cliente Nadia.
-- Bob est un second client ; un autre commerce « Autre Snack » pour les droits.
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000002', 'bob@test.fr'),
  ('e0000000-0000-0000-0000-000000000001', 'autre@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'autre-snack', 'Autre Snack',
        'snack', '2 rue X', '75003', 'Paris', 48.86, 2.36, true);

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Données d'un panier surprise ; le créneau commence dans `p_start` heures et dure 2 h.
create function pg_temp.basket(p_start numeric default 2, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Panier du soir', 'is_surprise', true, 'price_cents', 399, 'estimated_value_cents', 1200,
    'quantity_total', 5, 'allergens', jsonb_build_array('gluten', 'milk'), 'allergens_confirmed', true,
    'pickup_starts_at', now() + make_interval(secs => p_start * 3600),
    'pickup_ends_at', now() + make_interval(secs => (p_start + 2) * 3600), 'is_active', true) || p_extra
$$;
create temporary table ids (key text primary key, id uuid);
grant all on ids to authenticated;

-- -----------------------------------------------------------------------------
-- Création par le commerçant
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'b1', id from public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket());
select is((select title || '|' || price_cents || '|' || quantity_total || '|' || quantity_reserved from public.surprise_baskets
           where id = (select id from ids where key = 'b1')), 'Panier du soir|399|5|0', 'le commerçant crée un panier surprise');
select ok((select b.is_reservable from public.surprise_baskets b where b.id = (select id from ids where key = 'b1')),
          'réservable : actif, créneau à venir, du stock');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null,
                     pg_temp.basket(2, '{"allergens_confirmed": false}')) $$, '23514', null,
                 'l''information allergènes doit être certifiée pour proposer le panier');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null,
                     pg_temp.basket(2, '{"allergens": ["poisson-rouge"]}')) $$, '23514', null,
                 'allergène hors liste officielle refusé');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null,
                     pg_temp.basket(2, '{"is_surprise": false}')) $$, '23514', null,
                 'un panier au contenu connu doit décrire son contenu');
select lives_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null,
                     pg_temp.basket(2, '{"is_surprise": false, "contents": "2 viennoiseries, 1 baguette"}')) $$,
                'contenu connu : accepté avec sa description');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket(2, '{"price_cents": 50}')) $$,
                 '23514', null, 'prix minimum 1,00 €');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket(2, '{"estimated_value_cents": 100}')) $$,
                 '23514', null, 'la valeur indicative ne peut pas être inférieure au prix');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket(-3)) $$,
                 'invalid_basket', 'pas de panier créé dans le passé');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null,
                     pg_temp.basket(2, jsonb_build_object('pickup_ends_at', now() + interval '20 hours'))) $$,
                 '23514', null, 'créneau de retrait limité à 12 heures');
select throws_ok($$ insert into public.surprise_baskets (merchant_id, title, price_cents, quantity_total, pickup_starts_at, pickup_ends_at)
                    values ('30000000-0000-0000-0000-000000000001', 'Direct', 399, 1, now(), now() + interval '1 hour') $$,
                 '42501', null, 'aucune écriture directe');
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket()) $$,
                 'merchant_not_found', 'un autre commerçant ne crée pas de panier chez Samir');
select throws_ok($$ select public.set_basket_active((select id from ids where key = 'b1'), false) $$,
                 'basket_not_found', 'ni ne le désactive');
reset role;

-- -----------------------------------------------------------------------------
-- Lecture publique
-- -----------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.surprise_baskets where merchant_id = '30000000-0000-0000-0000-000000000001' and is_active), 2,
          'un visiteur voit les paniers actifs d''un commerce publié');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 1) $$, '42501', null,
                 'mais ne réserve pas sans compte');
reset role;

-- -----------------------------------------------------------------------------
-- Réservation et stock
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
insert into ids select 'r1', id from public.reserve_basket((select id from ids where key = 'b1'), 2);
select is((select quantity_reserved from public.surprise_baskets where id = (select id from ids where key = 'b1')), 2,
          'la réservation consomme le stock');
select is((select unit_price_cents || '|' || status || '|' || length(pickup_code) from public.basket_reservations
           where id = (select id from ids where key = 'r1')), '399|reserved|4', 'prix figé, code de retrait à 4 caractères');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 2) $$, 'basket_limit',
                 'au plus 3 paniers actifs par client et par offre');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 4) $$, 'invalid_quantity',
                 'quantité invalide');
select pg_temp.as_user('20000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 3) $$, 'Bob réserve les 3 derniers');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 1) $$, 'basket_limit',
                 'Bob a atteint sa limite de 3');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 1) $$, 'basket_sold_out', 'complet : 2 + 3 = 5 paniers');
select pg_temp.as_user('20000000-0000-0000-0000-000000000002');
select ok(not (select b.is_reservable from public.surprise_baskets b where b.id = (select id from ids where key = 'b1')),
          'plus réservable une fois le stock épuisé');

-- Isolation : chacun ne voit que ses réservations
select is((select count(*)::int from public.basket_reservations), 1, 'Bob ne voit que sa réservation');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.basket_reservations), 1, 'Nadia ne voit que la sienne');
select throws_ok($$ select public.cancel_basket_reservation((select id from public.basket_reservations
                     where customer_id = '20000000-0000-0000-0000-000000000002')) $$,
                 'reservation_not_found', 'et ne peut pas annuler celle d''un autre');
reset role;
select is((select count(*)::int from public.basket_reservations), 2, 'les deux réservations existent');

-- -----------------------------------------------------------------------------
-- Annulation : le stock est libéré
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select status || '|' || cancelled_by from public.cancel_basket_reservation((select id from ids where key = 'r1'))),
          'cancelled|customer', 'le client annule avant le début du créneau');
select is((select quantity_reserved from public.surprise_baskets where id = (select id from ids where key = 'b1')), 3,
          'le stock est libéré (5 − 3 de Bob)');
select throws_ok($$ select public.cancel_basket_reservation((select id from ids where key = 'r1')) $$,
                 'reservation_not_cancellable', 'une réservation annulée ne s''annule pas deux fois');
select lives_ok($$ select public.reserve_basket((select id from ids where key = 'b1'), 2) $$, 'le stock libéré est de nouveau réservable');
reset role;

-- Annulation tardive : le client ne peut plus annuler une fois le créneau commencé.
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
insert into ids select 'b2', id from public.save_basket('30000000-0000-0000-0000-000000000001', null, pg_temp.basket(1));
reset role;
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
insert into ids select 'r2', id from public.reserve_basket((select id from ids where key = 'b2'), 1);
reset role;
update public.surprise_baskets set pickup_starts_at = now() - interval '10 minutes', pickup_ends_at = now() + interval '110 minutes'
where id = (select id from ids where key = 'b2');
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.cancel_basket_reservation((select id from ids where key = 'r2')) $$,
                 'basket_cancel_too_late', 'le créneau a commencé : le client ne peut plus annuler');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select cancelled_by from public.cancel_basket_reservation((select id from ids where key = 'r2'))), 'merchant',
          'le commerçant peut annuler à tout moment');
select is((select quantity_reserved from public.surprise_baskets where id = (select id from ids where key = 'b2')), 0,
          'et le stock est libéré');
reset role;

-- -----------------------------------------------------------------------------
-- Remise du panier
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
insert into ids select 'r3', id from public.reserve_basket((select id from ids where key = 'b2'), 1);
reset role;
set local role authenticated;
select pg_temp.as_user('e0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.collect_basket_reservation((select id from ids where key = 'r3'), 'XXXX') $$,
                 'reservation_not_found', 'un autre commerçant ne remet pas ce panier');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.collect_basket_reservation((select id from ids where key = 'r3'), 'ZZZZ') $$,
                 'invalid_pickup_code', 'mauvais code refusé');
select is((select status from public.collect_basket_reservation((select id from ids where key = 'r3'),
            (select lower(pickup_code) from public.basket_reservations where id = (select id from ids where key = 'r3')))),
          'collected', 'le bon code (casse ignorée) valide la remise');
select throws_ok($$ select public.collect_basket_reservation((select id from ids where key = 'r3'), 'ZZZZ') $$,
                 'reservation_not_cancellable', 'une remise ne se refait pas');
reset role;

-- -----------------------------------------------------------------------------
-- Fermeture automatique
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
insert into ids select 'r4', id from public.reserve_basket((select id from ids where key = 'b2'), 1);
reset role;
update public.surprise_baskets set pickup_starts_at = now() - interval '4 hours', pickup_ends_at = now() - interval '1 hour'
where id = (select id from ids where key = 'b2');
select ok(not (select b.is_reservable from public.surprise_baskets b where b.id = (select id from ids where key = 'b2')),
          'créneau terminé : le panier n''est plus proposé');
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.reserve_basket((select id from ids where key = 'b2'), 1) $$, 'basket_closed',
                 'et ne se réserve plus');
reset role;
select is(public.expire_basket_reservations(), 1, 'la réservation non retirée expire');
select is((select status || '|' || cancelled_by from public.basket_reservations where id = (select id from ids where key = 'r4')),
          'expired|system', 'expirée par le système');
select is((select status from public.basket_reservations where id = (select id from ids where key = 'r3')), 'collected',
          'une remise effectuée n''expire pas');
select is((select count(*)::int from cron.job where jobname = 'expire-basket-reservations'), 1, 'tâche planifiée');

-- -----------------------------------------------------------------------------
-- Commerce non publié, RGPD
-- -----------------------------------------------------------------------------
update public.merchants set is_published = false where id = '30000000-0000-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.surprise_baskets), 0, 'les paniers d''un commerce non publié sont invisibles');
reset role;
update public.merchants set is_published = true where id = '30000000-0000-0000-0000-000000000001';
delete from auth.users where id = '20000000-0000-0000-0000-000000000002';
select ok((select customer_name is null and customer_id is null from public.basket_reservations
           where basket_id = (select id from ids where key = 'b1') and quantity = 3),
          'suppression du compte : la réservation est anonymisée');

select * from finish();
rollback;
