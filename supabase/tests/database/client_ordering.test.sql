begin;
select plan(34);

-- Données de démo (seed.sql) : « Chez Samir », cliente Nadia Démo. On écarte tout le reste
-- (commandes et commerces créés par d'autres tests), le rollback final restaure l'état.
delete from public.orders;
delete from public.merchants where id <> '30000000-0000-0000-0000-000000000001';
-- Horaires remplacés par une ouverture 24 h/24 pour que le test passe à toute heure.
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, t.opens, t.closes
from generate_series(1, 7) d, (values ('00:00'::time, '12:00'::time), ('12:00'::time, '00:00'::time)) t(opens, closes);

create temporary table opt as
select o.id, g.item_id, g.name as group_name, o.name
from public.menu_options o join public.menu_option_groups g on g.id = o.group_id;
grant select on opt to anon, authenticated, service_role;

create function pg_temp.opt(p_item uuid, p_group text, p_name text) returns uuid language sql as $$
  select id from opt where item_id = p_item and group_name = p_group and name = p_name
$$;

-- -----------------------------------------------------------------------------
-- Recherche
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(
  (select distance_m between 100 and 300 from public.nearby_merchants(48.87, 2.33)),
  true,
  'nearby_merchants : commerce trouvé avec sa distance'
);
select is((select count(*)::int from public.nearby_merchants(45.76, 4.83)), 0, 'nearby_merchants : rien de trop loin (Lyon)');
select is((select name from public.search_merchants('PARIS')), 'Chez Samir', 'search_merchants : par ville, sans casse');
select is((select name from public.search_merchants('750')), 'Chez Samir', 'search_merchants : par code postal');
select is((select name from public.search_merchants('chez samir')), 'Chez Samir', 'search_merchants : par nom');
select ok((select is_accepting_orders from public.search_merchants('samir')), 'le commerce publié et ouvert accepte les commandes');
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '[]')$$,
  '42501', null,
  'un visiteur ne peut pas appeler create_order'
);
reset role;

update public.merchants set is_published = false where id = '30000000-0000-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.search_merchants('samir')), 0, 'un commerce non publié n''apparaît pas');
reset role;
update public.merchants set is_published = true where id = '30000000-0000-0000-0000-000000000001';

-- -----------------------------------------------------------------------------
-- Commande valide (appelée par l'Edge Function create-order, en service role)
-- -----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '[]')$$,
  '42501', null,
  'un client ne peut pas créer de commande sans passer par le paiement'
);
reset role;
set local role service_role;

create temporary table placed as
select * from public.create_order(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'item_id', '50000000-0000-0000-0000-000000000001', 'quantity', 2,
      'option_ids', jsonb_build_array(
        pg_temp.opt('50000000-0000-0000-0000-000000000001', 'Sauce', 'Algérienne'),
        pg_temp.opt('50000000-0000-0000-0000-000000000001', 'Suppléments', 'Cheddar')
      )
    ),
    jsonb_build_object(
      'item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
      'option_ids', jsonb_build_array(pg_temp.opt('50000000-0000-0000-0000-000000000003', 'Sauce', 'Blanche'))
    )
  ),
  '  Sans oignons  '
);

select is(
  (select row(status, total_cents, customer_name, customer_note)::text from placed),
  '(pending_payment,3050,"Nadia Démo","Sans oignons")',
  'commande créée en attente de paiement : 2 × (10,50 + 1,00) + 7,50 = 30,50 €, au nom du client'
);
select is(
  (select array_agg(line_total_cents order by line_total_cents) from public.order_items where order_id = (select id from placed)),
  array[750, 2300],
  'les lignes reprennent les prix du menu en base'
);
select is(
  (select options from public.order_items where order_id = (select id from placed) and quantity = 2),
  '[{"name": "Algérienne", "group": "Sauce", "price_delta_cents": 0}, {"name": "Cheddar", "group": "Suppléments", "price_delta_cents": 100}]'::jsonb,
  'les options choisies sont recopiées dans la ligne'
);
select ok(length((select pickup_code from placed)) = 4, 'un code de retrait est attribué');
reset role;

-- -----------------------------------------------------------------------------
-- Paiement
-- -----------------------------------------------------------------------------
select is(
  (select status::text || '|' || stripe_payment_intent_id from public.mark_order_authorized((select id from placed), 'pi_test_1')),
  'placed|pi_test_1',
  'paiement autorisé : la commande part chez le commerçant'
);
select ok(
  (select id is null from public.mark_order_authorized((select id from placed), 'pi_autre')),
  'un second événement de paiement est sans effet (idempotence)'
);
select ok(
  (select id is null from public.mark_order_payment_failed((select id from placed))),
  'un échec de paiement tardif ne peut pas annuler une commande déjà autorisée'
);
select throws_ok(
  format($$select public.apply_order_transition('%s', '20000000-0000-0000-0000-000000000099', 'cancelled')$$, (select id from placed)),
  'P0002', 'order_not_found',
  'un autre utilisateur ne peut pas annuler la commande'
);
select is(
  (select status::text from public.apply_order_transition((select id from placed), '20000000-0000-0000-0000-000000000001', 'cancelled')),
  'cancelled',
  'le client annule tant que le commerçant n''a pas accepté'
);

