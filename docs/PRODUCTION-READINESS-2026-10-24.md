# Plan de correction production — 24 octobre 2026

## État et règles
Ce document est une checklist de validation, pas une attestation de mise en production. Ne pas activer les paiements réels avant validation des scénarios et ne jamais committer de secrets. Ne pas exécuter `supabase db reset` sur un environnement distant.

## P0 — CI
- [ ] Confirmer que le workflow `.github/workflows/ci.yml` se déclenche sur PR et sur `main` (quota GitHub Actions et permissions).
- [ ] Exécuter `npm ci && npm run check && npm run build:web` sur Node 22.
- [ ] Exécuter `npm run db:test` sur Supabase local (Docker requis).
- [ ] Vérifier les tests E2E séparément ; ne pas considérer `npm run e2e` comme preuve de réussite du nouveau modèle de paiement.
- [ ] Protéger `main` avec contrôles obligatoires avant fusion.

## P0 — Paiement et tests obsolètes
Le modèle actuel est : paiements de repas et courses directement aux professionnels, Stripe Billing uniquement pour les abonnements ZEEROO, sans Stripe Connect.
- [ ] Réécrire `e2e/payments.e2e.js` : il teste encore PaymentIntent, capture, Connect et `connect-onboarding`.
- [ ] Auditer `e2e/delivery.e2e.js` et `e2e/delivery-app.e2e.js` pour supprimer les attentes Connect.
- [ ] Tester commande acceptée → lien de paiement professionnel → déclaration client → confirmation professionnelle ; refuser la fausse confirmation par un tiers.
- [ ] Tester espèces au retrait / à la remise selon les règles métier, sans déclarer un paiement automatiquement.
- [ ] Tester les abonnements : essai 30 jours, changement de formule, webhook signé et idempotent, impayé, résiliation, droits RLS.
- [ ] Vérifier que les montants des commandes ne transitent jamais par le compte Stripe ZEEROO.

## P0 — Supabase
- [ ] Comparer les migrations présentes dans Git avec `supabase_migrations.schema_migrations` du projet hébergé ; appliquer uniquement les migrations manquantes, dans l'ordre, avec sauvegarde.
- [ ] Contrôler les fonctions Edge déployées et leurs versions, notamment `billing` et `stripe-webhook`.
- [ ] Vérifier RLS par rôle client/commerçant/livreur et les politiques d'accès aux commandes.
- [ ] Contrôler les secrets côté serveur sans les afficher : Stripe, CRON, URL application.
- [ ] Tester les cron jobs, Vault, webhook Stripe et traitement des doublons.

## P1 — Authentification et domaine
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
