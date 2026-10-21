begin;
select plan(19);

-- Contexte (seed) : « Chez Samir » (retrait + livraison), Karim livreur rattaché.
-- On ajoute une dark kitchen (sans retrait) : son adresse précise ne doit jamais sortir de l'API.
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'dark@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'cuisine-fantome',
        'Cuisine Fantôme', 'dark_kitchen', '8 rue Cachée', '75003', 'Paris', 48.8600, 2.3600, true);
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('d0000000-0000-0000-0000-000000000001', 'cus_f', 'sub_f', 'active', 'pro');
update public.merchants set delivery_enabled = true, offers_pickup = false where id = 'd0000000-0000-0000-0000-000000000001';

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- Visiteur : la table des adresses est fermée, les colonnes héritées sont vides
set local role anon;
select throws_ok($$ select * from public.merchant_locations $$, '42501', null, 'visiteur : merchant_locations fermée');
select is((select count(*)::int from public.merchants where address_line is not null or latitude is not null or longitude is not null),
          0, 'visiteur : les colonnes de merchants ne contiennent plus d''adresse');
select is((select count(*)::int from public.merchants where slug = 'cuisine-fantome'), 1, 'la fiche publique reste lisible');
select is((select city from public.merchants where slug = 'cuisine-fantome'), 'Paris', 'la zone de service (ville) reste publique');
select throws_ok($$ select public.merchant_point('d0000000-0000-0000-0000-000000000001') $$, '42501', null,
                 'visiteur : pas d''accès aux fonctions internes');
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), null,
          'visiteur : adresse d''une dark kitchen = null');
select is((select merchant_latitude(m) from public.merchants m where slug = 'cuisine-fantome'), null,
          'visiteur : latitude d''une dark kitchen = null');
select is((select merchant_longitude(m) from public.merchants m where slug = 'cuisine-fantome'), null,
          'visiteur : longitude d''une dark kitchen = null');
select isnt((select merchant_address_line(m) from public.merchants m where slug = 'chez-samir'), null,
            'visiteur : adresse d''un établissement qui accueille = visible');
select is((select address_line from public.nearby_merchants(48.8600, 2.3600) where slug = 'cuisine-fantome'), null,
          'annuaire : pas d''adresse pour une dark kitchen');
select is((select latitude from public.nearby_merchants(48.8600, 2.3600) where slug = 'cuisine-fantome'), null,
          'annuaire : pas de position pour une dark kitchen');

-- Client connecté : même chose
reset role;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), null,
          'client : adresse d''une dark kitchen = null');
select throws_ok($$ select * from public.merchant_locations $$, '42501', null, 'client : merchant_locations fermée');

-- Propriétaire
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), '8 rue Cachée',
          'propriétaire : voit son adresse');

-- Livreur : seulement s'il est accepté par l'établissement
reset role;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), null,
          'livreur non rattaché : rien');
reset role;
insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('d0000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now())
on conflict do nothing;
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), '8 rue Cachée',
          'livreur accepté : voit l''adresse de retrait');

-- Le propriétaire peut modifier son adresse (écriture redirigée) ; elle reste invisible au public.
reset role;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set local role authenticated;
update public.merchants set address_line = '9 rue Neuve', latitude = 48.8610, longitude = 2.3610
where id = 'd0000000-0000-0000-0000-000000000001';
select is((select merchant_address_line(m) from public.merchants m where slug = 'cuisine-fantome'), '9 rue Neuve',
          'propriétaire : sa nouvelle adresse est enregistrée');
select is((select address_line from public.merchants where slug = 'cuisine-fantome'), null,
          'la colonne de merchants reste vide après écriture');
reset role;
select is((select latitude from public.merchant_locations where merchant_id = 'd0000000-0000-0000-0000-000000000001'),
          48.8610::double precision, 'la position est dans merchant_locations');

select * from finish();
rollback;
