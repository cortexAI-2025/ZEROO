begin;
select plan(15);

delete from public.orders;
delete from public.push_tokens;
delete from vault.secrets where name in ('functions_url', 'cron_secret');
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000088', 'autre@test.fr');

-- -----------------------------------------------------------------------------
-- Appareils
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select throws_ok(
  $$select public.register_push_token('ExponentPushToken[abc]', 'ios')$$,
  '42501', null,
  'un visiteur ne peut pas enregistrer d''appareil'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok($$select public.register_push_token('ExponentPushToken[abc]', 'ios')$$, 'Nadia enregistre son téléphone');
select lives_ok($$select public.register_push_token('ExponentPushToken[abc]', 'ios')$$, 'ré-enregistrer le même appareil est sans effet');
select is((select count(*)::int from public.push_tokens), 1, 'Nadia voit son appareil');
select throws_ok(
  $$select public.register_push_token('pas-un-jeton', 'ios')$$,
  '23514', null,
  'un jeton mal formé est refusé'
);
select throws_ok(
  $$insert into public.push_tokens (user_id, expo_token, platform) values ('20000000-0000-0000-0000-000000000088', 'ExponentPushToken[x]', 'ios')$$,
  '42501', null,
  'impossible d''enregistrer un appareil au nom de quelqu''un d''autre'
);

set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000088", "role": "authenticated"}';
select is((select count(*)::int from public.push_tokens), 0, 'un autre utilisateur ne voit pas l''appareil de Nadia');
select public.register_push_token('ExponentPushToken[abc]', 'android');
reset role;
select is(
  (select user_id::text || '|' || platform from public.push_tokens where expo_token = 'ExponentPushToken[abc]'),
  '20000000-0000-0000-0000-000000000088|android',
  'un téléphone qui change de compte est réattribué'
);

-- -----------------------------------------------------------------------------
-- « Je pars maintenant »
-- -----------------------------------------------------------------------------
insert into public.orders (id, merchant_id, customer_id, status, subtotal_cents, total_cents, placed_at, accepted_at)
values ('ffffffff-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'accepted', 1000, 1000, now(), now());

select ok(
  (select customer_eta_at between now() + interval '539 seconds' and now() + interval '541 seconds' and customer_travel_mode = 'walk'
   from public.set_customer_departure('ffffffff-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 540, 'walk')),
  'heure d''arrivée enregistrée (départ + 9 min), sans coordonnées'
);
select throws_ok(
  $$select public.set_customer_departure('ffffffff-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000088', 60, 'drive')$$,
  'P0002', 'order_not_found',
  'seul le client de la commande peut annoncer son départ'
);
set local role authenticated;
set local request.jwt.claims = '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select throws_ok(
  $$select public.set_customer_departure('ffffffff-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 60, 'drive')$$,
  '42501', null,
  'réservé au serveur (calcul du trajet dans l''Edge Function)'
);
reset role;
select * from public.set_customer_departure('ffffffff-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 0, 'drive') limit 0;
update public.orders set status = 'collected' where id = 'ffffffff-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.set_customer_departure('ffffffff-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 60, 'drive')$$,
  'P0002', 'order_not_found',
  'plus de départ à annoncer une fois la commande récupérée'
);

-- -----------------------------------------------------------------------------
-- Déclencheur des notifications (pg_net)
-- -----------------------------------------------------------------------------
create temporary table queue_before as select count(*) as n from net.http_request_queue;

update public.orders set status = 'ready' where id = 'ffffffff-0000-0000-0000-000000000001';
select is(
  (select count(*) from net.http_request_queue) - (select n from queue_before),
  0::bigint,
  'sans secrets Vault, aucun appel n''est émis'
);

select vault.create_secret('http://fonctions.test/functions/v1', 'functions_url');
select vault.create_secret('secret-test', 'cron_secret');

update public.orders set status = 'accepted' where id = 'ffffffff-0000-0000-0000-000000000001';
select is(
  (select url || '|' || (convert_from(body, 'utf8')::jsonb ->> 'status') from net.http_request_queue order by id desc limit 1),
  'http://fonctions.test/functions/v1/notify-order-update|accepted',
  'changement de statut → appel de notify-order-update avec le nouveau statut'
);

create temporary table queue_mid as select count(*) as n from net.http_request_queue;
update public.orders set status = 'preparing' where id = 'ffffffff-0000-0000-0000-000000000001';
update public.orders set customer_note = 'sans effet' where id = 'ffffffff-0000-0000-0000-000000000001';
select is(
  (select count(*) from net.http_request_queue) - (select n from queue_mid),
  0::bigint,
  'pas de notification pour « en préparation » ni pour une modification sans changement de statut'
);

select * from finish();
rollback;
