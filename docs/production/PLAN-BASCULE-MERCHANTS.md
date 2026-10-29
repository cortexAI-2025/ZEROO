# Plan de bascule production — données administratives des commerces (PR #60)

**Statut : plan préparé, AUCUNE exécution autorisée.** Chaque étape de production exige le « GO » explicite du propriétaire. Ce document n'est pas un avis juridique ni une autorisation.

## 0. Ce qui est déployé, et par quel véhicule
| Élément | Contenu | Véhicule |
| --- | --- | --- |
| Base de données | `docs/production/merchants_private_production.sql` (transaction unique, contrôles internes) | Éditeur SQL Supabase, par le propriétaire |
| Application web (app.zeeroo.fr) + Edge Function `create-order` | Partie applicative de la PR #60 | **Branche `ccr-cbee9612-jsmce8-merchants-app-on-main` → PR vers `main`** (uniquement les fichiers applicatifs, appliqués proprement sur `main` ; tsc, eslint, prettier, jest 214 OK). La PR #60 elle-même repose sur la chaîne #59 ← #51 et n'est **pas** le véhicule de déploiement. |
Ordre obligatoire : **base d'abord, application et `create-order` aussitôt après**. Fusionner la PR applicative avant la migration casserait l'application (colonnes calculées absentes).

## 1. Conditions du GO production (toutes requises)
- [ ] Relecture du SQL final : empreintes SHA-256 vérifiées sur le fichier téléchargé de GitHub (`merchants_private_production.sql` `ba8c9300…4502`, `merchants_private_ROLLBACK.sql` `401ae67d…b0db` ; migration `73c7aec1…4c3` ; **à recalculer si le fichier change**).
- [ ] Webhook Stripe : test réel en **mode test** réussi (voir §6), ou acceptation écrite de cette limite.
- [ ] Sauvegarde Supabase de moins de 24 h confirmée **et** procédure de restauration relue.
- [ ] `http_checks.sh avant` exécuté sur la production et archivé.
- [ ] Garde du jour J (§3, étape 1) : **aucun commerce publié, aucune commande en cours**. État relevé en lecture seule le 29/10/2026 : 1 commerce (avec données administratives réelles), **0 publié**, 0 abonnement actif, 0 commande. Si un commerce est publié d'ici là → **STOP** : une bascule « expand / contract » en deux migrations (double écriture, puis vidage) devient nécessaire ; ne pas improviser.
- [ ] Aucun restaurateur connecté pendant la fenêtre (un onglet ancien est géré par la convention `''`/`null`, mais on évite le risque).

## 2. Préparation (J-1)
1. Sauvegarde (Database > Backups) ; noter l'heure.
2. `SUPABASE_URL=… ANON_KEY=… [USER_JWT=…] docs/production/http_checks.sh avant preuves/prod-avant.txt` — attendu : `ATTENDU-AVANT` sur `merchants` (colonnes brutes) ; **`NON-PROBANT`** possible (0 commerce publié) : normal.
3. `docs/recette/checks.sql` (éditeur SQL) → `preuves/prod-checks-avant.csv`. Attendu : `table_privee_existe=f`, `commerces=1`, `commerces_publies=0`, `commerces_avec_colonnes_brutes=1`, `migration_enregistree=f`.
4. Empreinte des valeurs actuelles (à comparer après) : `select md5(string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by id)) from public.merchants;` — **noter le résultat**.
5. Prévenir les personnes concernées ; vérifier que la PR applicative est prête (CI verte) mais **non fusionnée**.

