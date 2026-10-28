begin;
select plan(13);

-- Publication réservée aux professionnels affiliés (abonnement ZeeRoo en cours + encaissement
-- configuré), imposée par la base : un appel direct à l'API ne contourne pas la règle.
-- Aucun compte Stripe Connect n'est exigé : l'abonnement ZeeRoo suffit.
insert into auth.users (id, email) values
  ('f3000000-0000-0000-0000-000000000001', 'brouillon@test.fr'),
  ('f3000000-0000-0000-0000-000000000002', 'especes@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, payment_link)
values
  ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'garde-lien', 'Garde Lien',
   'restaurant', '1 rue Garde', '75002', 'Paris', 48.8650, 2.3450, 'https://pay.exemple.test/g'),
  ('f4000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002', 'garde-especes', 'Garde Espèces',
   'restaurant', '2 rue Garde', '75002', 'Paris', 48.8651, 2.3451, null);
update public.merchants set accepts_cash_pickup = true where id = 'f4000000-0000-0000-0000-000000000002';

-- Appels « API » : rôle authenticated, utilisateur propriétaire.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

-- 1. Sans abonnement : publication refusée par la base, la fiche reste un brouillon privé.
select throws_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000001'$$,
  '42501', 'merchant_not_affiliated', 'sans abonnement : publication refusée');
select is((select is_published from public.merchants where id = 'f4000000-0000-0000-0000-000000000001'), false,
  'sans abonnement : la fiche reste en brouillon');

-- 2. Abonnement incomplet (paiement ZeeRoo non abouti) : toujours refusé.
reset role;
insert into public.subscriptions (merchant_id, stripe_customer_id, status, plan)
values ('f4000000-0000-0000-0000-000000000001', 'cus_garde', 'incomplete', 'start');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000001'$$,
  '42501', 'merchant_not_affiliated', 'abonnement incomplet : publication refusée');

-- 3. Abonnement actif mais encaissement non configuré : refusé.
reset role;
update public.subscriptions set status = 'active' where merchant_id = 'f4000000-0000-0000-0000-000000000001';
update public.merchants set payment_link = null where id = 'f4000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000001'$$,
  '42501', 'merchant_not_affiliated', 'abonnement actif sans encaissement : publication refusée');

-- 4. Abonnement actif + lien de paiement : publication acceptée (sans Stripe Connect).
select lives_ok(
  $$update public.merchants set payment_link = 'https://pay.exemple.test/g' where id = 'f4000000-0000-0000-0000-000000000001'$$,
  'le professionnel configure son lien de paiement');
select lives_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000001'$$,
  'abonnement actif + encaissement : publication acceptée');
select is((select is_published from public.merchants where id = 'f4000000-0000-0000-0000-000000000001'), true,
  'la fiche est publiée');

-- 5. Retirer l'encaissement d'une fiche publiée la dépublie, sans la supprimer.
select lives_ok(
  $$update public.merchants set payment_link = null where id = 'f4000000-0000-0000-0000-000000000001'$$,
  'le professionnel retire son lien de paiement');
select is((select is_published from public.merchants where id = 'f4000000-0000-0000-0000-000000000001'), false,
  'sans encaissement, la fiche est dépubliée');

-- 6. Espèces au comptoir comptent comme encaissement (essai gratuit accepté).
reset role;
insert into public.subscriptions (merchant_id, stripe_customer_id, status, plan)
values ('f4000000-0000-0000-0000-000000000002', 'cus_especes', 'trialing', 'start');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000002'$$,
  'essai + espèces au comptoir : publication acceptée');

-- 7. Fin d'abonnement (mise à jour du webhook) : la fiche est dépubliée mais conservée.
reset role;
update public.subscriptions set status = 'canceled' where merchant_id = 'f4000000-0000-0000-0000-000000000002';
select is((select is_published from public.merchants where id = 'f4000000-0000-0000-0000-000000000002'), false,
  'abonnement résilié : la fiche quitte l’annuaire');
select is((select name from public.merchants where id = 'f4000000-0000-0000-0000-000000000002'), 'Garde Espèces',
  'abonnement résilié : la fiche et ses données sont conservées');

-- 8. Réactivation : le professionnel peut republier sans rien perdre.
update public.subscriptions set status = 'active' where merchant_id = 'f4000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$update public.merchants set is_published = true where id = 'f4000000-0000-0000-0000-000000000002'$$,
  'abonnement réactivé : le professionnel republie sa fiche');

select * from finish();
rollback;
