begin;
select plan(25);

delete from public.orders;
update public.couriers set last_assigned_at = null;
update public.happy_hours set is_active = false;
-- Horaires : uniquement le jour J+3 (11 h – 14 h, heure de Paris) → l'établissement est fermé maintenant.
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
values ('30000000-0000-0000-0000-000000000001', extract(isodow from current_date + 3)::int, '11:00', '14:00');

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



create function pg_temp.slot(p_h int, p_m int default 0) returns timestamptz language sql as $$
  select (((current_date + 3) + make_time(p_h, p_m, 0))::timestamp at time zone 'Europe/Paris')
$$;
create function pg_temp.try_order(p_scheduled timestamptz, p_group jsonb default null, p_delivery jsonb default null,
                                  p_items jsonb default null) returns text language plpgsql as $$
declare v_order public.orders;
begin
  v_order := public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                 coalesce(p_items, pg_temp.kebab()), null, p_delivery, 'card', 'card', p_scheduled, p_group);
  insert into o values ('last', v_order.id) on conflict (key) do update set id = excluded.id;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
-- Immédiat : fermé maintenant
select is(pg_temp.try_order(null), 'merchant_not_accepting', 'fermé maintenant : commande immédiate refusée');
-- Précommande à 12 h 30 le jour d'ouverture
select is(pg_temp.try_order(pg_temp.slot(12, 30)), 'ok', 'précommande pendant les horaires d''ouverture : acceptée');
select is((select scheduled_for from public.orders where id = (select id from o where key = 'last')), pg_temp.slot(12, 30),
          'l''heure choisie est enregistrée');
select is(pg_temp.try_order(pg_temp.slot(16)), 'merchant_closed_at_slot', 'hors horaires à l''heure choisie : refusée');
select is(pg_temp.try_order(now() + interval '5 minutes'), 'invalid_schedule', 'délai de préparation non respecté : refusée');
select is(pg_temp.try_order(now() + interval '20 days'), 'invalid_schedule', 'au-delà de 14 jours : refusée');
-- Fermeture exceptionnelle ce jour-là
insert into public.merchant_closures (merchant_id, starts_at, ends_at)
values ('30000000-0000-0000-0000-000000000001', pg_temp.slot(0), pg_temp.slot(23, 59));
select is(pg_temp.try_order(pg_temp.slot(12, 30)), 'merchant_closed_at_slot', 'fermeture exceptionnelle : refusée');
delete from public.merchant_closures;

-- Acceptation : la commande est prête à l'heure demandée
select pg_temp.try_order(pg_temp.slot(12, 30));
select public.mark_order_authorized((select id from o where key = 'last'), 'pi_sched');
select public.apply_order_transition((select id from o where key = 'last'), '10000000-0000-0000-0000-000000000001', 'accepted', 20);
select is((select estimated_ready_at from public.orders where id = (select id from o where key = 'last')), pg_temp.slot(12, 30),
          'acceptation : prête à l''heure demandée (pas dans 20 minutes)');

-- Happy Hour calculée à l'heure choisie
update public.subscriptions set plan = 'pro', status = 'active' where merchant_id = '30000000-0000-0000-0000-000000000001';
insert into public.happy_hours (id, merchant_id, name, discount_type, percent_off, applies_to_pickup, applies_to_delivery, starts_on, ends_on, is_active)
values ('f0000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', 'Midi', 'percent', 50, true, true,
        current_date - 1, current_date + 30, true);
insert into public.happy_hour_slots (happy_hour_id, merchant_id, weekday, starts_at, ends_at)
values ('f0000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', extract(isodow from current_date + 3)::int, '12:00', '13:00');
insert into public.happy_hour_items (happy_hour_id, merchant_id, item_id)
values ('f0000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003');
select pg_temp.try_order(pg_temp.slot(12, 30));
select ok((select i.unit_price_cents < i.regular_unit_cents from public.order_items i where i.order_id = (select id from o where key = 'last')),
          'Happy Hour appliquée à l''heure de la précommande');
select pg_temp.try_order(pg_temp.slot(13, 30));
select ok((select i.happy_hour_id is null from public.order_items i where i.order_id = (select id from o where key = 'last')),
          'hors plage de l''offre : tarif habituel');

-- Livraison programmée : pas de livreur en ligne exigé maintenant
update public.couriers set is_available = false, available_until = null where id = '80000000-0000-0000-0000-000000000001';
select is(pg_temp.try_order(pg_temp.slot(12, 30), null, pg_temp.addr()), 'ok', 'livraison programmée sans livreur en ligne : acceptée');
select is((select count(*)::int from public.available_missions()), 0, 'hors ligne : aucune mission');
update public.couriers set is_available = true, available_until = now() + interval '1 day' where id = '80000000-0000-0000-0000-000000000001';
-- la mission d'une précommande lointaine n'est pas proposée
update public.orders set status = 'accepted', accepted_at = now() where id = (select id from o where key = 'last');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(not exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'last')),
          'précommande à J+3 : mission non proposée');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'last')) $$,
                 'P0002', 'mission_unavailable', 'précommande à J+3 : prise refusée côté serveur');
reset role;
update public.orders set scheduled_for = now() + interval '30 minutes', estimated_ready_at = now() + interval '30 minutes'
where id = (select id from o where key = 'last');
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok(exists (select 1 from public.available_missions() m where m.order_id = (select id from o where key = 'last')),
          '45 minutes avant l''heure : mission proposée');
reset role;

-- Commandes groupées (Pro)
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ update public.merchants set group_orders_enabled = true where id = '30000000-0000-0000-0000-000000000001' $$,
                 'P0001', 'feature_requires_pro', 'Start : activer les commandes groupées est refusé');
reset role;
update public.subscriptions set plan = 'pro' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is(pg_temp.try_order(pg_temp.slot(12, 30), '{"company_name":"Acme","headcount":12}'), 'group_orders_unavailable',
          'option désactivée : commande groupée refusée');
update public.happy_hours set is_active = false;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok($$ update public.merchants set group_orders_enabled = true, group_min_total_cents = 5000, group_min_headcount = 6
                   where id = '30000000-0000-0000-0000-000000000001' $$, 'Pro : active les commandes groupées');
reset role;
select is(pg_temp.try_order(pg_temp.slot(12, 30), '{"company_name":"Acme","headcount":3}'), 'invalid_group_order',
          'effectif sous le minimum : refusée');
select is(pg_temp.try_order(now() + interval '5 hours', '{"company_name":"Acme","headcount":12}'), 'group_lead_time',
          'créneau trop proche : refusée');
select is(pg_temp.try_order(pg_temp.slot(12, 30), '{"company_name":"Acme","headcount":12}'), 'group_minimum_not_reached',
          'montant minimal non atteint : refusée');
select is(pg_temp.try_order(pg_temp.slot(12, 30), '{"company_name":"Acme","headcount":12}',
          null, jsonb_build_array(jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 12,
            'option_ids', (select jsonb_agg(o.id) from public.menu_options o where o.group_id = '60000000-0000-0000-0000-000000000003' and o.name = 'Blanche')))),
          'ok', 'commande groupée conforme : acceptée');
select is((select company_name || ':' || headcount from public.orders where id = (select id from o where key = 'last')), 'Acme:12',
          'entreprise et effectif enregistrés');
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is(pg_temp.try_order(pg_temp.slot(12, 30), '{"company_name":"Acme","headcount":12}'), 'group_orders_unavailable',
          'retour à Start : commande groupée refusée');
select is(pg_temp.try_order(pg_temp.slot(12, 30)), 'ok', 'retour à Start : la précommande simple reste possible');

select * from finish();
rollback;
