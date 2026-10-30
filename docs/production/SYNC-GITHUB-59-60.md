# Synchronisation GitHub — PR #59 et #60 : éviter tout rejeu accidentel de SQL (30/10/2026)

Analyse **en lecture seule** (git, workflows, production Supabase en `select`). Aucun SQL exécuté en production, aucune fusion, aucun push.

> **État au 30/10/2026 (soir) : ce document décrit l'analyse du matin.** Depuis : #60 (qui contient #59) est fusionnée dans `main` (`5c25fea`, CI verte), #57 l'est aussi (`55671cc`) ainsi que #62 (`c2f8863`, qui apporte la migration d'index). Les migrations `20261029100000` et `20261030100000` ont été **appliquées à la main en production** le 30/10 et enregistrées dans l'historique : il ne reste plus rien à appliquer. Les règles du §4 (jamais de `db push`, intégration GitHub ↔ Supabase désactivée, à confirmer dans le tableau de bord Supabase) restent en vigueur.

## 1. État réel

| Élément | Production Supabase | `main` (`5b6ad54`) | PR #59 | PR #60 (contient #59) |
| --- | --- | --- | --- | --- |
| `20261028220000_hide_directory_siret` | **jamais appliquée** | présente (via #51) | **supprimée** | **supprimée** |
| `20261029110000_private_prospects` | appliquée (29/10) | absente | ajoutée | ajoutée |
| `20261029120000_merchants_private_details` | appliquée (29/10) | absente | absente | ajoutée |
| `20261028210227_reconcile_missing_affiliation_migrations` | enregistrée, **sans fichier** | absente | absente | absente (archive : `docs/production/history/`) |
| `20261029100000_admin_publish_guard` (PR #57) | **non appliquée à l'analyse ; appliquée à la main le 30/10** | absente | absente | absente |
| `20261030100000_fk_covering_indexes` | **non appliquée à l'analyse ; appliquée à la main le 30/10** | absente | absente | absente (alors sur une branche locale ; fusionnée avec #62) |

Fusion à blanc (`git merge-tree`) de #59 et de #60 dans `main` : **propre**, sans conflit. #60 contient #59 (la fusion de #60 seule suffit à tout apporter). Les fichiers applicatifs de #61, déjà dans `main`, sont **identiques** dans #60.

## 2. Ce que la fusion de #59 / #60 change pour le risque de rejeu

**Effet favorable.** Aujourd'hui `main` contient `20261028220000_hide_directory_siret`, une migration que la production n'a **jamais** reçue et que `private_prospects` a remplacée : un `supabase db push --include-all` (ou une intégration automatique) la jouerait et **recréerait des fonctions d'annuaire supprimées et la colonne `public_id`**. #59/#60 **suppriment ce fichier** : après leur fusion, la liste des fichiers locaux ne contient plus aucune migration « jamais appliquée » parmi celles de la production. C'est donc la fusion qui **réduit** le risque ; tant qu'elle n'est pas faite, le risque décrit ci-dessus existe.

**Aucune migration ne se rejoue automatiquement aujourd'hui** (vérifié) :
- aucun workflow GitHub n'exécute `supabase db push`, `migration up`, `functions deploy` ni n'utilise de jeton d'accès Supabase (`.github/workflows` : seulement tests, build, CI) ;
- la fusion de #51 hier à 14:38 UTC n'a **rien appliqué** : la production n'avait toujours pas `20261028220000` le lendemain matin, ce qui montre qu'aucune intégration GitHub → Supabase de type « déployer les migrations à la fusion » n'est active. À reconfirmer dans le tableau de bord Supabase (Integrations / Branching) : elle doit rester **désactivée** ;
- les scripts SQL de production sont dans `docs/production/` (collés à la main), jamais dans `supabase/migrations/`.

**Rejeu par erreur d'un fichier de migration** (si quelqu'un colle `supabase/migrations/20261029110000_…` ou `…120000_…` dans l'éditeur) : échec immédiat et atomique (`add column … already exists` / objets déjà présents), sans modification. Les scripts `*_production.sql` embarquent en plus une garde « version déjà enregistrée » (`merchants_private_production.sql`, `private_prospects_production.sql`).

## 3. Risque réel trouvé et corrigé : scripts de retour arrière sans garde

Quatre scripts de `docs/production/` modifiaient la production **sans aucune confirmation** : un copier-coller accidentel suffisait.

| Script | Effet s'il est rejoué par erreur |
| --- | --- |
| `merchants_private_ROLLBACK.sql` | **réexpose** à l'API publique SIRET, TVA, e-mail, téléphone, lien de paiement |
| `merchants_private_ROLLBACK_SAFE.sql` | **dépublie tous les commerces** puis réexpose les données aux clients et livreurs |
| `merchants_private_ROLLBACK_REDUCED.sql` | **dépublie tous les commerces** et restaure téléphone et lien de paiement dans `merchants` |
| `private_prospects_ROLLBACK.sql` | **réexpose le SIRET** de l'annuaire et **supprime l'enregistrement** de la migration `20261029110000` de l'historique |

**Correction (commit local)** : chacun refuse désormais de s'exécuter sans confirmation typée dans la même exécution, avant toute modification :

```sql
set zeeroo.confirm_rollback = 'merchants_private_raw';     -- ROLLBACK.sql
set zeeroo.confirm_rollback = 'merchants_private_safe';    -- ROLLBACK_SAFE.sql
set zeeroo.confirm_rollback = 'merchants_private_reduced'; -- ROLLBACK_REDUCED.sql
set zeeroo.confirm_rollback = 'private_prospects';         -- private_prospects_ROLLBACK.sql
```

Chaque script remet la variable à zéro à la fin. Les scripts de **réapplication** et de **republication** étaient déjà gardés par l'état de la base (marqueur du mode réduit, instantané des publiés, `zeeroo.accept_exposure`).

**Vérifications locales** : `docs/recette/rollback_guard_check.sh` (refus sans confirmation, refus avec une mauvaise valeur, aucune modification après refus : 16 contrôles) ; les recettes existantes, mises à jour pour fournir la confirmation, restent conformes : `recette_merchants.sh` (2 cycles), `recette_reduced.sh` (2 cycles, 7 profils), `safe_rollback_check.sh`.

**Empreintes SHA-256 modifiées** (la migration et les scripts de production, eux, sont inchangés) :
- `merchants_private_ROLLBACK.sql` `50225d7a…86c1` ; `…_SAFE.sql` `d8371d49…6971` ; `…_REDUCED.sql` `0dc570a0…6fa0` ; `private_prospects_ROLLBACK.sql` `7c68260e…032b`.
- Checklist du jour J et plan de bascule mis à jour.

## 4. Marche à suivre proposée pour la synchronisation (rien n'est exécuté)

1. **Fusionner #60 dans `main`** (elle contient #59) : plus aucun SQL à exécuter, `20261029110000` et `20261029120000` sont déjà en production ; la fusion supprime en plus le fichier dangereux `20261028220000`. Retarget préalable de la base de #60 sur `main` (sa base actuelle est la branche de #59).
2. **Ne jamais lancer** `supabase db push` / `migration up` / `db reset --linked` sur le projet de production ; en cas d'outil CLI, d'abord `supabase migration list` (lecture seule) et comparer à `docs/production/RECONCILIATION-HISTORIQUE-SUPABASE.md`.
3. Les écarts d'historique restants sont **documentés, sans effet** : `20261028210227` (en production, sans fichier ; archive exacte dans `docs/production/history/`) et, à la fusion de #57 et de la migration d'index, deux fichiers supplémentaires **appliqués à la main le 30/10 sur autorisation** (fichiers désormais dans `main` via #57 et #62) (`20261029100000`, `20261030100000`).
4. Garder l'intégration GitHub ↔ Supabase (déploiement automatique des migrations) **désactivée** ; ne pas ajouter de workflow qui applique des migrations sans approbation manuelle.
5. Avant la fusion, ces corrections de garde doivent être **poussées sur la branche de #60** (fait le 30/10 : commit `e4b263a`, CI verte), puis la CI relancée.

## 5. Points que je n'ai pas pu vérifier

- L'état de l'intégration GitHub ↔ Supabase dans le tableau de bord (déduit de l'absence d'application de `20261028220000` après la fusion de #51).
- Les consoles et scripts utilisés en dehors du dépôt (éditeur SQL, CLI de poste) : seules les gardes ci-dessus protègent contre une exécution manuelle.
