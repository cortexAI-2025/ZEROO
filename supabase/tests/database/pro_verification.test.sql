begin;
select plan(12);

-- Un nouveau compte (e-mail ou Google / Apple) qui veut devenir professionnel.
insert into auth.users (id, email) values ('bbbbbbbb-0000-0000-0000-000000000001', 'nouveau-pro@test.fr');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------------------
-- Sans vérification : ni commerce ni profil livreur
-- ---------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is(public.is_pro_verified(), false, 'compte non vérifié');
select throws_ok($$ select public.create_merchant('Nouveau Snack', 'snack', '1 rue A', '75001', 'Paris', 48.86, 2.34) $$,
  'P0001', 'pro_verification_required', 'pas de commerce sans vérification');
select throws_ok($$ select public.create_courier('Nouveau', '0611223344', 'auto_entrepreneur', '73282932000074', 'bike') $$,
  'P0001', 'pro_verification_required', 'pas de profil livreur sans vérification');
reset role;

-- E-mail confirmé, téléphone pas encore vérifié.
update auth.users set email_confirmed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is(public.is_pro_verified(), false, 'l''e-mail seul ne suffit pas');
reset role;

-- Numéro saisi mais code SMS pas encore validé.
update auth.users set phone = '33611223344' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select phone from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'), null,
  'un numéro non vérifié ne va pas dans le profil');

-- ---------------------------------------------------------------------------------------
-- Code SMS validé
-- ---------------------------------------------------------------------------------------
update auth.users set phone_confirmed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select phone from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'), '+33611223344',
  'le numéro vérifié devient le téléphone du profil');

set local role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is(public.is_pro_verified(), true, 'e-mail et téléphone vérifiés');
select lives_ok($$ select public.create_merchant('Nouveau Snack', 'snack', '1 rue A', '75001', 'Paris', 48.86, 2.34) $$,
  'le commerce peut être créé');
reset role;

-- Le profil suit un changement de numéro (nouvelle vérification).
update auth.users set phone = '33799887766', phone_confirmed_at = now() where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select is((select phone from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'), '+33799887766',
  'nouveau numéro vérifié repris dans le profil');

-- ---------------------------------------------------------------------------------------
-- Accès
-- ---------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.is_pro_verified() $$, '42501', null, 'fonction réservée aux comptes connectés');
reset role;

set local role authenticated;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select throws_ok($$ select public.require_verified_pro() $$, '42501', null, 'la garde ne s''appelle pas directement');
reset role;

-- Données sans utilisateur (démo, service) : pas de garde.
select lives_ok($$ insert into public.merchants (owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude)
                   values ('20000000-0000-0000-0000-000000000001', 'demo-service', 'Démo', 'snack', '1 rue B', '75001', 'Paris', 48.86, 2.34) $$,
  'écriture serveur sans contrôle');

select * from finish();
rollback;
