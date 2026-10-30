# Contrôle préproduction — redéploiement de `create-order` (30/10/2026)

**Statut : prêt à être exécuté sur confirmation explicite. Rien n'a été déployé.**

## 1. Ce qui change exactement

Production : `create-order` **v29** (déployée le 29/10, `ezbr_sha256` `3d3fd226…d475`), projet `rgxesocsvhgsqoehxhgt`.
Dépôt : `main` à `c2f8863` (PR #62).

Comparaison du code déployé (lu en lecture seule) et du dépôt, fichier par fichier :

| Fichier du paquet | Écart avec le dépôt |
| --- | --- |
| `create-order/index.ts` | aucun |
| `create-order/handler.ts` | aucun (lecture tolérante `merchants.payment_link` puis `merchant_private`) |
| `_shared/supabase.ts` | aucun |
| `_shared/http.ts` | **+13 codes métier** dans `SQL_BUSINESS_ERRORS` |

Codes ajoutés : `price_changed`, `item_out_of_slot`, `pickup_unavailable`, `merchant_closed_at_slot`, `invalid_schedule`, `cash_not_accepted`, `cash_not_allowed_for_delivery`, `courier_not_assigned`, `invalid_delivery_code`, `group_orders_unavailable`, `invalid_group_order`, `group_lead_time`, `group_minimum_not_reached`.

**Effet** : ces refus métier remontent en **HTTP 400 + code** (que l'application sait traduire) au lieu de **HTTP 500 `internal_error`** (message générique). Aucune règle métier, aucun prix, aucun accès aux données ne change : la logique est dans les fonctions SQL, déjà en production.

## 2. Compatibilité

- Base : aucune migration requise. Le paquet est valable avec la base actuelle (migrations `20261029100000`, `20261029110000`, `20261029120000`, `20261030100000` appliquées).
- Application : la version actuellement en ligne et la nouvelle gèrent les deux (un code 400 inconnu retombe sur le message générique ; les 13 codes sont déjà dans `src/lib/errors.ts`).
- Les autres Edge Functions importent aussi `_shared/http.ts` mais **ne sont pas redéployées** : elles gardent leur paquet actuel, sans effet de bord.

## 3. Contrôles déjà faits (local, données fictives)

| Contrôle | Résultat |
| --- | --- |
| `deno test supabase/functions/_tests/http.test.ts` | 24 réussis, 0 échec |
| Recette e2e des trois espaces (`docs/recette/e2e_web_flow.mjs`, pile locale, Stripe mock) rejouée le 30/10 après la fusion de #62 | 52 OK, 0 échec (dont E5 `price_changed`, E8 `delivery_out_of_range`, E9 `no_courier_available`) |
| CI de la PR #62 sur `38324ed` | 6 contrôles verts |
| Écart de code avec la v29 | limité à `_shared/http.ts` (13 lignes) |

Non vérifiable depuis cette session : un appel authentifié réel sur la production (aucun compte client réel utilisé, aucune commande créée).

## 4. Risques

| Risque | Niveau | Note |
| --- | --- | --- |
| Régression de `create-order` | Faible | seul `http.ts` change, uniquement la traduction des erreurs |
| Interruption pendant le déploiement | Très faible | remplacement atomique de version ; aucune commande en cours (0 commande en base au dernier contrôle) |
| Erreur de paquet (fichier manquant) | Faible | contrôlé en 5 ci-dessous |

## 5. Procédure (sur confirmation « déploie create-order »)

1. **Avant** : relire `list_edge_functions` (v29 active, `verify_jwt: true`) et `select count(*) from public.orders` (la production est calme).
2. **Déployer uniquement `create-order`**, `verify_jwt: true`, avec exactement les 4 fichiers du paquet : `create-order/index.ts`, `create-order/handler.ts`, `_shared/http.ts`, `_shared/supabase.ts`, pris sur `main` à `c2f8863`. Pas d'`import_map`.
3. **Après** (lecture seule) : `get_edge_function` → version 30, `status: ACTIVE`, `verify_jwt: true` ; contenu de `_shared/http.ts` = celui du dépôt (13 codes présents) ; `handler.ts` identique à la v29.
4. **Test de fumée sans compte** : `POST` sans jeton → HTTP 401 `not_authenticated` ; `OPTIONS` → 200. Aucune commande créée.
5. **Avertissements Supabase** (`get_advisors`) : aucun nouvel avertissement.
6. Rapport : version, empreinte, résultats 3 à 5.

## 6. Retour arrière

Redéployer le paquet de `main` à `5b6ad54` (mêmes 4 fichiers, `http.ts` sans les 13 codes) : retour à l'état de la v29. Aucun effet sur les données.

## 7. À faire côté utilisateur après le déploiement (hors de ma portée)

Une commande de test réelle avec un compte client réel : refus attendu `price_changed` si le prix annoncé est falsifié (outil de développement du navigateur) — la page doit afficher le message dédié et non l'erreur générique.
