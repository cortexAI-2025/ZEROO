begin;
select plan(9);

-- Contexte (seed) : Samir (10…01) possède « Chez Samir » (30…01) ; Nadia (20…01) cliente ;
-- Karim (utilisateur 70…01, livreur 80…01).
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('photos', 'merchants/30000000-0000-0000-0000-000000000001/cover.jpg') $$,
  'le restaurant envoie une photo dans son dossier');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('photos', 'merchants/30000000-0000-0000-0000-000000000099/cover.jpg') $$,
  '42501', null, 'pas dans le dossier d''un autre restaurant');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('photos', 'couriers/80000000-0000-0000-0000-000000000001/a.jpg') $$,
  '42501', null, 'pas dans le dossier d''un livreur');
select lives_ok($$ update public.merchants set photo_url = 'https://exemple.test/cover.jpg'
                   where id = '30000000-0000-0000-0000-000000000001' $$, 'photo du restaurant enregistrée');
reset role;

set local role authenticated;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('photos', 'couriers/80000000-0000-0000-0000-000000000001/avatar.jpg') $$,
  'le livreur envoie sa photo');
select lives_ok($$ update public.couriers set photo_url = 'https://exemple.test/karim.jpg'
                   where id = '80000000-0000-0000-0000-000000000001' $$, 'photo du livreur enregistrée');
reset role;

-- Une livraison en cours pour Nadia, avec Karim.
delete from public.orders;
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents,
                           fulfillment, delivery_fee_cents, delivery_city, delivery_postal_code,
                           courier_id, courier_name)
values ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001', 'Nadia', 'out_for_delivery', 850, 850,
        'delivery', 350, 'Paris', '75002', '80000000-0000-0000-0000-000000000001', 'Karim');

set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('photos', 'merchants/30000000-0000-0000-0000-000000000001/x.jpg') $$,
  '42501', null, 'un client n''envoie pas de photo');
select results_eq($$ select display_name, photo_url from public.order_courier_profile('b0000000-0000-0000-0000-000000000001') $$,
  $$ values ('Karim'::text, 'https://exemple.test/karim.jpg'::text) $$, 'le client voit son livreur');
reset role;

set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.order_courier_profile('b0000000-0000-0000-0000-000000000001')), 0,
  'un autre compte ne voit pas le livreur');
reset role;

select * from finish();
rollback;
