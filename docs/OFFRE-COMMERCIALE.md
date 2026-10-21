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
| Campagne marketing mensuelle | **manquant** | file de campagnes à l'anniversaire du premier paiement Pro, consentement obligatoire, validation humaine et programmation par l'équipe (3 par jour), historique et échecs | `enqueue_due_marketing_campaigns` (pg_cron), RPC `admin_*` | pgTAP `marketing` |
| Livreur Start : missions classiques | existant | une course à la fois, hors nuit | `courier_capacity`, `courier_can_deliver_at` | pgTAP `plans` |
| Livreur Pro : plusieurs courses, nuit | **manquant** | jusqu'à 2 courses groupées compatibles ; livraison de nuit (22 h – 6 h, Paris) | idem + `missions_compatible` | pgTAP `plans`, `grouped_deliveries` |
| Facturation | existant (3 prix) | 4 prix (livreur Start/Pro), changement de formule sur l'abonnement existant (prorata), garde anti-double abonnement y compris impayé et retard de webhook | fonction `billing`, webhook | revue + build (non testé contre Stripe) |

## Décisions (arbitrées)

| Sujet | Décision | Application |
|---|---|---|
| Campagne et essai | **Contractuelle après le premier paiement**, jamais pendant l'essai | `merchant_marketing_eligible` exige un abonnement Pro `active` avec `first_paid_at` (daté par déclencheur au premier passage à « actif ») ; cycles = anniversaire du premier paiement, y compris abonnement annuel |
| Livraison de nuit | **Validé : 22 h – 6 h, heure de Paris** | `is_night_delivery`, `courier_can_deliver_at` |
| Deux courses simultanées (Pro) | **Validé pour la V1** (Start : une) | `courier_capacity` |
| Impayé | **Suspension des droits, conservation des données** | seuls `trialing` / `active` ouvrent des droits ; rien n'est supprimé |
| Précommandes | **Toujours dans le fuseau de l'établissement** (`merchants.timezone`) | base : `is_merchant_open`, `is_in_slot`, `active_happy_hours` ; app : `src/lib/zone.ts`, créneaux et affichages (panier, commande, restaurant) |
| Publication marketing | **Validation humaine obligatoire** | contrainte `CHECK` : pas de campagne programmée/publiée/en échec sans `reviewed_by` ; texte validé non modifiable par l'établissement ; aucune connexion automatique aux réseaux |

Autres choix : sans consentement (`merchants.marketing_consent`), aucune campagne n'est créée ; l'équipe enregistre le
résultat de chaque publication (5 tentatives au plus) ; `platform_admins` n'est alimentée par aucune migration
(`insert into public.platform_admins (user_id) select id from auth.users where email = '…';` dans le SQL Editor) ;
une précommande est acceptée par le restaurant sous 10 minutes comme toute commande, puis « prête à l'heure choisie ».
Limite connue : un premier « actif » à 0 € (code promo intégral) compterait comme premier paiement.

## Reste à faire (hors code)

1. Créer ou vérifier dans Stripe les 4 produits / 8 prix et renseigner leurs identifiants (secrets de fonctions) :
   **aucun prix n'a été créé ni modifié**.
2. Vérifier la configuration du portail client Stripe (changement de formule fait par l'app, pas par le portail).
3. Désigner les administrateurs ZeeRoo (SQL ci-dessus).
4. Si une publication automatique est voulue : choisir les plateformes, créer les applications et jetons.
5. La vitrine présente encore l'ancienne grille : à mettre à jour après le déploiement de cette version.
