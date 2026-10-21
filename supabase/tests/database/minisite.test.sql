begin;
select plan(17);

-- Contexte (seed) : « Chez Samir », formule Pro (essai en cours), propriétaire Samir.
-- Un second commerce, en formule Start, pour la comparaison.
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000001', 'start@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'snack-start', 'Snack Start',
        'snack', '3 rue du Four', '75005', 'Paris', 48.8450, 2.3500, true);
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('b1000000-0000-0000-0000-000000000001', 'cus_s', 'sub_s', 'active', 'start');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select ok((select m.has_minisite from public.merchants m where m.slug = 'chez-samir'), 'Pro : mini-site actif');
select ok(not (select m.has_minisite from public.merchants m where m.slug = 'snack-start'), 'Start : pas de mini-site personnalisé');

-- Pro : personnalisation par le propriétaire
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set tagline = 'Tacos et grillades maison', accent_color = 'orange',
                          about = 'Depuis 2014, Samir prépare ses recettes sur place.',
                          logo_url = 'https://exemple.test/logo.png' where slug = 'chez-samir' $$,
                'Pro : le propriétaire personnalise son mini-site');
select is((select tagline || '|' || accent_color from public.merchants where slug = 'chez-samir'),
          'Tacos et grillades maison|orange', 'réglages enregistrés');
select throws_ok($$ update public.merchants set accent_color = 'fuchsia' where slug = 'chez-samir' $$,
                 '23514', null, 'couleur hors palette refusée');
select throws_ok($$ update public.merchants set tagline = repeat('x', 101) where slug = 'chez-samir' $$,
                 '23514', null, 'accroche limitée à 100 caractères');
select throws_ok($$ update public.merchants set about = repeat('x', 1001) where slug = 'chez-samir' $$,
                 '23514', null, 'présentation limitée à 1000 caractères');
reset role;

-- Start : la personnalisation est réservée à Pro
set local role authenticated;
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select throws_ok($$ update public.merchants set tagline = 'Ma super accroche' where slug = 'snack-start' $$,
                 'minisite_requires_pro', 'Start : accroche refusée');
select throws_ok($$ update public.merchants set logo_url = 'https://exemple.test/logo.png' where slug = 'snack-start' $$,
                 'minisite_requires_pro', 'Start : logo refusé');
select lives_ok($$ update public.merchants set description = 'Fiche de commande Start', name = 'Snack Start' where slug = 'snack-start' $$,
                'Start : la fiche de commande reste modifiable (nom, description, photo, horaires…)');
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set tagline = 'Intrus' where slug = 'snack-start' $$,
                'la tentative d''un autre commerçant ne touche aucune ligne (RLS)');
reset role;
select is((select tagline from public.merchants where slug = 'snack-start'), null,
          'et le commerce d''un autre n''est pas modifié');

-- Expiration de Pro : rien n'est perdu, le lien ne change pas, la personnalisation s'arrête
update public.subscriptions set status = 'canceled' where merchant_id = '30000000-0000-0000-0000-000000000001';
select ok(not (select m.has_minisite from public.merchants m where m.slug = 'chez-samir'),
          'Pro expiré : mini-site personnalisé inactif');
select is((select tagline from public.merchants where slug = 'chez-samir'), 'Tacos et grillades maison',
          'les réglages sont conservés');
select is((select slug from public.merchants where id = '30000000-0000-0000-0000-000000000001'), 'chez-samir',
          'le lien public ne change pas');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set logo_url = null where slug = 'chez-samir' $$,
                'effacer un réglage reste possible sans Pro');
select throws_ok($$ update public.merchants set about = 'Nouvelle présentation' where slug = 'chez-samir' $$,
                 'minisite_requires_pro', 'mais pas en écrire un nouveau');
reset role;

select * from finish();
rollback;
