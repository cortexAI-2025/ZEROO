# Rapport de recette HTTP, fonctions et navigateur — PR #60 (local, sans projet distant)

Exécution : `DENO=… scripts/localdb/recette_http.sh <dossier>` ; preuves archivées dans `docs/recette/preuves-http-locales-2026-10-29/` (réponses HTTP, états `checks.sql`, captures, empreintes). Aucun jeton, mot de passe ni clé n'y figure (vérifié par recherche automatique).

## Environnement (entièrement local, données fictives, clés de test)
| Élément | Réel / simulé |
| --- | --- |
| Postgres | **Image officielle Supabase** `supabase/postgres:17.6.1.054` (production : 17.11.0.003) — migrations du dépôt appliquées telles quelles, seed, données fictives |
| Auth | **GoTrue réel** `supabase/gotrue:v2.197.0` (connexions par mot de passe, jetons JWT réels) |
| API | **PostgREST réel** v12.2.3 derrière une passerelle locale minimale (remplace Kong) |
| Edge Functions | **Code réel du dépôt**, servi par Deno (`create-order`, `billing`, `stripe-webhook`, `order-decision`) |
| Stripe | **stripe-mock** (aucun compte, aucun réseau) |
| Application | Export web réel de la branche, piloté dans **Chromium** (Playwright) |
| Webhook Stripe | **SIMULATION** : événements signés avec un secret local. Ne prouve pas qu'un webhook Stripe réel sera reçu/traité |
| Abonnement actif / résilié | **SIMULATION** : lignes écrites en SQL (le résultat d'un paiement Stripe), pas un cycle Stripe réel |
| Non reproduit | Service Storage, Realtime, Kong, edge-runtime Supabase, sauvegardes/PITR, version exacte de Postgres de production |

## Résultats : conforme, 0 échec (après corrections)
| Exigence | Résultat |
| --- | --- |
| Pile démarrée, migrations officielles rejouées jusqu'à l'état « avant » | OK (sans modification des migrations) |
| **Avant** : exposition réelle constatée par HTTP | `merchants` expose SIRET, téléphone, lien de paiement à l'anonyme (`ATTENDU-AVANT`) |
| Script de production appliqué (Postgres Supabase) | OK ; valeurs privées **identiques** (empreinte MD5 `9a0657e4…`) avant/après |
| 7 profils × valeurs lisibles/masquées, commerce non publié, `public_merchants` | 102 contrôles OK (`41-apres-scenarios.txt`), dont écriture croisée refusée, apparition/disparition du numéro public |
| Accès directs `merchant_private`, `directory_*` | refusés (401/404), anonyme **et** compte connecté |
| `create-order` (réel) : carte avec lien privé, sans jeton (401), isolation des commandes, `order-decision` | OK (`42-apres-fonctions.txt`) |
| Page commande de la **nouvelle** application : téléphone + lien de paiement lus via `merchant_*` | OK |
| Publication ↔ abonnement ↔ encaissement | publication refusée sans abonnement, acceptée avec abonnement + encaissement, dépubliée à la résiliation (**SIMULATION** de l'état Stripe) |
| `billing` (checkout) | OK contre **stripe-mock** ; webhook : signature invalide refusée, événement signé localement accepté (**SIMULATION**) |
| Navigateur, nouvelle application | 9/9 : carte « Numéro professionnel public », autorisation → bouton « Appeler » sur le mini-site, retrait → disparition, enregistrement relu ; ni téléphone privé ni SIRET visibles |
| Retour arrière puis réapplication, 2 passages | colonnes brutes restaurées **à l'identique**, `merchant_private` supprimée, puis valeurs privées identiques après réapplication ; l'ancienne fonction et les contrôles « avant » repassent |

## Anomalies trouvées par cette recette (corrigées dans la PR)
1. **Droits de colonne manquants** : le restaurateur ne pouvait pas enregistrer son numéro public (HTTP 403). Les tests pgTAP ne le voyaient pas (écriture en rôle `postgres`). Corrigé (GRANT UPDATE) + tests.
2. **Perte de données par une ancienne application** : un restaurateur qui n'a pas rechargé son application et clique « Enregistrer » effaçait SIRET, TVA, raison sociale, e-mail, téléphone (constaté en navigateur). Corrigé : `''` = effacer, `null` = non renseigné (valeur conservée) ; la nouvelle application envoie `''` ; vérifié en navigateur (valeurs inchangées).
3. **Bascule non coordonnée** (comportement attendu, pas un défaut) : après la migration, l'ancienne `create-order` refuse les commandes par carte (`merchant_no_payment_link`) ; l'ancienne application ne voit plus le téléphone ni le lien de paiement. → déployer application et `create-order` **avec** la migration.

## Empreintes SHA-256 (voir `sha256-sources.txt` dans le dossier de preuves)
- `merchants_private_production.sql` : `ba8c9300381958f386fc9b9fc983673f24ed82f693f2a695827f56e1c5644502`
- `merchants_private_ROLLBACK.sql` : `401ae67dc00e1332d2d04140ba3b06d3fca5d69fc1a7f99fbc41473f2603b0db`
- migration `20261029120000_merchants_private_details.sql` : `73c7aec13199997daeef08361939be1c6b144836caae12830f686a7ec8cf431c`

## Ce que cette recette ne prouve PAS
- Un webhook Stripe **réel** (mode test hébergé) et le cycle d'abonnement réel (essai, prélèvement, résiliation).
- Les différences entre cette pile et le projet hébergé (Storage, Kong, Edge Runtime, Postgres 17.11, politiques réseau).
- La production (1 commerce, 0 publié) n'a pas été rejouée ni touchée.

## Verdict
- **Sortie du brouillon de la PR #60 : recommandée** (revue de code et de SQL possible sur le commit de référence ci-dessous), les anomalies bloquantes trouvées sont corrigées et couvertes par des tests de non-régression.
- **Production : NO-GO maintenu** jusqu'à : (1) relecture du SQL final (empreintes ci-dessus) ; (2) un test Stripe en mode test **hébergé** (webhook réel) ou, à défaut, l'acceptation explicite de cette limite ; (3) plan de bascule : sauvegarde, migration, déploiement immédiat de l'application et de `create-order`, `http_checks.sh apres` sur la production (lecture seule).
