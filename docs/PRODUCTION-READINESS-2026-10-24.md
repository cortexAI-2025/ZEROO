# Plan de correction production — 24 octobre 2026

## État et règles
Ce document est une checklist de validation, pas une attestation de mise en production. Ne pas activer les paiements réels avant validation des scénarios et ne jamais committer de secrets. Ne pas exécuter `supabase db reset` sur un environnement distant.

## P0 — CI
- [ ] Confirmer que le workflow `.github/workflows/ci.yml` se déclenche sur PR et sur `main` (quota GitHub Actions et permissions).
- [ ] Exécuter `npm ci && npm run check && npm run build:web` sur Node 22.
- [x] Tests de base de données dans la CI : job `database` (`scripts/localdb/setup-ci.sh` puis `scripts/localdb/run.sh`, 26 fichiers pgTAP). À confirmer sur un premier run GitHub Actions réel.
- [x] E2E : `npm run e2e:mock` (sans Supabase) tourne en CI (job `web-smoke`). `npm run e2e` ne cible plus que landing/auth/merchant ; les anciens tests Stripe Connect sont isolés dans `e2e/legacy-connect/` et ne prouvent rien sur le modèle actuel.
- [ ] Protéger `main` avec contrôles obligatoires avant fusion.

## P0 — Paiement et tests obsolètes
Le modèle actuel est : paiements de repas et courses directement aux professionnels, Stripe Billing uniquement pour les abonnements ZEEROO, sans Stripe Connect.
- [x] (Isolé dans `e2e/legacy-connect/`, couvert par `supabase/tests/database/payments_direct.test.sql`) Réécrire `e2e/payments.e2e.js` : il teste encore PaymentIntent, capture, Connect et `connect-onboarding`.
- [x] (Isolés dans `e2e/legacy-connect/`) Auditer `e2e/delivery.e2e.js` et `e2e/delivery-app.e2e.js` pour supprimer les attentes Connect.
- [x] Commande acceptée → déclaration client → confirmation professionnelle ; fausse confirmation par un tiers refusée (pgTAP `payments_direct`).
- [x] Espèces au retrait / à la remise sans déclaration automatique (pgTAP `payments_direct`).
- [ ] Tester les abonnements : essai 30 jours, changement de formule, webhook signé et idempotent, impayé, résiliation, droits RLS.
- [ ] Vérifier que les montants des commandes ne transitent jamais par le compte Stripe ZEEROO.

## P0 — Supabase
- [ ] Comparer les migrations présentes dans Git avec `supabase_migrations.schema_migrations` du projet hébergé ; appliquer uniquement les migrations manquantes, dans l'ordre, avec sauvegarde.
- [ ] Contrôler les fonctions Edge déployées et leurs versions, notamment `billing` et `stripe-webhook`.
- [ ] Vérifier RLS par rôle client/commerçant/livreur et les politiques d'accès aux commandes.
- [ ] Contrôler les secrets côté serveur sans les afficher : Stripe, CRON, URL application.
- [ ] Tester les cron jobs, Vault, webhook Stripe et traitement des doublons.

## P1 — Authentification et domaine
- [ ] Protection contre les mots de passe compromis (Supabase → Authentication → Sign In / Providers → Email → « Prevent use of leaked passwords ») : **indisponible sur l'offre gratuite** (« Only available on Pro plan and above », constaté le 24 octobre 2026). Avis de sécurité `auth_leaked_password_protection` **accepté jusqu'au passage du projet Supabase en Pro**, à faire avant le lancement public. En attendant : longueur minimale portée à 8 et exigences de complexité activées dans le même écran (à confirmer par le propriétaire).
- [ ] Tester Google OAuth web et mobile : provider Supabase, client IDs, redirect URLs et callback `https://app.zeeroo.fr/auth-callback`.
- [ ] Tester confirmation e-mail, mot de passe oublié et templates.
- [ ] Vérifier le fournisseur SMS et les journaux d'envoi avant d'activer le téléphone comme méthode obligatoire.
- [ ] Vérifier `zeeroo.fr`, `app.zeeroo.fr`, liens QR, URL canonique, redirections et configuration Vercel.

## P1 — Recette commerciale
- [ ] Trois comptes de test distincts : client, commerçant, livreur.
- [ ] Click & Collect complet : menu, panier, commande, acceptation, préparation, code de retrait.
- [ ] Livraison uniquement avec livreur rattaché au commerce, disponibilité, remise, confirmation de paiement.
- [ ] Précommandes et Happy Hours : fuseaux horaires, changement d'heure, quotas et concurrence.
- [ ] Essai Start/Pro, droits par formule, commandes groupées et campagnes avec validation humaine.

## Critère de sortie
Publication seulement après CI verte, migrations et fonctions vérifiées, scénarios E2E adaptés au modèle actuel, authentification validée et recette sur l'environnement hébergé. Conserver les preuves (SHA, workflow run, versions de fonctions, date des tests) dans le rapport de recette.

## Décisions du propriétaire
- Données d'identité des commerçants (SIRET, TVA, e-mail de contact, raison sociale, téléphone, lien de paiement, `owner_id`) : **laissées publiques en l'état** (décision du 24 octobre 2026). L'adresse des dark kitchens reste privée (`merchant_locations`).
