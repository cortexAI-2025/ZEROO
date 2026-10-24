begin;
select plan(18);

-- Contexte (seed) : « Chez Samir » (Pro), Karim livreur Pro rattaché et en ligne.
delete from public.orders;
update public.couriers set last_assigned_at = null;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

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



-- Une livraison à l'état « placée » (le restaurant n'a pas encore répondu).
create function pg_temp.placed_delivery(p_key text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                               pg_temp.kebab(), null, pg_temp.addr(), 'card', 'card');
  insert into o values (p_key, v_id);
  perform public.mark_order_authorized(v_id, 'pi_' || p_key);
end $$;

select pg_temp.placed_delivery(k) from unnest(array['refus', 'annule', 'expire', 'suivi']) k;
update public.orders set estimated_ready_at = now() + interval '10 minutes';
select is((select count(*)::int from public.orders where status = 'placed'), 4, 'quatre livraisons placées');

-- Karim prend deux missions avant la réponse du restaurant (capacité Pro : 2, missions compatibles).
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'refus')) $$, 'le livreur prend la mission dès la commande placée');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'annule')) $$, 'et une deuxième');
reset role;
select is(public.courier_active_count('80000000-0000-0000-0000-000000000001'), 2, 'deux courses actives');
-- Le client a déjà déclaré avoir payé la course : ce paiement ne doit pas être effacé.
update public.orders set delivery_payment_declared_at = now() where id = (select id from o where key = 'refus');

-- 1. Le restaurant refuse
select is((select status::text from public.apply_order_transition((select id from o where key = 'refus'),
            '10000000-0000-0000-0000-000000000001', 'refused', null, 'rupture')), 'refused', 'le restaurant refuse');
select is((select courier_id from public.orders where id = (select id from o where key = 'refus')), null, 'refus : le livreur est libéré');
select is((select released_courier_id from public.orders where id = (select id from o where key = 'refus')),
          '80000000-0000-0000-0000-000000000001'::uuid, 'refus : l''ancien livreur est conservé pour la notification');
select is((select courier_name from public.orders where id = (select id from o where key = 'refus')), null, 'refus : le nom du livreur n''est plus affiché');
select ok((select delivery_payment_declared_at is not null from public.orders where id = (select id from o where key = 'refus')),
          'refus : le paiement déjà déclaré n''est pas effacé');
select is(public.courier_active_count('80000000-0000-0000-0000-000000000001'), 1, 'refus : sa capacité est rendue');

-- 2. Le client annule avant la réponse
select is((select status::text from public.apply_order_transition((select id from o where key = 'annule'),
            '20000000-0000-0000-0000-000000000001', 'cancelled')), 'cancelled', 'le client annule');
select is((select courier_id from public.orders where id = (select id from o where key = 'annule')), null, 'annulation : le livreur est libéré');
select is(public.courier_active_count('80000000-0000-0000-0000-000000000001'), 0, 'annulation : plus aucune course active');

-- 3. La commande expire sans réponse du restaurant
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'expire')) $$, 'le livreur prend une troisième mission');
reset role;
select is((select status::text from public.apply_order_transition((select id from o where key = 'expire'), null, 'expired')), 'expired', 'la commande expire');
select is((select courier_id from public.orders where id = (select id from o where key = 'expire')), null, 'expiration : le livreur est libéré');

-- 4. Une commande acceptée par le restaurant garde son livreur
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'suivi')) $$, 'le livreur prend la mission');
reset role;
select public.apply_order_transition((select id from o where key = 'suivi'), '10000000-0000-0000-0000-000000000001', 'accepted', 10);
select is((select courier_id from public.orders where id = (select id from o where key = 'suivi')), '80000000-0000-0000-0000-000000000001'::uuid,
          'acceptation : le livreur reste affecté');

select * from finish();
rollback;
