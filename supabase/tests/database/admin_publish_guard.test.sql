begin;
select plan(8);

-- La publication d'un commerce reste réservée aux affiliés, y compris via le dashboard administrateur
-- (admin_console, SECURITY DEFINER) ; le serveur et l'administration directe de la base gardent la main.
insert into auth.users(id, email, email_confirmed_at) values
 ('e5000000-0000-0000-0000-000000000001', 'pg-admin@example.test', now()),
 ('e5000000-0000-0000-0000-000000000002', 'pg-affilie@example.test', now()),
 ('e5000000-0000-0000-0000-000000000003', 'pg-brouillon@example.test', now());
insert into public.platform_admins(user_id) values ('e5000000-0000-0000-0000-000000000001');
insert into public.merchants(id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, payment_link)
values
 ('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'pg-affilie', 'Affilié contrôle', 'restaurant', '1 rue test', '75002', 'Paris', 48.86, 2.34, 'https://pay.exemple.test/a'),
 ('e6000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000003', 'pg-brouillon', 'Brouillon contrôle', 'restaurant', '2 rue test', '75002', 'Paris', 48.86, 2.34, null);
insert into public.subscriptions(merchant_id, stripe_customer_id, status, plan)
values ('e6000000-0000-0000-0000-000000000001', 'cus_pg_affilie', 'active', 'start');

-- 1 à 3. Administrateur connecté : publier un commerce NON affilié est refusé.
set local request.jwt.claims = '{"sub":"e5000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.admin_console('publish', 'e6000000-0000-0000-0000-000000000002', '{"published":true,"reason":"Contrôle de la garde de publication"}'::jsonb, 0, gen_random_uuid())$$,
  '42501', 'merchant_not_affiliated', 'administrateur : publier un commerce non affilié est refusé');
reset role;
select is((select is_published from public.merchants where id = 'e6000000-0000-0000-0000-000000000002'), false,
  'le commerce non affilié reste en brouillon');

-- 4. Administrateur : publier un commerce AFFILIÉ reste possible.
set local role authenticated;
select lives_ok(
  $$select public.admin_console('publish', 'e6000000-0000-0000-0000-000000000001', '{"published":true,"reason":"Contrôle de la garde de publication"}'::jsonb, 0, gen_random_uuid())$$,
  'administrateur : publier un commerce affilié est accepté');
reset role;
select is((select is_published from public.merchants where id = 'e6000000-0000-0000-0000-000000000001'), true, 'le commerce affilié est publié');

-- 5. Administrateur : dépublier reste toujours possible.
set local role authenticated;
select lives_ok(
  $$select public.admin_console('publish', 'e6000000-0000-0000-0000-000000000001', '{"published":false,"reason":"Contrôle de la garde de publication"}'::jsonb, 0, gen_random_uuid())$$,
  'administrateur : dépublier est accepté');
reset role;

-- 6. Serveur (jeton service_role, ex. webhook Stripe) : hors garde, par conception.
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok($$update public.merchants set is_published = true where id = 'e6000000-0000-0000-0000-000000000002'$$,
  'serveur (service_role) : la garde ne s''applique pas');
update public.merchants set is_published = false where id = 'e6000000-0000-0000-0000-000000000002';

-- 7. Administration directe de la base (aucun jeton) : hors garde, par conception.
set local request.jwt.claims = '';
select lives_ok($$update public.merchants set is_published = true where id = 'e6000000-0000-0000-0000-000000000002'$$,
  'administration directe de la base (sans jeton) : la garde ne s''applique pas');

-- 8. Un client non administrateur reste refusé avant même la garde.
set local request.jwt.claims = '{"sub":"e5000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.admin_console('publish', 'e6000000-0000-0000-0000-000000000002', '{"published":true,"reason":"Tentative sans droit"}'::jsonb, 0, gen_random_uuid())$$,
  '42501', 'Accès réservé aux administrateurs', 'non-administrateur : refusé');
reset role;

select * from finish();
rollback;