-- Conditions d'encaissement : lien de paiement (ou espèces) et abonnement en règle.
update public.subscriptions set status = 'past_due' where merchant_id = '30000000-0000-0000-0000-000000000001';
select ok(not public.is_accepting_orders(m), 'abonnement impayé : plus de commandes') from public.merchants m where m.id = '30000000-0000-0000-0000-000000000001';
update public.subscriptions set status = 'active' where merchant_id = '30000000-0000-0000-0000-000000000001';
-- Suspendue, la fiche a été dépubliée : le professionnel la republie une fois en règle.
update public.merchants set is_published = true where id = '30000000-0000-0000-0000-000000000001';
update public.merchants set payment_link = null, accepts_cash_pickup = false where id = '30000000-0000-0000-0000-000000000001';
select ok(not public.is_accepting_orders(m), 'ni lien de paiement ni espèces : plus de commandes') from public.merchants m where m.id = '30000000-0000-0000-0000-000000000001';
update public.merchants set payment_link = 'https://pay.sumup.com/b2c/chez-samir-demo' where id = '30000000-0000-0000-0000-000000000001';
select ok(public.is_accepting_orders(m), 'abonnement actif et paiements activés : commandes possibles') from public.merchants m where m.id = '30000000-0000-0000-0000-000000000001';

-- Expiration automatique.
insert into public.orders (id, merchant_id, customer_id, status, subtotal_cents, total_cents, placed_at, created_at, stripe_payment_intent_id)
values
  ('eeeeeeee-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'placed', 500, 500, now() - interval '11 minutes', now() - interval '11 minutes', 'pi_sans_reponse'),
  ('eeeeeeee-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'pending_payment', 500, 500, null, now() - interval '31 minutes', 'pi_abandonne'),
  ('eeeeeeee-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'placed', 500, 500, now() - interval '2 minutes', now() - interval '2 minutes', 'pi_recent');
select is(
  (select array_agg(stripe_payment_intent_id order by stripe_payment_intent_id) from public.expire_stale_orders()),
  array['pi_abandonne', 'pi_sans_reponse'],
  'expiration : sans réponse après 10 min, paiement abandonné après 30 min'
);
select is(
  (select array_agg(status::text order by id) from public.orders where id::text like 'eeeeeeee%'),
  array['expired', 'cancelled', 'placed'],
  'statuts après expiration (la commande récente attend toujours)'
);
delete from public.orders where id::text like 'eeeeeeee%';
set local role service_role;

-- -----------------------------------------------------------------------------
-- Commandes invalides
-- -----------------------------------------------------------------------------
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000001", "quantity": 1, "option_ids": []}]')$$,
  '22023', 'invalid_options',
  'refus : sauce obligatoire non choisie'
);
select throws_ok(
  format($$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000003", "quantity": 1, "option_ids": ["%s", "%s"]}]')$$,
    pg_temp.opt('50000000-0000-0000-0000-000000000003', 'Sauce', 'Blanche'),
    pg_temp.opt('50000000-0000-0000-0000-000000000003', 'Sauce', 'Harissa')),
  '22023', 'invalid_options',
  'refus : deux sauces alors qu''une seule est permise'
);
select throws_ok(
  format($$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000003", "quantity": 1, "option_ids": ["%s"]}]')$$,
    pg_temp.opt('50000000-0000-0000-0000-000000000001', 'Sauce', 'Samouraï')),
  '22023', 'invalid_options',
  'refus : option appartenant à un autre produit'
);
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000004", "quantity": 0}]')$$,
  '22023', 'invalid_quantity',
  'refus : quantité nulle'
);
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '[]')$$,
  '22023', 'empty_order',
  'refus : panier vide'
);
reset role;

update public.menu_items set is_available = false where id = '50000000-0000-0000-0000-000000000004';
set local role service_role;
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000004", "quantity": 1}]')$$,
  '22023', 'item_unavailable',
  'refus : produit en rupture'
);
reset role;

update public.merchants set is_paused = true where id = '30000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000002", "quantity": 1}]')$$,
  '22023', 'merchant_not_accepting',
  'refus : commerce en pause'
);
reset role;

update public.merchants set is_paused = false where id = '30000000-0000-0000-0000-000000000001';
delete from public.merchant_opening_hours where merchant_id = '30000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    '[{"item_id": "50000000-0000-0000-0000-000000000002", "quantity": 1}]')$$,
  '22023', 'merchant_not_accepting',
  'refus : commerce fermé'
);
select is(
  (select count(*)::int from public.orders where customer_id = '20000000-0000-0000-0000-000000000001'),
  1,
  'aucune commande partielle n''est créée en cas de refus'
);
reset role;

-- Un client garde l'accès au commerce où il a commandé, même dépublié.
update public.merchants set is_published = false where id = '30000000-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(
  (select name from public.merchants where id = '30000000-0000-0000-0000-000000000001'),
  'Chez Samir',
  'le client voit encore le commerce de sa commande après dépublication'
);
reset role;

insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000099', 'autre@test.fr');
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000099", "role": "authenticated"}';
select is(
  (select count(*)::int from public.merchants where id = '30000000-0000-0000-0000-000000000001'),
  0,
  'un autre utilisateur ne voit pas le commerce dépublié'
);
reset role;

select * from finish();
rollback;
