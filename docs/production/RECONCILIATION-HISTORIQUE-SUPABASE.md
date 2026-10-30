# Réconciliation de l'historique des migrations Supabase (production vs dépôt)

Relevé en **lecture seule** le 29/10/2026 sur la production (`supabase_migrations.schema_migrations` + catalogue). **Rien n'a été exécuté, aucun `supabase db push`, aucun `migration repair`.**

> **Mise à jour 30/10/2026 (soir)** : depuis ce relevé, `20261029120000`, `20261029100000` et `20261030100000` sont appliquées et enregistrées en production ; #59 / #60 sont fusionnées dans `main` et `20261028220000` n'y figure plus. Le tableau ci-dessous reste l'état du 29/10.

## Constat

| Version | Production | Dépôt | Effet réel en production |
| --- | --- | --- | --- |
| 15 migrations `20261028090600` … `20261028184115` (PR #51) | enregistrées | présentes dans #51 | appliquées |
| `20261025130000` affiliated_directory, `20261025140000` publication_guard | enregistrées **par le script ci-dessous** | présentes dans `main` | appliquées : 2 déclencheurs (`merchants_publication_guard`, `subscriptions_unpublish_on_lapse`) et 2 fonctions `nearby_merchants` / `search_merchants` avec `p_affiliated_only` |
| **`20261028210227` reconcile_missing_affiliation_migrations** | enregistrée | **aucun fichier** | voir ci-dessous |
| **`20261028220000` hide_directory_siret** | **absente** | était dans #51 ; supprimée de `main` par la fusion de #60 (30/10) | **non appliquée** : pas de colonne `public_id`, aucune lecture directe de l'annuaire par `anon` |
| `20261029110000` private_prospects | enregistrée (instructions non conservées) | présente dans #59 / #60 | appliquée : fonctions d'annuaire supprimées (0 restante), `anon` et `authenticated` sans lecture de `directory_businesses` / `directory_claims` |

## 20261028210227 — reconstitution fidèle

`history/20261028210227_reconcile_missing_affiliation_migrations.sql` documente ce qui a été appliqué. Ce script d'époque enregistrait, dans une transaction, les deux migrations d'affiliation de `main` (qui avaient été appliquées sans être inscrites à l'historique), après avoir verrouillé et refusé de s'exécuter si elles y figuraient déjà.

- **Fidélité prouvée** : le fichier est reconstruit à partir des deux fichiers de `main` (`20261025130000_affiliated_directory.sql` et `20261025140000_publication_guard.sql`) selon la structure exacte du script ; son MD5 (`5f6e0852ba182ffe052a71053bbff8d0`) et sa longueur (14 697 caractères) sont **identiques** à ceux de l'instruction conservée par la production. Aucune retranscription manuelle.
- **Il ne doit jamais être exécuté, ni placé dans `supabase/migrations/`** : sur une base neuve (`db reset`, CI) les deux versions sont déjà inscrites quand il passerait, donc sa garde lèverait « Affiliation migration history changed » et casserait la reconstruction ; sur la production il est déjà enregistré. Il est conservé comme **archive**.
- Cohérence avec le dépôt : le contenu des deux migrations est celui de `main`, déjà dans l'historique.

## Stratégie de réconciliation proposée (aucune action tant que le propriétaire n'a pas décidé)

Règle générale : l'équipe applique le SQL à la main dans l'éditeur ; **le CLI `supabase db push` n'est pas utilisé sur la production**. Il refuserait d'ailleurs de fonctionner en l'état (versions distantes sans fichier local, fichier local antérieur à la dernière version distante) et ne doit **jamais** être contourné par `--include-all`, qui appliquerait `20261028220000` et recréerait des fonctions d'annuaire supprimées par `private_prospects`.

1. **`20261028220000_hide_directory_siret`** — le fichier **reste dans le dépôt** (nécessaire à la reconstruction depuis zéro, où `private_prospects` vient ensuite le remplacer). En production il est **remplacé** par `private_prospects`. Pour qu'aucun outil ne tente de l'appliquer : *après* la fusion de #51 et sur décision du propriétaire, l'inscrire comme appliquée avec `supabase migration repair --status applied 20261028220000` (opération sur l'historique seulement ; elle n'exécute pas le SQL). Alternative : ne rien faire et ne jamais utiliser le CLI sur la production. **Ne pas exécuter le fichier.**
2. **`20261028210227`** — au choix du propriétaire : (a) archive seule (état actuel, ce dossier) ; ou (b) ajouter un fichier **sans effet** `supabase/migrations/20261028210227_reconcile_missing_affiliation_migrations.sql` (un commentaire et `select 1;`) pour que dépôt et production portent la même liste de versions, ce qui est inoffensif sur base neuve. Le choix (b) est à faire dans la PR de la chaîne, jamais par un SQL en production.
3. **`20261029110000_private_prospects`** — fusionnée avec la chaîne #51 → #59 ; la production l'a déjà. Aucun SQL.
4. **`20261029120000_merchants_private_details`** — reste la seule migration à exécuter, par le script `merchants_private_production.sql` (SHA-256 dans la checklist).

Contrôle de cohérence à refaire le jour J (lecture) : liste des versions de production = liste des fichiers du dépôt à la tête de la chaîne, aux exceptions documentées ci-dessus.
