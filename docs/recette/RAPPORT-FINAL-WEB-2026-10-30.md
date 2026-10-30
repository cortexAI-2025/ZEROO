# Rapport final — finalisation de l'application web ZEEROO (phases 1 à 4) — 30/10/2026

Périmètre : application web (Client, Restaurant, Livreur) et services backend. Tout a été exécuté en **local** (pile Docker : Postgres Supabase,
GoTrue, PostgREST, stripe-mock, vraies Edge Functions servies par Deno, Chromium), avec des données fictives. **Aucune opération de production**
n'a été faite pendant ces phases (ni migration, ni déploiement, ni fusion, ni push, ni build Vercel).

## Résultats

| Recette | Script | Résultat |
| --- | --- | --- |
| Parcours complets (livraison, click & collect, annulation, refus, erreurs, isolation) | `docs/recette/e2e_web_flow.mjs` | **52 / 52** |
| Trois espaces × trois largeurs dans Chromium (27 écrans) | `docs/recette/ui_responsive.mjs` | **99 / 99** |
| Abonnements Start/Pro : droits, cycle de vie, dépublication, livreur, `billing`, webhook | `docs/recette/e2e_billing_plans.mjs` | **65 / 65** |
| Notifications (faux serveur Expo) | `docs/recette/e2e_notifications.mjs` | **20 / 20** |
| Résilience réseau et performances | `docs/recette/ui_network_perf.mjs` | **8 / 8** |
| Tests Jest | `npm test` | **245** (236 au départ, +9) |
| Tests Deno (fonctions) | `deno test supabase/functions/_tests/` | **100** (dont 24 ajoutés pour `http.ts`) |
| pgTAP + concurrence (migrations depuis zéro, nouvelle migration comprise) | `scripts/localdb/run.sh` | tous OK |
| Types / lint | `tsc`, `expo lint`, prettier (`src`) | sans erreur ni avertissement |

Preuves : `docs/recette/preuves-e2e-web-2026-10-30/`.

## Fonctionnalités et anomalies corrigées

1. **Erreurs métier de `create-order` en « internal_error » (HTTP 500)** — 13 codes que l'application sait afficher (`price_changed`, `item_out_of_slot`,
   `pickup_unavailable`, `merchant_closed_at_slot`, `invalid_schedule`, `cash_*`, `courier_not_assigned`, `invalid_delivery_code`, `group_*`) arrivaient en
   erreur générique. Corrigé dans `supabase/functions/_shared/http.ts` (HTTP 400 avec le code) + 24 tests. *Déployé le 30/10 pour `create-order` uniquement (version 31) ; les autres fonctions qui importent `_shared/http.ts` n'ont pas été redéployées.*
2. **Hors connexion : chargement sans fin et erreur générique** — React Query met les lectures en pause hors ligne (ni succès ni erreur) ; les erreurs
   réseau s'affichaient « Une erreur est survenue ». Ajoutés : bandeau « hors connexion », message « Connexion impossible… » (`QueryState`,
   `errorKey`), délai maximal de 20 s sur les appels de fonctions avec erreur réseau dédiée, et actions utilisateur (commander, accepter, livrer)
   jamais mises en attente pour s'exécuter à retardement au retour du réseau (`networkMode: 'always'` pour les mutations).
3. **Index sur 12 clés étrangères** (`supabase/migrations/20261030100000_fk_covering_indexes.sql`) : avertissement « unindexed_foreign_keys » des
   Advisors. Validée par toute la chaîne pgTAP. *Appliquée à la main en production le 30/10 et enregistrée dans l'historique.*

## Ce qui a été vérifié sans anomalie

- **Droits par formule** : Start refuse mini-site, commandes groupées, statistiques avancées, Happy Hours ; Pro les autorise ; rétrogradation Pro → Start
  coupe le mini-site public ; `past_due`, `unpaid`, `canceled`, `incomplete_expired`, `paused` dépublient automatiquement et bloquent la republication ;
  retour à `active` permet de republier ; un restaurateur ne peut ni lire l'abonnement d'un autre, ni modifier ou créer le sien.
- **Livreur** : Start limité à une course simultanée, Pro plusieurs ; abonnement résilié = aucune mission ni acceptation.
- **Stripe** : `billing` (Start/Pro × mensuel/annuel, formule ou périodicité inconnue refusées, anti-doublon `already_subscribed`, portail sans abonnement) ;
  webhook (signature absente / invalide / autre secret / ancienne, corps modifié, rejeu « duplicate », client inconnu) ; synchronisation, désordre des
  événements et renouvellements couverts par les 24 scénarios de `stripe-webhook.test.ts`. Tarifs du code conformes à la grille (HT) ; **les prix Stripe de
  production n'ont pas été lus ni modifiés**.
- **Notifications** : bons destinataires pour chaque transition (nouvelle commande → commerçant ; acceptée, prête, refusée avec motif, en route, livrée,
  livreur affecté → client ; annulation client → commerçant ; mission → livreur en ligne seulement) ; adresse jamais transmise au service tiers (ville
  seulement) ; fonction non appelable sans secret ; panne du service Expo sans effet sur la commande ; appareil désinstallé supprimé ; lots de 100.
