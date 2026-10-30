# Recette de bout en bout des trois espaces web — 30/10/2026

Pile **locale** (Postgres Supabase 17.6, GoTrue, PostgREST, stripe-mock, vraies Edge Functions servies par Deno, application web
exportée et pilotée dans Chromium). Données fictives, aucun accès distant, aucune clé réelle. État de la base : **toutes les
migrations du dépôt, y compris `20261029120000_merchants_private_details`** (c'est l'état de production après la bascule).

## Résultats

| Recette | Script | Résultat |
| --- | --- | --- |
| Parcours complets et cas d'erreur (API + Edge Functions réelles) | `docs/recette/e2e_web_flow.mjs` → `preuves-e2e-web-2026-10-30/e2e-web-flow.txt` | **52 OK, 0 échec** |
| Trois espaces × trois largeurs (390, 820, 1366 px) dans un navigateur | `docs/recette/ui_responsive.mjs` → `preuves-e2e-web-2026-10-30/ui-responsive.txt` | **99 OK, 0 échec** |
| Tests unitaires (jest) / fonctions (Deno) / types | `npm test`, `deno test`, `tsc` | 236 / 100 / sans erreur |

Parcours couverts par `e2e_web_flow.mjs` :
- **A. Livraison** : client crée la commande → restaurant la reçoit et l'accepte → livreur disponible la voit et l'accepte → préparation,
  prête → remise au livreur (code de retrait, mauvais code refusé) → livraison (code client, mauvais code refusé) → client voit la
  commande terminée, historique client, revenus du livreur, synthèse du restaurant.
- **B. Click & collect sans livreur** : aucun livreur affecté, mission invisible du livreur, retrait avec code (mauvais code refusé).
- **C. Annulation** par le client avant acceptation (un autre client ne peut pas), seconde annulation et annulation après acceptation refusées.
- **D. Refus** par le restaurant avec motif visible du client ; un autre restaurant ne peut pas décider.
- **E. Erreurs et sécurité** : sans jeton, panier vide, quantité nulle, article inconnu, prix falsifié, comptes restaurant/livreur qui
  commandent, livraison hors zone, aucun livreur disponible, client qui accepte une mission ou change un statut.
- Isolation entre profils (commande et code de livraison invisibles d'un autre client ou d'un autre restaurant).

## Anomalie trouvée et corrigée

**Erreurs métier de `create-order` remontées en « internal_error » (HTTP 500).** `supabase/functions/_shared/http.ts` ne traduisait que
19 des 32 codes levés par `create_order` / `apply_order_transition`. Treize codes que l'application sait afficher
(`price_changed`, `item_out_of_slot`, `pickup_unavailable`, `merchant_closed_at_slot`, `invalid_schedule`, `cash_not_accepted`,
`cash_not_allowed_for_delivery`, `courier_not_assigned`, `invalid_delivery_code`, `group_*`) arrivaient en erreur générique : par
exemple un client dont le prix a changé voyait « une erreur est survenue » au lieu du message prévu.
Correction : codes ajoutés à la liste (HTTP 400 avec le code) + `supabase/functions/_tests/http.test.ts` (24 tests, dont le cas inconnu qui
reste en 500 sans détail). Vérifié en recette : prix falsifié → `400 price_changed`.

## Observations (sans correction)

- PostgREST répond **HTTP 500** pour les exceptions SQL de code `P0002` (ex. `mission_unavailable`, `order_not_found`) : le **message**
  est intact et c'est lui que l'application lit, donc pas d'impact utilisateur ; à garder en tête pour la supervision (500 attendus).
- Le service Realtime n'est pas lancé par la pile locale : les notifications en temps réel (sonnerie des nouvelles commandes) et les
  ressources externes ne sont pas couvertes par cette recette. À valider sur l'environnement réel.
- Stripe : abonnements et webhook déjà validés (hors périmètre de cette recette).

## Limites

Recette **locale** : elle ne remplace pas un test sur `app.zeeroo.fr` avec des comptes de test après le déploiement de la PR #61.
