# Scripts de production (exécutés à la main par le propriétaire)

## private_prospects_production.sql
Migration `20261029110000_private_prospects` : annuaire public = affiliés ; fiches Sirene = base privée.
Éditeur SQL Supabase, projet `rgxesocsvhgsqoehxhgt`, en une seule exécution (transaction).

Préconditions vérifiées en lecture seule sur la production (29/10/2026) :
- aucune fonction, vue ni autre code ne dépend des 3 fonctions supprimées (le dashboard admin passe par `admin_directory_claims`, qui reste) ;
- 2 390 fiches, 0 demande de revendication ; migration non enregistrée ;
- politiques existantes : `listed directory references`, `claimant reads own claims`, `admins read claims` (la dernière reste, inoffensive sans droit de table).

Avant : sauvegarde (Database > Backups) ; retour arrière : `private_prospects_ROLLBACK.sql` (réexpose le SIRET : décision explicite seulement).
Après : contrôles anonymes réels (docs/RECETTE-ADMIN.md §8), puis fusion de la PR du site.

## merchants_private_production.sql
Migration `20261029120000_merchants_private_details` : SIRET, TVA, raison sociale, e-mail, téléphone et lien de paiement des commerces passent dans `merchant_private` (fermée à l'API). Données recopiées avant d'être vidées ; aucune suppression.
- État de production relevé en lecture seule (29/10/2026) : 1 commerce, 0 publié ; `anon` et `authenticated` ont aujourd'hui SELECT sur les six colonnes.
- **Ordre** : l'ancienne version de l'application lit les colonnes brutes (qui deviennent `null`) et la nouvelle lit les colonnes calculées (absentes avant la migration). Appliquer la migration, puis déployer l'application aussitôt (fusion de la PR). Avec 0 commerce publié, l'impact visible est nul ; il faut le refaire dans cet ordre dès qu'un commerce est publié.
- Sauvegarde avant ; retour arrière : `merchants_private_ROLLBACK.sql` (réexpose les données).

## http_checks.sh — preuves HTTP réelles (avant / après)
`SUPABASE_URL=… ANON_KEY=… [USER_JWT=…] ./http_checks.sh avant > preuves/avant.txt`, puis `… apres > preuves/apres.txt`. Lecture seule. Vérifie : `directory_businesses`, `directory_claims`, `merchant_private` refusés ; anciennes fonctions introuvables (404) ; aucun SIRET/TVA/e-mail/téléphone privé/lien de paiement dans `merchants` ni `public_merchants` ; aucune suite de 14 chiffres. Avant la migration `20261029120000`, les contrôles sur `merchants` et `merchant_private` échouent : c'est l'état « avant » à archiver.

## Compatibilité pendant le déploiement (merchants)
Les colonnes vidées de `merchants` (legal_name, siret, vat_number, contact_email, phone, payment_link) sont lues par :
- **fonctions SQL** : toutes les fonctions `SECURITY DEFINER` qui les lisaient sont migrées dans le même script (`is_payments_ready`, fiche abonné admin, revue de revendication) ; inventaire par recherche du texte de toutes les fonctions `public`/`admin_private`, plus les tâches `pg_cron` (une seule : expiration des paniers, sans rapport) ; les écritures (création, console admin, application) passent par les déclencheurs ;
- **Edge Functions** : seul `create-order` lisait `payment_link` (migré vers `merchant_private`, version tolérante à déployer **avant** la migration) ; les autres ne lisent aucune de ces colonnes ;
- **ancienne version de l'application** (onglet ouvert, cache) : lit `null` pour le téléphone et le lien de paiement tant qu'elle n'est pas rechargée ; le paiement par carte y apparaît indisponible. Impact nul avec 0 commerce publié ; sinon prévoir une courte fenêtre.
- **Ordre** : sauvegarde → `http_checks.sh avant` → déploiement de `create-order` → script SQL → fusion de la PR applicative → `http_checks.sh apres`. Feuille à cocher complète : `CHECKLIST-JOUR-J-SUPABASE.md`.

## Plan de bascule et retour arrière sûr (merchants)
- `PLAN-BASCULE-MERCHANTS.md` : plan complet (véhicule de déploiement, GO, préparation, jour J, critères d'arrêt, retour arrière, Stripe test).
- `merchants_private_ROLLBACK_SAFE.sql` : retour arrière qui **dépublie d'abord** (aucune donnée restaurée visible des visiteurs) ; `merchants_private_ROLLBACK_REPUBLISH.sql` : republication explicite (réexpose les données, garde-fou `set zeeroo.accept_exposure = 'oui'`). Test : `docs/recette/safe_rollback_check.sh`.
- `merchants_private_ROLLBACK.sql` (brut) : réexpose immédiatement ; à éviter si un commerce est publié.

## Retour arrière à exposition réduite (merchants) — variante validée, scénario distinct
- `merchants_private_ROLLBACK_REDUCED.sql` : conserve `merchant_private` fermée, restaure **uniquement** téléphone et lien de paiement dans `merchants`, dépublie d'abord.
- `merchants_private_REAPPLY_AFTER_REDUCED.sql` : retour au modèle fermé malgré `merchant_private` (aucune suppression ni écrasement) ; `merchants_private_REAPPLY_REPUBLISH.sql` : republication sans exposition.
- Recette : `scripts/localdb/recette_reduced.sh` (7 profils, commandes, ancienne application dans un navigateur, 2 cycles).
- Test Stripe RÉEL en mode test : `scripts/localdb/recette_stripe_cli.sh` (à lancer par le propriétaire ; non exécuté par l'assistant).

## Garde anti-rejeu des retours arrière
Les scripts `merchants_private_ROLLBACK*.sql` (brut, sûr, réduit) et `private_prospects_ROLLBACK.sql` **refusent de s'exécuter** sans confirmation typée
dans la même exécution (`set zeeroo.confirm_rollback = '<nom>';`, valeur indiquée dans l'en-tête de chaque garde). Voir `SYNC-GITHUB-59-60.md`
(analyse des PR #59 et #60, risques de rejeu, marche à suivre) et `docs/recette/rollback_guard_check.sh` (preuve).
