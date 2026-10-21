begin;
select plan(40);

-- Contexte (seed) : « Chez Samir » livre à 3 km ; Karim est livreur rattaché, actif, en ligne.
-- On ajoute une dark kitchen (livraison seule, formule Pro) à laquelle Karim est aussi rattaché.
delete from public.orders;
delete from public.couriers where id <> '80000000-0000-0000-0000-000000000001';
update public.couriers set last_assigned_at = null;
delete from public.merchant_opening_hours;
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '00:00', '23:59' from generate_series(1, 7) d;

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
values ('d0000000-0000-0000-0000-000000000001', 'cus_fantome', 'sub_fantome', 'active', 'pro');
update public.merchants set delivery_enabled = true where id = 'd0000000-0000-0000-0000-000000000001';
-- Groupage : la dark kitchen doit être proche de Chez Samir pour que Karim cumule les deux courses.
update public.merchant_locations d set latitude = s.latitude, longitude = s.longitude
from public.merchant_locations s
where d.merchant_id = 'd0000000-0000-0000-0000-000000000001' and s.merchant_id = '30000000-0000-0000-0000-000000000001';
update public.merchants set offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001';
insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('d0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now());

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
create function pg_temp.bowl() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('item_id', 'd2000000-0000-0000-0000-000000000001', 'quantity', 1))
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

select pg_temp.accepted_delivery(k, '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', pg_temp.kebab())
from unnest(array['a', 'b', 'd', 'u', 'v', 'w']) k;
select pg_temp.accepted_delivery('x', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', pg_temp.bowl());

-- -----------------------------------------------------------------------------
-- Fenêtre de disponibilité
-- -----------------------------------------------------------------------------
update public.couriers set is_available = false where id = '80000000-0000-0000-0000-000000000001';
select is((select available_until from public.couriers where id = '80000000-0000-0000-0000-000000000001'),
          null, 'indisponible : plus de fenêtre');
update public.couriers set is_available = true where id = '80000000-0000-0000-0000-000000000001';
select ok((select available_until = now() + interval '15 minutes' from public.couriers
           where id = '80000000-0000-0000-0000-000000000001'),
          'se mettre disponible ouvre une fenêtre de 15 minutes');
select ok((select c.is_online from public.couriers c where c.id = '80000000-0000-0000-0000-000000000001'),
          'le livreur est en ligne');
select ok((select m.delivery_available_now from public.merchants m where m.slug = 'chez-samir'),
          'Chez Samir : livraison disponible maintenant');
select ok((select m.delivery_available_now from public.merchants m where m.slug = 'cuisine-fantome'),
          'la dark kitchen aussi (Karim y est rattaché)');

-- -----------------------------------------------------------------------------
-- Disponibilité périmée (livreur déconnecté, app fermée)
-- -----------------------------------------------------------------------------
update public.couriers set available_until = now() - interval '1 minute' where id = '80000000-0000-0000-0000-000000000001';
select ok(not (select c.is_online from public.couriers c where c.id = '80000000-0000-0000-0000-000000000001'),
          'fenêtre expirée : le livreur n''est plus en ligne, bien que son indicateur soit resté vrai');
select is((select count(*)::int from public.available_couriers('30000000-0000-0000-0000-000000000001')), 0,
          'aucun livreur proposable');
select is((select reason from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
          'no_courier_available', 'devis : aucun livreur disponible');
select ok(not (select m.delivery_available_now from public.merchants m where m.slug = 'chez-samir'),
          'la livraison n''est plus affichée comme disponible');
select throws_ok($$ select public.create_order('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                                              pg_temp.kebab(), null, pg_temp.addr()) $$,
                 'no_courier_available', 'le serveur refuse une livraison sans livreur en ligne');

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.available_missions()), 0, 'un livreur hors ligne ne voit aucune mission');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'a')) $$,
                 'courier_unavailable', 'et ne peut pas en prendre une (contrôle à l''attribution)');
select is(public.courier_heartbeat(), null, 'le signal de présence ne ressuscite pas une fenêtre expirée');
reset role;
select ok(not (select c.is_online from public.couriers c where c.id = '80000000-0000-0000-0000-000000000001'),
          'toujours hors ligne après le signal');

-- Le livreur se remet disponible (bascule explicite) : à nouveau en ligne.
select lives_ok($$ update public.couriers set is_available = true where id = '80000000-0000-0000-0000-000000000001' $$,
                'le livreur se remet disponible');