## 3. Jour J (durée visée : moins de 10 minutes)
| # | Action | Attendu / critère d'arrêt |
| --- | --- | --- |
| 1 | Garde : `select (select count(*) from public.merchants where is_published) as publies, (select count(*) from public.orders where status::text not in ('collected','delivered','cancelled')) as commandes_en_cours;` | `0` et `0`. Sinon **STOP** |
| 2 | Coller `merchants_private_production.sql` en une fois → Run | Dernier tableau : `commerces_avant = commerces_apres`, `avec_donnees_avant = lignes_privees`. **Toute exception = rien n'est appliqué** (transaction) ; ne pas relancer sans analyse |
| 3 | `checks.sql` ; empreinte des valeurs privées (même requête sur `merchant_private`) | `table_privee_existe=t`, `commerces_avec_colonnes_brutes=0`, `lignes_privees=1`, `valeurs_privees_non_nulles>0`, **empreinte identique à celle du J-1** |
| 4 | **Aussitôt** : fusionner la PR applicative dans `main` (déploiement Vercel de app.zeeroo.fr) et déployer `create-order` (`supabase functions deploy create-order`) | Déploiements « Ready » |
| 5 | `http_checks.sh apres preuves/prod-apres.txt` | 0 échec, 0 erreur technique ; `NON-PROBANT` toléré tant qu'aucun commerce n'est publié |
| 6 | Parcours restaurateur (compte propriétaire) : boutique (lien de paiement affiché), informations (SIRET, TVA, e-mail, téléphone pré-remplis), **Enregistrer sans rien changer**, console admin (fiche abonné) | Valeurs identiques avant/après (re-vérifier l'empreinte) |
| 7 | Archiver les preuves ; noter l'heure de fin | — |

Fenêtre de dégradation (étapes 2 → 4) : l'ancienne application ne voit plus téléphone ni lien de paiement ; l'ancienne `create-order` refuse les paiements par carte. **Impact nul tant que 0 commerce est publié** (état du 29/10/2026).

## 4. Retour arrière — sans réexposer les données
Hiérarchie (du moins au plus coûteux) :
1. **Corriger en avançant** (recommandé) : redéployer la nouvelle application / `create-order` ; aucune donnée n'est touchée.
2. **Retour arrière « sûr »** (dernier recours applicatif) : `merchants_private_ROLLBACK_SAFE.sql`.
   - Il **dépublie d'abord tous les commerces** (liste mémorisée) puis restaure les valeurs dans `merchants`. Un visiteur anonyme ne voit alors **aucune ligne** de `merchants` : rien n'est exposé. Seuls le propriétaire et les clients ayant commandé (politiques d'origine) voient les colonnes restaurées.
   - Redéployer ensuite l'**ancienne** application et l'**ancienne** `create-order`, vérifier avec `http_checks.sh avant`.
   - **La republication réexpose** les données (ancien modèle) : `merchants_private_ROLLBACK_REPUBLISH.sql`, refusé sans l'ordre explicite `set zeeroo.accept_exposure = 'oui';` et seulement après décision du propriétaire. Elle ne republie que les commerces encore éligibles.
   - Effet de bord assumé : commerces hors annuaire et sans commandes jusqu'à la republication.
   - Vérifié en local : `docs/recette/safe_rollback_check.sh` (anonyme 0 ligne, valeurs restaurées à l'identique, republication refusée sans ordre, puis effective avec l'ordre).
3. **Ancien script `merchants_private_ROLLBACK.sql`** (restauration brute) : **réexpose immédiatement** les commerces publiés ; ne l'utiliser que si aucun commerce n'est publié (état actuel) ou sur décision explicite.
4. **Restauration de la sauvegarde / point dans le temps** : perd les écritures postérieures (avec 0 commande, impact limité) ; décision du propriétaire.
Critères de déclenchement : valeurs privées différentes (empreinte), `http_checks.sh apres` en échec, application inutilisable, erreur Postgres récurrente. Une `ERREUR-TECHNIQUE` seule (réseau) n'est pas un critère : refaire le contrôle.

## 5. Après la bascule
- Surveiller 24 h : journaux API / Postgres / Edge Functions (`permission denied for table merchants`, `column … does not exist`).
- Quand un premier commerce est publié : relancer `http_checks.sh apres` (le contrôle sera alors probant) et `scenarios.mjs` sur un commerce de test **de recette**, pas sur un vrai commerce.
- Étapes suivantes (non incluses) : fiche légale publique (cadrage `docs/LEGAL-SHEET.md`), QR codes (PR #41), vue « Prospects » admin.

## 6. Test Stripe réel en mode test (à faire avant le GO, ou à accepter comme limite)
Le webhook réel n'a pas été prouvé (la recette locale signe les événements avec un secret local). Deux options :
- **A. Stripe CLI en local** (compte Stripe en mode test, par le propriétaire) : `scripts/localdb/http_stack.sh up` puis `docs/recette/functions_serve.sh start` avec `STRIPE_SECRET_KEY=<clé sk_test_ du compte>` (sans `STRIPE_API_BASE`) et `STRIPE_WEBHOOK_SECRET=<whsec_ affiché par la CLI>` ; `stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook` ; `billing` crée une session Checkout réelle en mode test ; payer avec la carte de test ; vérifier la ligne `subscriptions` et la publication. Aucune carte réelle, aucune production.
- **B. Projet hébergé de recette** (`zeeroo-recette-e2e`, en pause : réactivation payante, décision du propriétaire).
- **C. Accepter la limite** par écrit (la recette locale couvre la signature, la déduplication et la logique ; pas la livraison réelle des événements Stripe).

## 7. Responsabilités
Propriétaire : GO, exécution du SQL, fusion, déploiements, sauvegarde. Assistant : préparation, scripts, relecture, exécution des contrôles locaux et en lecture seule. Aucune écriture en production par l'assistant sans autorisation explicite.
