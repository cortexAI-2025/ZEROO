# Checklist du jour J — bascule Supabase + application (PR #60 / #61)

Complète `PLAN-BASCULE-MERCHANTS.md` (qui reste la référence sur le fond : conditions du GO §1, procédure d'arrêt §3bis, retours arrière §4, compatibilité §4bis). Ce document est la **feuille à cocher** le jour J.

**Statut : NO-GO production** tant que le propriétaire n'a pas écrit « exécute ». Rien de ce document n'est exécuté automatiquement ; Claude ne lance aucune étape marquée 🔒.

## Légende

| Marque | Sens |
| --- | --- |
| 🔍 **LECTURE** | Lecture seule (requête `select`, consultation d'un écran, `http_checks.sh`). Peut être faite sans autorisation spéciale, y compris la veille. |
| 🔒 **AUTORISATION** | Modifie la production (déploiement, SQL qui écrit, fusion de PR, restauration). **Uniquement après « exécute » du propriétaire**, étape par étape. |

Projet de production : `rgxesocsvhgsqoehxhgt`. Les projets de recette ne sont jamais utilisés pour ces contrôles.

## Empreintes des fichiers (à recalculer si un fichier change)

Sur le fichier **téléchargé depuis GitHub** (`sha256sum`), commit `49efd12` :

| Fichier | SHA-256 |
| --- | --- |
| `supabase/migrations/20261029120000_merchants_private_details.sql` | `73c7aec13199997daeef08361939be1c6b144836caae12830f686a7ec8cf431c` |
| `docs/production/merchants_private_production.sql` | `ba8c9300381958f386fc9b9fc983673f24ed82f693f2a695827f56e1c5644502` |
| `docs/production/merchants_private_ROLLBACK.sql` | `401ae67dc00e1332d2d04140ba3b06d3fca5d69fc1a7f99fbc41473f2603b0db` |
| `docs/production/merchants_private_ROLLBACK_SAFE.sql` | `5f31b7bcfcdf49f0824282a94fd29a77ca45f5f3b34d87064290f933d6654fb5` |
| `docs/production/merchants_private_ROLLBACK_REPUBLISH.sql` | `3da7ad52ae8b7bb9f4c0817f4dd88a82414b38c01428d7cb018eb181bc0a44d1` |
| `docs/production/merchants_private_ROLLBACK_REDUCED.sql` | `791a34d8215bd783758a7ad6496c39e648dd359c86e83b5e4dbeac0ca1213d4d` |
| `docs/production/merchants_private_REAPPLY_AFTER_REDUCED.sql` | `19cbbc8a92b87cb0198b7ab33817b40c15252d1aef5c73418e446da281cb11f7` |
| `docs/production/merchants_private_REAPPLY_REPUBLISH.sql` | `5cf70a0ade9f4e5fbaff577b387e128748fcf1258a479fda014e75e0d5592f4c` |

## A. Pré-requis bloquants (J-1 ou avant) — tous cochés, sinon NO-GO

- [ ] 🔍 CI verte sur le dernier commit de la PR #60 **et** de la PR #61 (GitGuardian, check, functions, database, web-build, web-smoke).
- [ ] 🔍 Empreintes du tableau ci-dessus recalculées sur les fichiers téléchargés ; identiques.
- [ ] 🔍 Test Stripe en mode test : validé par le propriétaire (ou limite acceptée par écrit).
- [ ] 🔍 `create-order` identique dans #60 et #61 : `git diff origin/<branche #60> origin/<branche #61> -- supabase/functions/create-order` vide.
- [ ] 🔍 **Vercel — contrôle obligatoire avant toute fusion** (section B).
- [ ] 🔍 Sauvegarde Supabase confirmée (section C).
- [ ] 🔍 Garde métier relue le jour même (section D).

## B. Contrôle Vercel obligatoire (avant toute fusion de la PR #61)

Projet Vercel **`zeeroo.online`** = application `app.zeeroo.fr` (dépôt `cortexAI-2025/ZEROO`). Le nom du projet n'a rien à voir avec le site vitrine. **Aucun changement de domaine ni de configuration.**

- [ ] 🔍 Vercel > projet `zeeroo.online` > Settings > Git > **Production Branch** : noter la valeur. La fusion de la PR #61 déclenche la production **seulement si** cette branche est celle visée par la PR (`main`). Sinon : STOP, corriger le plan avant de continuer.
- [ ] 🔍 Vercel > Settings > Domains : `app.zeeroo.fr` rattaché à ce projet, vérifié, sans redirection.
- [ ] 🔍 Vercel > Deployments > filtre Production : le déploiement actuel d'`app.zeeroo.fr` est « Ready » et son **commit** est noté. Le comparer à `main` (`git log -1 origin/main`) : il doit correspondre à la version attendue **avant** la fusion. En cas d'écart, comprendre pourquoi (déploiement manuel, commit non fusionné…) avant de continuer. *(Au 29/10/2026, le dernier déploiement de production lu en lecture seule était le commit `d5d24a6`.)*
- [ ] 🔍 Noter l'identifiant du déploiement actuel : c'est la cible du **retour arrière applicatif** (« Promote / Instant Rollback » sur ce déploiement). Il doit être marqué éligible au retour arrière.
- [ ] 🔍 Après la fusion (étape F6) : le nouveau déploiement de production porte le commit de fusion attendu et passe « Ready » en moins de 15 min.

## C. Sauvegarde Supabase et restauration

- [ ] 🔍 Supabase > Database > Backups : une sauvegarde **de moins de 24 h** existe ; noter son horodatage. Vérifier le type de sauvegarde offert par l'abonnement (quotidienne ou PITR) : la procédure de restauration en dépend.
- [ ] 🔒 Si aucune sauvegarde récente : déclencher une sauvegarde manuelle (ou export `pg_dump` fait par le propriétaire), **attendre sa fin**, noter l'heure. Pas de bascule sans cela.
- [ ] 🔍 Procédure de restauration lue **avant** le jour J (Supabase > Database > Backups > Restore) : une restauration de projet **remplace toute la base**, y compris ce qui est écrit entre la sauvegarde et la restauration ; elle est donc le dernier recours, pas le retour arrière normal. Retour arrière normal = scripts SQL de la section H.
- [ ] 🔍 Conserver à part, hors de la base, l'empreinte des valeurs administratives (section E, étape 1) : elle sert de preuve indépendante de la conservation des données.

## D. Garde métier (lecture, à refaire le jour J juste avant l'étape F3)

```sql
select
  (select count(*) from public.merchants)                                   as commerces,
  (select count(*) from public.merchants where is_published)                as publies,
  (select count(*) from public.orders
     where status::text not in ('collected','delivered','cancelled'))      as commandes_en_cours,
  (select count(*) from public.merchants m where m.is_subscription_active) as abonnements_actifs;
```

- [ ] 🔍 État du 29/10/2026 : 1 commerce, 0 publié, 0 commande en cours, 0 abonnement actif. **Relire le jour J.**
- [ ] 🔍 Si `publies > 0` **ou** `commandes_en_cours > 0` : **STOP**. La bascule en une migration n'est valable que sans commerce publié ni commande en cours ; sinon il faut une stratégie « expand / contract » décidée avec le propriétaire. Ne pas improviser.
- [ ] 🔍 Aucun restaurateur connecté pendant la fenêtre.

## E. Données administratives : avant / après

1. 🔍 **Avant** — empreinte des valeurs actuelles (noter le résultat, le garder hors de la base) :
   ```sql
   select count(*) as commerces,
          md5(string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''), ';' order by id)) as empreinte
   from public.merchants;
   ```
2. 🔍 **Avant** — `docs/recette/checks.sql` → `preuves/prod-checks-avant.csv`. Attendu : `table_privee_existe=f`, `commerces_avec_colonnes_brutes` = nombre de commerces ayant des données, `migration_enregistree=f`.
3. 🔍 **Après** — même empreinte sur `merchant_private` (mêmes colonnes, même ordre) :
   ```sql
   select count(*) as lignes,
          md5(string_agg(merchant_id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''), ';' order by merchant_id)) as empreinte
   from public.merchant_private;
   ```
   **L'empreinte doit être identique à celle d'avant** ; sinon STOP (le script de production la vérifie déjà dans sa transaction, ce contrôle est indépendant).
4. 🔍 **Après** — `checks.sql` → `preuves/prod-checks-apres.csv`. Attendu : `table_privee_existe=t`, `commerces_avec_colonnes_brutes=0`, `migration_enregistree=t`.

## F. Ordre exact de la bascule

L'ordre est obligatoire : **1) `create-order` → 2) migration SQL → 3) application web.** `create-order` est tolérante (elle lit la colonne historique puis `merchant_private`) : elle est valable avant, après et après tout retour arrière, donc se déploie en premier sans risque. L'application web, elle, **ne doit jamais précéder la migration** (les colonnes calculées `merchant_*` n'existent qu'après).

| Étape | Action | Type | Attendu / critère d'arrêt |
| --- | --- | --- | --- |
| F0 | Sections A à E terminées ; le propriétaire dit « exécute » | — | Sinon on s'arrête |
| F1 | 🔒 Déployer `create-order` (version de la PR #61) sur le projet de production | AUTORISATION | Fonction « Active » ; journal sans erreur |
| F2 | 🔍 Vérifier `create-order` (contrôle G1) | LECTURE | Réponse attendue ; sinon STOP avant la migration |
| F3 | 🔍 Rejouer la garde D et noter l'heure T0 | LECTURE | `publies=0` et `commandes_en_cours=0` |
| F4 | 🔒 Éditeur SQL : coller `merchants_private_production.sql` **en une fois** → Run | AUTORISATION | Transaction unique : toute exception annule tout. Dernier tableau : `commerces_avant = commerces_apres`, `avec_donnees_avant = lignes_privees`. Ne pas relancer sans analyse |
| F5 | 🔍 Section E, étapes 3 et 4 | LECTURE | Empreinte identique, colonnes brutes vidées |
| F6 | 🔒 **Aussitôt** : fusionner la PR #61 dans `main` (déploiement de `app.zeeroo.fr`) | AUTORISATION | Déploiement « Ready » en moins de 15 min (sinon section H et §3bis du plan) |
| F7 | 🔍 Contrôles HTTP, RLS et parcours (section G) | LECTURE | Tous conformes |
| F8 | Archiver les preuves ; noter l'heure de fin (T1) | — | — |

Fenêtre de dégradation (F4 → F6) : l'ancienne application ne voit plus téléphone ni lien de paiement. Impact nul tant que 0 commerce est publié. **Viser moins de 10 minutes.**

## G. Contrôles après déploiement (tous en lecture)

- [ ] **G1 — `create-order`** : appel authentifié d'un compte client de test sur un commerce de recette, ou réponse d'erreur métier attendue. Vérifier qu'il ne répond **ni** `merchant_no_payment_link` à tort **ni** une erreur 5xx. Journal de la fonction : aucune erreur.
- [ ] **G2 — HTTP** : `SUPABASE_URL=… ANON_KEY=… [USER_JWT=…] docs/production/http_checks.sh apres preuves/prod-apres.txt` (lecture seule). Attendu : 0 `ÉCHEC`, 0 `ERREUR-TECHNIQUE` ; `NON-PROBANT` toléré tant qu'aucun commerce n'est publié. Les jetons ne sont jamais écrits ni affichés.
- [ ] **G3 — RLS par profil** (jetons de comptes de test) : `anon`, client, restaurateur propriétaire, restaurateur d'un autre commerce, livreur, administrateur. Attendu : seuls le propriétaire et l'administrateur lisent SIRET / TVA / e-mail / raison sociale / téléphone / lien de paiement de **leur** commerce ; `anon` et `authenticated` n'ont aucun accès direct à `merchant_private` ; `public_merchants` ne contient ni SIRET, ni TVA, ni e-mail, ni lien de paiement, ni `owner_id`.
- [ ] **G4 — Parcours restaurateur** (compte propriétaire) : boutique (lien de paiement affiché) ; informations (SIRET, TVA, e-mail, téléphone **pré-remplis**) ; **Enregistrer sans rien changer** ; console admin (fiche abonné) ; la section E étape 3 donne toujours la même empreinte.
- [ ] **G5 — Numéro public** : désactivé par défaut ; ne s'affiche sur le mini-site que si le restaurateur l'a autorisé.
- [ ] **G6 — Annuaire public** : uniquement des affiliés ; `directory_businesses` et `directory_claims` refusés à `anon`.
- [ ] **G7 — Avertissements** : Supabase > Advisors (security) : aucun nouvel avertissement lié à `merchant_private` ou aux fonctions `merchant_*`.

## H. Critères d'arrêt et retour arrière

**Arrêt immédiat (ne pas poursuivre à l'étape suivante) si :**
- une exception dans le script SQL (rien n'est appliqué : analyser, ne pas relancer à l'aveugle) ;
- une empreinte différente (section E) ;
- `http_checks.sh apres` donne un `ÉCHEC` (exposition) ;
- `create-order` répond 5xx ou refuse à tort les paiements par carte ;
- `permission denied for table merchants` ou `column … does not exist` dans les journaux ;
- le déploiement Vercel n'est pas « Ready » dans les 15 min.

**Principe : après la migration, on avance, on ne revient pas en arrière côté application** (§3bis du plan). Corriger en avançant (redéployer l'application ou `create-order`) ne touche à aucune donnée.

**Retour arrière réduit (recommandé si un retour est nécessaire)** — 🔒 sur « exécute » explicite :
1. Dépublier les commerces si besoin.
2. Exécuter `merchants_private_ROLLBACK_REDUCED.sql` : `merchant_private` est **conservée et fermée** ; seuls le téléphone et le lien de paiement sont restaurés dans `merchants` ; aucune information administrative n'est réexposée aux clients ni aux livreurs.
3. 🔒 **Redéployer l'ancienne application** (précédent déploiement de production noté en section B — « Promote / Instant Rollback »). La nouvelle application ne doit **jamais** rester sur une base en mode réduit.
4. 🔍 `http_checks.sh` ; garder `create-order` (tolérante, valable dans tous les états).
5. Pour revenir à la nouvelle version : `merchants_private_REAPPLY_AFTER_REDUCED.sql`, puis déploiement immédiat de la nouvelle application, puis `merchants_private_REAPPLY_REPUBLISH.sql` si des commerces sont encore dépubliés.

**Autres retours (décision explicite du propriétaire)** : `merchants_private_ROLLBACK_SAFE.sql` (dépublie d'abord, puis réexpose) ; `merchants_private_ROLLBACK.sql` (**réexpose les données privées**, à éviter). **Restauration complète de la sauvegarde** : dernier recours, perd tout ce qui a été écrit depuis la sauvegarde.

## I. Surveillance pendant les 24 heures suivantes (lecture)

- [ ] **T1 + 15 min** : journaux Postgres, API et Edge Functions (`create-order`, `stripe-webhook`) : recherche de `permission denied`, `does not exist`, 5xx.
- [ ] **T1 + 1 h, + 4 h, + 12 h, + 24 h** : relire la garde D (aucune publication ni commande imprévue), `checks.sql` (`commerces_avec_colonnes_brutes=0`, empreinte stable) et les Advisors.
- [ ] Erreurs d'exécution du déploiement Vercel de production : aucune hausse.
- [ ] Au premier commerce publié : relancer `http_checks.sh apres` (qui devient probant) et `scenarios.mjs` **sur un commerce de test de recette**, pas sur un vrai commerce.
- [ ] Au bout de 24 h sans anomalie : consigner la clôture (heure, preuves archivées dans `preuves/`) ; sinon, section H.

## Ce que Claude peut et ne peut pas faire

- **Peut (🔍)** : relire les fichiers et les empreintes, lire la CI, lire Vercel et GitHub en lecture seule, préparer les requêtes, analyser les preuves que le propriétaire colle.
- **Ne fait pas (🔒)** : déployer `create-order`, exécuter du SQL d'écriture sur la production, fusionner une PR, restaurer une sauvegarde, modifier Vercel — sans « exécute » explicite, étape par étape.