- **Performances** : 825 Ko compressés au chargement ; page lisible en ~6 s sur 4G lente avec processeur ralenti ×4 ; aucun débordement horizontal
  sur 390 / 820 / 1366 px.
- **Sécurité base** (lecture seule en production) : RLS activée sur toutes les tables publiques lisibles par `anon` ; fonctions `admin_*` contrôlent
  l'administrateur ; `merchant_private` fermée.

## Risques résiduels

| Risque | Gravité | Détail / mitigation |
| --- | --- | --- |
| **Application de production en retard sur la base** | élevée | La base est migrée (`merchant_private`) mais `app.zeeroo.fr` sert encore `d5d24a6` : champs administratifs vides pour les restaurateurs. Déploiement de #61 bloqué par la **limite de builds Vercel** (3 projets liés au dépôt). Ne pas publier de commerce avant. |
| Limite de déploiements Vercel | élevée | « Rate limited — retry in 24 hours » depuis le 29/10 ~14:22. Chaque push = 3 builds. Réduire les projets liés au dépôt ou passer en Pro (décision du propriétaire). |
| Pas de notification web hors de l'onglet | moyenne | Le web n'a pas de push (Expo) : la sonnerie du restaurateur ne fonctionne que dans l'onglet ouvert (Realtime + sondage 30 s). Web Push (VAPID + service worker) = fonctionnalité à décider. |
| Temps réel non testé | moyenne | La pile locale n'a pas Realtime : à valider sur l'environnement réel après déploiement de #61. |
| Correction `create-order` et index non en production | faible | Voir « Autorisations ». |
| Bundle unique de 3,1 Mo (825 Ko compressé) | faible | Pas de découpage par route ; acceptable aujourd'hui. |
| Protection mots de passe compromis désactivée (Supabase Auth) | faible | Réglage du tableau de bord Supabase. |
| PostgREST renvoie HTTP 500 pour les exceptions SQL `P0002` | info | Message intact, l'application lit le message : pas d'impact utilisateur ; attendre ces 500 en supervision. |

## Fichiers modifiés (branche `ccr-cbee9612-jsmce8-web-finalisation`, fusionnée dans `main` par la PR #62)

Application : `src/lib/network.ts` (+test), `src/lib/errors.ts`, `src/lib/functions.ts` (+test), `src/lib/query-client.ts` (+test), `src/components/OfflineBanner.tsx`,
`src/components/ui/QueryState.tsx`, `src/app/_layout.tsx`, `src/i18n/locales/fr/translation.json`.
Backend : `supabase/functions/_shared/http.ts`, `supabase/functions/_tests/http.test.ts`, `supabase/migrations/20261030100000_fk_covering_indexes.sql`.
Recette : `docs/recette/{e2e_web_flow,e2e_billing_plans,e2e_notifications,ui_responsive,ui_network_perf}.mjs`, `functions_serve.sh`, `gateway.mjs`, preuves, rapports.
Documentation : `docs/PR-AUDIT-2026-10-30.md`.

## Commits locaux (au-dessus de la branche de la PR #60)

- `89a9891` Recette de bout en bout des trois espaces web et correction des erreurs métier de `create-order` (conservé, comme demandé)
- `02c9a85` Résilience réseau et recette des abonnements Start/Pro
- `bcff7b1` Recette des notifications, index sur clés étrangères, audit des PR
- (ce rapport : commit suivant)

## Opérations nécessitant votre autorisation (liste d'origine ; statut au 30/10 soir en fin de section)

1. **Pousser la branche et ouvrir la PR** (3 builds Vercel par push : à faire de préférence après le déploiement de #61).
2. **Fusionner #61** (déploie l'application sur `app.zeeroo.fr`) — après levée de la limite Vercel et contrôle de la branche de production.
3. **Redéployer les Edge Functions** avec la correction de `http.ts` (`create-order`, `order-decision`, `billing`… toutes celles qui importent `_shared/http.ts`) — après nouveau contrôle préproduction.
4. **Appliquer en production** la migration `20261030100000` (index) et, séparément, `20261029100000_admin_publish_guard` (PR #57).
5. **Fermer** les PR #44, #45, #49 (voir `docs/PR-AUDIT-2026-10-30.md`) et trancher #48 (thème sombre) et #41 (QR/flyers).
5. **Web Push** pour les nouvelles commandes (nouvelle fonctionnalité, clés VAPID à créer) — à décider.

**Statut au 30/10/2026 (soir)** : 1 fait (PR #62 ouverte puis fusionnée) ; 2 fait (#61 fusionnée et déployée) ; 3 fait pour `create-order` seulement (version 31), les autres fonctions ne sont pas redéployées ; 4 fait (migrations `20261030100000` et `20261029100000` appliquées à la main) ; 5 fait (#44, #45, #49, #41 et #48 fermées, voir `docs/ROADMAP.md`) ; Web Push : non traité.
