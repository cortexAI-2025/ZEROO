begin;
select plan(9);

-- Deux utilisateurs créés comme le ferait Supabase Auth.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.fr', '{"full_name": "Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.fr', '{}');

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice',
  'le profil est créé à l''inscription avec le nom fourni'
);

select is(
  (select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'le profil est créé même sans métadonnées'
);

-- Anonyme : aucun accès.
set local role anon;
select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'un visiteur anonyme ne peut pas lire les profils'
);
reset role;

-- Alice connectée.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

select results_eq(
  'select id from public.profiles',
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'Alice ne voit que son propre profil'
);

update public.profiles set display_name = 'Alice M.' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice M.',
  'Alice peut modifier son profil'
);

update public.profiles set display_name = 'Piraté' where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'Alice ne peut pas modifier le profil de Bob'
);

set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select throws_ok(
  $$insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  null,
  'un utilisateur ne peut pas créer de profil à la main'
);

-- Suppression de compte.
select lives_ok('select public.delete_my_account()', 'Alice peut supprimer son compte');
reset role;

select is(
  (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111')
    + (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'le compte et le profil d''Alice sont supprimés'
);

select * from finish();
rollback;