select ok((select c.is_online from public.couriers c where c.id = '80000000-0000-0000-0000-000000000001'),
          'de nouveau en ligne');

-- -----------------------------------------------------------------------------
-- Signal de présence
-- -----------------------------------------------------------------------------
update public.couriers set available_until = now() + interval '1 minute' where id = '80000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select ok(public.courier_heartbeat() = now() + interval '15 minutes', 'le signal prolonge la fenêtre de 15 minutes');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is(public.courier_heartbeat(), null, 'un compte sans profil livreur n''est pas concerné');
reset role;
set local role anon;
select throws_ok($$ select public.courier_heartbeat() $$, '42501', null, 'signal réservé aux comptes connectés');
reset role;
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select throws_ok($$ update public.couriers set available_until = now() + interval '1 year' $$,
                 '42501', null, 'le livreur ne peut pas écrire sa propre fenêtre de disponibilité');
reset role;

-- -----------------------------------------------------------------------------
-- Capacité d'un livreur rattaché à plusieurs établissements
-- -----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.available_missions()), 7, 'Karim voit les missions des deux établissements');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'b')) $$, 'première course (Chez Samir)');
select lives_ok($$ select public.courier_accept_mission((select id from o where key = 'x')) $$, 'deuxième course (dark kitchen)');
select throws_ok($$ select public.courier_accept_mission((select id from o where key = 'd')) $$,
                 'courier_at_capacity', 'pas de troisième : la capacité est comptée tous établissements confondus');
select is((select count(*)::int from public.available_missions()), 0, 'plus aucune mission proposée');
reset role;
select is((select reason from public.merchant_delivery_quote('30000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
          'no_courier_available', 'devis Chez Samir : plus de capacité');
select is((select reason from public.merchant_delivery_quote('d0000000-0000-0000-0000-000000000001', 48.8700, 2.3400)),
          'no_courier_available', 'devis dark kitchen : idem');
select ok(not (select m.delivery_available_now from public.merchants m where m.slug = 'cuisine-fantome'),
          'la livraison n''est plus affichée comme disponible');

-- -----------------------------------------------------------------------------
-- Missions que personne ne prend
-- -----------------------------------------------------------------------------
select is((select count(*)::int from public.flag_unclaimed_missions()), 0, 'avant le délai : rien n''est signalé');
update public.orders set accepted_at = now() - interval '16 minutes'
where id in (select id from o where key in ('u', 'w'));
select is((select count(*)::int from public.flag_unclaimed_missions()), 2, 'après 15 minutes : les deux missions sont signalées');
select is((select count(*)::int from public.flag_unclaimed_missions()), 0, 'un signalement n''est pas répété');
select ok((select delivery_unclaimed_at is not null from public.orders where id = (select id from o where key = 'u')),
          'la commande porte l''heure du signalement');
select ok((select delivery_unclaimed_at is null from public.orders where id = (select id from o where key = 'b')),
          'une mission prise n''est jamais signalée');
select is((select count(*)::int from cron.job where jobname = 'flag-unclaimed-missions'), 1,
          'tâche planifiée chaque minute');

set local role authenticated;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.cancel_unclaimed_delivery((select id from o where key = 'u')) $$,
                 'order_not_found', 'un tiers ne peut pas annuler la commande');
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.cancel_unclaimed_delivery((select id from o where key = 'v')) $$,
                 'mission_not_cancellable', 'pas d''annulation tant que le délai n''est pas écoulé');
select throws_ok($$ select public.cancel_unclaimed_delivery((select id from o where key = 'b')) $$,
                 'mission_not_cancellable', 'ni quand un livreur a pris la course');
select is((select status::text || '|' || cancelled_by || '|' || refusal_reason
           from public.cancel_unclaimed_delivery((select id from o where key = 'u'))),
          'cancelled|customer|no_courier', 'le client annule une livraison que personne ne prend');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select cancelled_by from public.cancel_unclaimed_delivery((select id from o where key = 'w'))),
          'merchant', 'le restaurant peut aussi l''annuler');
reset role;
set local role anon;
select throws_ok($$ select public.cancel_unclaimed_delivery((select id from o where key = 'v')) $$,
                 '42501', null, 'réservé aux comptes connectés');
reset role;

select * from finish();
rollback;
