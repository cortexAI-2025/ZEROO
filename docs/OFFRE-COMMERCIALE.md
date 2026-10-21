# Offre commerciale ZeeRoo : ce qui est appliqué, où, et ce qui reste

Document de référence de la gamme (octobre 2026). Les droits sont **appliqués par la base de données** ;
l'application ne fait qu'afficher (cadenas, invitations à passer en Pro). Un abonnement n'ouvre ses droits
qu'en essai (`trialing`) ou actif (`active`) : impayé, résilié ou expiré, les droits cessent et **aucune
donnée n'est supprimée**.

## Gamme

| | Start | Pro |
|---|---|---|
| Établissement, HT | 19,99 €/mois · 199,99 €/an | 29,99 €/mois · 299,99 €/an |
| Livreur, HT | 14,99 €/mois · 149,99 €/an | 24,99 €/mois · 249,99 €/an |
| Essai gratuit | 30 jours | 30 jours |

Un abonnement = un établissement (pas de multisite) ou un livreur. Aucune commission : les repas et les
courses sont payés directement aux professionnels ; ZeeRoo ne facture que ses abonnements (Stripe).

## Audit : fonction par fonction

| Fonction | État avant | Fait | Appliqué par | Testé |
|---|---|---|---|---|
| Click & Collect, QR, fidélité | existant | inchangé | — | existants |
| Livraison en Start | réservée à Pro | ouverte à Start et Pro (abonnement valide) ; le réglage n'est plus coupé au changement de formule | `has_delivery_option`, `merchant_delivery_quote`, `create_order` | pgTAP `plans`, `dashboards`, `order_modes` |
| Précommandes programmées | **manquant** | créneaux de 15 min sur 14 jours, horaires/fermetures/créneaux de menu vérifiés à l'heure choisie, Happy Hour calculée à cette heure, mission visible 45 min avant | `create_order(p_scheduled_for)`, `available_missions`, `courier_accept_mission` | pgTAP `scheduled_orders`, jest `schedule`, e2e `schedule.mock` |
| Paniers anti-gaspi | existant (Start+Pro) | inchangé | — | pgTAP `baskets` |
| Happy Hours | existant (tous) | **Pro seulement** ; hors Pro, offres conservées mais inactives | `save_happy_hour`, `active_happy_hours` | pgTAP `plans` |
| Mini-site dans l'annuaire | existant (Pro) | inchangé | `has_minisite` | pgTAP `minisite` |
| Statistiques avancées | partiel (stats de base) | Start : 7 jours ; Pro : période étendue + heures de pointe, clients fidèles, modes, Happy Hour | `merchant_advanced_stats`, `merchant_sales_by_day`, `merchant_top_items` | pgTAP `advanced_stats`, `plans` |
| Commandes groupées entreprises | **manquant** | précommande + entreprise + convives, délai/effectif/montant minimaux réglés par l'établissement ; payée directement, sans facturation ZeeRoo | `create_order(p_group)`, `merchants.group_*` | pgTAP `scheduled_orders` |
| Campagne marketing mensuelle | **manquant** | file de campagnes à la date anniversaire de l'abonnement Pro, consentement obligatoire, validation et programmation par l'équipe (3 par jour), historique et échecs | `enqueue_due_marketing_campaigns` (pg_cron), RPC `admin_*` | pgTAP `marketing` |
| Livreur Start : missions classiques | existant | une course à la fois, hors nuit | `courier_capacity`, `courier_can_deliver_at` | pgTAP `plans` |
| Livreur Pro : plusieurs courses, nuit | **manquant** | jusqu'à 2 courses groupées compatibles ; livraison de nuit (22 h – 6 h, Paris) | idem + `missions_compatible` | pgTAP `plans`, `grouped_deliveries` |
| Facturation | existant (3 prix) | 4 prix (livreur Start/Pro), changement de formule sur l'abonnement existant (prorata), garde anti-double abonnement y compris impayé et retard de webhook | fonction `billing`, webhook | revue + build (non testé contre Stripe) |

## Décisions prises (à valider)

- **Campagne et essai** : la première campagne est créée à l'ouverture de l'abonnement (essai compris), puis
  chaque mois à la date anniversaire, y compris pour un abonnement annuel. Sans consentement
  (`merchants.marketing_consent`), rien n'est créé : le nom et la photo ne sont jamais publiés sans accord.
- **Pas de publication automatique** : aucune connexion à un réseau social n'est configurée. L'équipe
  enregistre le résultat de chaque publication (réussie ou en échec, 5 tentatives au plus). Un futur
  connecteur écrira dans la même table d'historique.
- **Administrateurs** : table `platform_admins`, **aucune ligne créée par migration**. Ajout manuel, par exemple
  `insert into public.platform_admins (user_id) select id from auth.users where email = '…';` (SQL Editor).
- **Précommande** : acceptation du restaurant sous 10 minutes comme toute commande ; une fois acceptée, la
  commande est « prête à l'heure choisie ». Heure de l'appareil supposée égale à celle de l'établissement.
- **Nuit** : 22 h – 6 h, heure de Paris, évaluée sur l'heure de préparation prévue. Un établissement dont
  seuls des livreurs Start sont rattachés n'a pas de livraison la nuit.
- **Impayé** : pas de période de grâce ; les droits cessent dès que le statut n'est plus essai/actif.

## Reste à faire (hors code)

1. Créer ou vérifier dans Stripe les 4 produits / 8 prix et renseigner leurs identifiants (secrets de fonctions) :
   **aucun prix n'a été créé ni modifié**.
2. Vérifier la configuration du portail client Stripe (changement de formule fait par l'app, pas par le portail).
3. Désigner les administrateurs ZeeRoo (SQL ci-dessus).
4. Si une publication automatique est voulue : choisir les plateformes, créer les applications et jetons.
5. La vitrine présente encore l'ancienne grille : à mettre à jour après le déploiement de cette version.
