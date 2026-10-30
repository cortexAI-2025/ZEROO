# Rapport — retour arrière à exposition réduite (PR #60)

Variante validée par le propriétaire, **scénario distinct** : elle ne remplace pas `merchants_private_ROLLBACK.sql` ni `_ROLLBACK_SAFE.sql`. Exécution : `scripts/localdb/recette_reduced.sh <dossier>` sur la pile locale (Postgres Supabase officiel, GoTrue, PostgREST, stripe-mock, Edge Functions réelles, ancienne application dans Chromium). Preuves : `docs/recette/preuves-retour-arriere-reduit-2026-10-29/`. Données fictives, aucun accès distant.

## Principe
| Donnée | Pendant le mode réduit |
| --- | --- |
| Raison sociale, SIRET, TVA, e-mail de contact (et numéro public) | **restent dans `merchant_private`** (fermée : aucun droit API, RLS sans politique) ; jamais copiés dans `merchants` ; un SIRET saisi dans l'ancienne application est routé en privé |
| Téléphone, lien de paiement | restaurés dans `merchants` (source de vérité, copies privées retirées) : nécessaires à l'ancienne application |
| Publication | tous les commerces dépubliés d'abord (liste mémorisée) ; republication explicite (réexpose téléphone et lien, pas le reste) |

## Résultats (2 cycles complets : retour arrière réduit → réapplication), 0 échec
| Exigence | Résultat |
| --- | --- |
| Champs administratifs conservés | empreinte **identique** avant / pendant / après, aux 2 cycles |
| Aucun champ administratif dans `merchants` | vérifié par le script (contrôle interne, transaction annulée sinon), par SQL et par l'API pour chaque profil |
| 7 profils, commerces dépubliés (33 contrôles) | anonyme, client sans commande, autre restaurateur : 0 ligne de « Chez Samir » ; client ayant commandé, livreur, propriétaire, administrateur : fiche visible **sans** raison sociale / SIRET / TVA / e-mail ; `merchant_private` fermée pour tous |
| 7 profils, commerces republiés (42 contrôles) | le public voit téléphone et lien de paiement (ancien modèle) mais **jamais** de champ administratif ; colonnes calculées administratives masquées sauf propriétaire / administrateur |
| Commandes en mode réduit | ancienne `create-order` **et** fonction tolérante : commande par carte créée, page commande lue (11 OK chacune) |
| Ancienne application (navigateur) | boutique : « Lien actif » affiché ; enregistrer sans changement : rien perdu ; SIRET saisi → `merchant_private`, jamais `merchants` |
| Lien de paiement modifié pendant le mode réduit | **conservé** à la réapplication (recopié en privé, rien d'écrasé) |
| Réapplication malgré `merchant_private` | contrôles par empreintes passés ; colonnes vidées avant les déclencheurs ; 7 déclencheurs réinstallés |
| Après réapplication | `http_checks.sh apres` (9 OK), matrice des 7 profils (102 OK), commande (12 OK) |
| Sensibilité des tests | un script muté qui restaure aussi le SIRET est **refusé** par son propre contrôle ; une fuite introduite à la main dans `merchants` est signalée par la matrice (4 échecs) |

## Découvertes pendant la préparation
- `create-order` lisait `merchant_private` d'abord : en mode réduit le lien est dans `merchants` (source de vérité). La fonction lit désormais **la colonne d'abord**, puis `merchant_private` : valable avant, après la migration et après tout retour arrière.
- Les déclencheurs des champs administratifs sont **conservés** en mode réduit : ils protègent aussi contre une saisie dans l'ancienne application.

## Limites
- L'ancienne application voit SIRET/TVA/e-mail/raison sociale vides (elle ne peut pas les lire) ; la console admin affiche téléphone et lien vides ; la nouvelle application ne doit pas être redéployée avant la réapplication.
- Republier le mode réduit **réexpose au public téléphone et lien de paiement** (comme avant la migration), pas les données administratives.
- Recette locale, pas production ; webhook Stripe réel non couvert ici (voir `scripts/localdb/recette_stripe_cli.sh`).

## Empreintes SHA-256 (`sha256-sources.txt`)
    791a34d8215bd783758a7ad6496c39e648dd359c86e83b5e4dbeac0ca1213d4d  docs/production/merchants_private_ROLLBACK_REDUCED.sql
    19cbbc8a92b87cb0198b7ab33817b40c15252d1aef5c73418e446da281cb11f7  docs/production/merchants_private_REAPPLY_AFTER_REDUCED.sql
    5cf70a0ade9f4e5fbaff577b387e128748fcf1258a479fda014e75e0d5592f4c  docs/production/merchants_private_REAPPLY_REPUBLISH.sql
    ba8c9300381958f386fc9b9fc983673f24ed82f693f2a695827f56e1c5644502  docs/production/merchants_private_production.sql
    401ae67dc00e1332d2d04140ba3b06d3fca5d69fc1a7f99fbc41473f2603b0db  docs/production/merchants_private_ROLLBACK.sql
    5f31b7bcfcdf49f0824282a94fd29a77ca45f5f3b34d87064290f933d6654fb5  docs/production/merchants_private_ROLLBACK_SAFE.sql
    3da7ad52ae8b7bb9f4c0817f4dd88a82414b38c01428d7cb018eb181bc0a44d1  docs/production/merchants_private_ROLLBACK_REPUBLISH.sql
    73c7aec13199997daeef08361939be1c6b144836caae12830f686a7ec8cf431c  supabase/migrations/20261029120000_merchants_private_details.sql
    2622d559d09659d48f442a9db29c8560f46770da31376989ce9c426470fe0955  docs/recette/scenarios_reduced.mjs
    4d6327397c423b21d7fb95d3cbfa675ba3cbb83f588665ae73964c09a8be1236  docs/recette/ui_old_app_reduced.mjs
    09d8e1a4ab673354f5cd1e2345a87a0b207539532230db42552ea3eca893372b  scripts/localdb/recette_reduced.sh
