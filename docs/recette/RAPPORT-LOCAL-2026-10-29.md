# Rapport de recette LOCALE — PR #60 (commit de référence `abf207f`)

Environnement : Postgres 16 local (PostGIS, pgTAP, pg_cron simulé), base recréée, **aucun projet distant, aucune production**. Données fictives uniquement (`supabase/seed.sql` + `docs/recette/merchants_recette_extra.sql`). Exécution : `PGUSER=postgres scripts/localdb/recette_merchants.sh <dossier>` ; preuves brutes dans `docs/recette/preuves-locales-2026-10-29/` (empreintes dans `SHA256SUMS.txt`).

## Résultat : 41 contrôles OK, 0 échec
| Exigence | Résultat |
| --- | --- |
| Migration rejouée sur base **peuplée** (2 commerces avec données administratives, 1 commerce publié) | Script de production appliqué ; ses contrôles internes (nombre de lignes, valeurs colonne par colonne, empreinte globale) passés |
| Conservation intégrale des données privées, valeur par valeur | `valeurs-avant.txt` et `valeurs-apres.txt` identiques (diff vide) ; colonnes brutes de `merchants` vidées |
| RLS, 7 profils : anonyme, client sans commande, client ayant commandé, livreur rattaché, propriétaire, autre restaurateur, administrateur | Valeurs lisibles/masquées conformes à la matrice pour chaque profil ; commerce **non publié** visible du seul propriétaire et de l'administrateur ; `public_merchants` **lisible** (1 ligne) pour tous les profils, jamais le non publié |
| Colonnes brutes, tables fermées | `anon` et `authenticated` : aucune valeur brute ; `merchant_private`, `directory_businesses`, `directory_claims` refusées |
| Commandes (couche base) | Création d'une commande sur le commerce publié ; la page commande du client lit téléphone + lien de paiement ; encaissement configuré (`is_payments_ready`) ; aucune commande perdue |
| pgTAP sur la base peuplée | dashboards 37, merchants_private 33, merchants_private_security 28, client_ordering 34, plans 26, delivery 91, publication_guard 13 |
| Retour arrière puis réapplication, **2 cycles** | Après retour arrière : colonnes brutes identiques à l'état d'origine, `merchant_private` supprimée ; après réapplication : valeurs privées identiques, état structurel identique à la première application |

`order_modes` compte les commerces du seed (fixture) : il est exclu de la base peuplée et passe dans la suite complète sur base propre.

## Empreintes SHA-256
```
e06f0c1f55acc7e0f2d6ac124eba69cadc291c5af2a084d9bc3a7ba576b7d754  docs/production/merchants_private_production.sql
401ae67dc00e1332d2d04140ba3b06d3fca5d69fc1a7f99fbc41473f2603b0db  docs/production/merchants_private_ROLLBACK.sql
162fbe042c22ebc6580f9c43f1791acbb1c02fc47eac45b1a5c530028aae6446  supabase/migrations/20261029120000_merchants_private_details.sql
72857f52e05379bcd7a604ee554e22008343d5a841cebcfc9757f2765bfccba3  docs/recette/merchants_recette_extra.sql
d40e3ec89432bc4ab843c4d7121e163d83ec6124a8908b472fd1641b4e5f2828  docs/recette/checks.sql
5ae550d30b86b4b2c7cdf03b0d43d4acb8b0fc1611bd60d2c73408f9efce69a1  scripts/localdb/recette_merchants.sh
```

## Ce que cette recette ne prouve PAS
- Aucun appel HTTP réel (PostgREST, `http_checks.sh`, `scenarios.mjs` non exécutés contre un serveur).
- `create-order` (Edge Function), paiements Stripe en mode test, webhooks d'abonnement, application mobile/web et ancienne application pendant la bascule : **non testés**.
- Comportement de la production (1 commerce, 0 publié) non rejoué ici.

## Verdict
**NO-GO production maintenu** : parcours de commande et de paiement non validés de bout en bout. Prochaine étape envisagée : test HTTP local (Supabase CLI + Edge Functions), sans projet distant.
