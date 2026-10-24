begin;
select plan(22);

-- Modèle de paiement actuel : le client paie directement le professionnel (lien de paiement ou espèces).
-- ZeeRoo n'encaisse rien : le client DÉCLARE avoir payé, le professionnel CONFIRME la réception.
delete from public.orders;
update public.couriers set last_assigned_at = null;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;
update public.merchants set accepts_cash_pickup = true where id = '30000000-0000-0000-0000-000000000001';

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.addr() returns jsonb language sql as $$
  select jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                            'latitude', 48.8700, 'longitude', 2.3400, 'phone', '06 98 76 54 32')
$$;
create function pg_temp.kebab() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
    'option_ids', (select jsonb_agg(o.id) from public.menu_options o
                   where o.group_id = '60000000-0000-0000-0000-000000000003' and o.name = 'Blanche')))
$$;

create temporary table o (key text primary key, id uuid);
grant all on o to authenticated;

-- Une livraison acceptée par le restaurant, que personne n'a encore prise.
create function pg_temp.accepted_delivery(p_key text, p_merchant uuid, p_owner uuid, p_items jsonb) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.create_order('20000000-0000-0000-0000-000000000001', p_merchant,
                                               p_items, null, pg_temp.addr(), 'card', 'card');
  insert into o values (p_key, v_id);
  perform public.mark_order_authorized(v_id, 'pi_' || p_key);
  perform public.apply_order_transition(v_id, p_owner, 'accepted', 10);
end $$;



create function pg_temp.pickup_order(p_key text, p_meal_payment public.payment_method) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                               pg_temp.kebab(), null, null, p_meal_payment, 'card');
  insert into o values (p_key, v_id);
  if p_meal_payment = 'card' then perform public.mark_order_authorized(v_id, 'pi_' || p_key); end if;
end $$;

select pg_temp.pickup_order('carte', 'card');
select pg_temp.pickup_order('especes', 'cash');
select pg_temp.accepted_delivery('livraison', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', pg_temp.kebab());
select is((select status::text from public.orders where id = (select id from o where key = 'especes')), 'placed', 'espèces : la commande part directement au restaurant');

-- -------------------------------------------------------------------------------------
-- Repas payé par carte (lien du restaurant)
-- -------------------------------------------------------------------------------------
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'carte'), 'meal') $$,
                 '22023', 'payment_not_expected', 'pas de paiement avant l''acceptation du restaurant');
reset role;
select public.apply_order_transition((select id from o where key = 'carte'), '10000000-0000-0000-0000-000000000001', 'accepted', 10);

-- Un tiers (le livreur) ne déclare pas à la place du client
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'carte'), 'meal') $$,
                 'P0002', 'order_not_found', 'un tiers ne peut pas déclarer un paiement');
select throws_ok($$ select public.merchant_confirm_payment((select id from o where key = 'carte')) $$,
                 'P0002', 'order_not_found', 'un tiers ne peut pas confirmer un paiement');
reset role;

select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.merchant_confirm_payment((select id from o where key = 'carte')) $$,
                 'P0002', 'order_not_found', 'le client ne confirme pas son propre paiement');
select lives_ok($$ select public.customer_declare_payment((select id from o where key = 'carte'), 'meal') $$, 'le client déclare avoir payé');
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'carte'), 'autre') $$,
                 '22023', 'invalid_payment_kind', 'type de paiement inconnu refusé');
reset role;
select ok((select meal_payment_declared_at is not null and paid_at is null from public.orders where id = (select id from o where key = 'carte')),
          'déclaré mais pas encore confirmé : la commande n''est pas marquée payée');
create temporary table first_decl as select meal_payment_declared_at as at from public.orders where id = (select id from o where key = 'carte');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select public.customer_declare_payment((select id from o where key = 'carte'), 'meal');
reset role;
select is((select meal_payment_declared_at from public.orders where id = (select id from o where key = 'carte')), (select at from first_decl),
          'déclarer deux fois ne change pas la date');

select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.merchant_confirm_payment((select id from o where key = 'carte')) $$, 'le restaurant confirme la réception');
reset role;
select ok((select paid_at is not null from public.orders where id = (select id from o where key = 'carte')), 'commande payée après confirmation du restaurant');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'carte'), 'meal') $$,
                 '22023', 'payment_not_expected', 'plus de déclaration une fois le paiement confirmé');
reset role;

-- -------------------------------------------------------------------------------------
-- Espèces au comptoir : aucune déclaration, encaissé à la remise
-- -------------------------------------------------------------------------------------
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'especes'), 'meal') $$,
                 '22023', 'payment_not_expected', 'espèces : pas de paiement en ligne à déclarer');
reset role;
select public.apply_order_transition((select id from o where key = 'especes'), '10000000-0000-0000-0000-000000000001', 'accepted', 10);
select ok((select paid_at is null from public.orders where id = (select id from o where key = 'especes')), 'espèces : rien n''est marqué payé avant la remise');
select public.apply_order_transition((select id from o where key = 'especes'), '10000000-0000-0000-0000-000000000001', 'ready');
select public.apply_order_transition((select id from o where key = 'especes'), '10000000-0000-0000-0000-000000000001', 'collected', null, null,
                                     (select pickup_code from public.orders where id = (select id from o where key = 'especes')));
select ok((select paid_at is not null from public.orders where id = (select id from o where key = 'especes')), 'espèces : encaissé à la remise');

-- -------------------------------------------------------------------------------------
-- Course payée au livreur (lien du livreur)
-- -------------------------------------------------------------------------------------
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.customer_declare_payment((select id from o where key = 'livraison'), 'delivery') $$,
                 '22023', 'payment_not_expected', 'pas de paiement de la course avant qu''un livreur la prenne');
reset role;
update public.orders set estimated_ready_at = now() + interval '10 minutes';
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'livraison')) $$, 'un livreur prend la course');
reset role;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.customer_declare_payment((select id from o where key = 'livraison'), 'delivery') $$, 'le client déclare avoir payé la course');
select throws_ok($$ select public.courier_confirm_delivery_payment((select id from o where key = 'livraison')) $$,
                 'P0002', 'order_not_found', 'le client ne confirme pas à la place du livreur');
reset role;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.courier_confirm_delivery_payment((select id from o where key = 'livraison')) $$,
                 'P0002', 'order_not_found', 'le restaurant ne confirme pas le paiement de la course');
reset role;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_confirm_delivery_payment((select id from o where key = 'livraison')) $$, 'le livreur confirme la réception');
reset role;
select ok((select delivery_paid_at is not null and paid_at is null from public.orders where id = (select id from o where key = 'livraison')),
          'la course est payée sans que le repas le soit : deux paiements séparés');

select * from finish();
rollback;
