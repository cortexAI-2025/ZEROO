# Recette en production — scénario pas à pas

À exécuter par le propriétaire sur `https://app.zeeroo.fr`, après les prérequis. Cocher chaque case et noter la date, l'heure et le résultat. Ne jamais coller de clé ou de secret dans ce document.

## 0. Prérequis (bloquants)
- [ ] `scripts/deploy-production.sh --dry-run` : les 13 secrets de la liste sont « présent » (dont `STRIPE_PRICE_*` x8, `STRIPE_TAX_RATE_ID`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY` du **même compte** Stripe que les prix).
- [ ] Fonctions déployées depuis `main` (`scripts/deploy-production.sh`), puis `scripts/verify-production.sql` exécuté dans le SQL Editor (lecture seule) sans anomalie.
- [ ] Webhook Stripe créé (4 événements) ; portail client Stripe activé.
- [ ] Un code promotionnel **100 % de réduction, une seule utilisation** créé dans Stripe (coupon 100 % « une fois », puis code promotionnel) : il évite tout débit réel. Le Checkout de l'app accepte les codes promotionnels.
- [ ] Trois comptes distincts avec trois adresses e-mail (client, restaurant, livreur), plus le compte administrateur. Navigateurs ou fenêtres de navigation privée séparés.
- Règle : aucun paiement réel. Le client « paie » directement le restaurant : pour la recette, choisir **espèces** ou ne pas régler le lien de paiement.

## 1. Inscription et connexion (3 comptes)
Pour chaque compte (client, restaurant, livreur) :
- [ ] Inscription sur `/sign-up`, e-mail de confirmation reçu, lien ouvert, retour dans l'app (`/auth-callback`).
- [ ] Déconnexion, reconnexion, « Mot de passe oublié » : e-mail reçu, nouveau mot de passe via `/update-password`.
- [ ] Mot de passe de moins de 8 caractères refusé (si le réglage Supabase a été appliqué).
- [ ] Ouverture de l'espace voulu (`/choose-space`) : le compte restaurant arrive dans `/pro`, le livreur dans `/livreur`, le client dans l'explorateur.

## 2. Restaurant : mise en place et abonnement d'essai
Compte restaurant, dans `/pro` :
- [ ] Onboarding : nom, adresse, horaires, mode retrait ; lien de paiement saisi (ou espèces uniquement).
- [ ] Créer 1 catégorie et 2 produits.
- [ ] Onglet Abonnement (`/pro/stripe`) : **Start mensuel**. Stripe Checkout s'ouvre avec le prix **19,99 € HT + TVA 20 % = 23,99 € TTC**. Saisir le code 100 %. Le Checkout peut demander une carte pour l'essai : utiliser une vraie carte du propriétaire, sans débit tant que l'essai de 30 jours court.
- [ ] Retour dans l'app : l'abonnement apparaît « essai en cours » ; les fonctions Start sont actives.
- [ ] Contrôle SQL (SQL Editor) : une ligne `subscriptions` en `trialing` pour ce compte, une seule. Dans Stripe : un seul abonnement pour ce client.
- [ ] **Anti-doublon** : relancer « S'abonner » ; l'app ne doit pas créer un second abonnement.
- [ ] Droits Pro refusés en Start : Happy Hours, précommandes, commandes groupées, statistiques avancées, campagne marketing sont verrouillés ou masqués.
- [ ] Changement de formule vers **Pro** (action « changer ») : l'abonnement existant est modifié (prorata), aucun second abonnement ; les fonctions Pro se débloquent. Revenir sur Start ensuite.
- Limite connue : un premier « actif » à 0 € (code 100 %, sans essai) compterait comme premier paiement pour la campagne marketing contractuelle. Ne pas en tirer de conclusion de facturation.

## 3. Click & Collect (client, restaurant)
- [ ] Client : trouver le restaurant sur `/decouvrir` (annuaire public, sans compte) puis ouvrir sa page `/m/<slug>`.
- [ ] **Publication réservée aux affiliés** : un professionnel sans abonnement actif voit l'interrupteur de publication désactivé avec l'explication ; une fiche non affiliée n'apparaît ni dans l'annuaire de l'app ni pour un client connecté.
- [ ] Abonnement résilié ou impayé (Stripe) : la fiche quitte l'annuaire mais reste dans le tableau de bord ; après régularisation, le professionnel la republie sans ressaisir ses données.
- [ ] Un client connecté ne voit que des établissements affiliés sur l'annuaire de l'app (« Commander » toujours disponible) ; les commerces de Trappes non inscrits restent sur zeeroo.fr avec « Pas encore sur ZeeRoo ».
- [ ] Ajouter un produit au panier, commander en **retrait**, paiement **espèces**.
- [ ] Restaurant : notification et commande reçue dans `/pro`, **accepter**, indiquer l'heure de préparation.
- [ ] Client : suivi sur `/order/<id>` ; commande « prête » ; **code de retrait** affiché.
- [ ] Restaurant : saisir le code, marquer remis ; le paiement espèces est confirmé au retrait.
- [ ] Refus : refaire une commande et la **refuser** : le client est prévenu, aucun paiement déclaré.
- [ ] Expiration : laisser une commande sans réponse ; elle expire au bout du délai prévu et le client est prévenu.

## 4. Livraison (client, restaurant, livreur)
- [ ] Livreur : onboarding `/livreur/onboarding`, abonnement **Livreur Start** (14,99 € HT) avec le code 100 % ; se rattacher au restaurant, restaurant approuve le rattachement.
- [ ] Livreur : se mettre « disponible » ; il doit apparaître disponible côté restaurant.
- [ ] Restaurant : activer la livraison (`/pro/delivery`) ; client commande en **livraison** avec une adresse réelle.
- [ ] Restaurant accepte ; le livreur reçoit « Nouvelle mission » ; il l'accepte (le premier qui accepte la prend).
- [ ] Client : le nom du livreur s'affiche ; paiement de la livraison en **espèces** ; le client voit le code de livraison.
- [ ] Restaurant marque « prête » ; livreur « en route » puis remise avec le **code de livraison** ; la confirmation d'encaissement de la livraison vient du livreur seul.
- [ ] Livreur Start : une seule course à la fois ; au-delà, refus de la 2e. Pour tester Pro (2 courses, livraison de nuit 22 h – 6 h Paris), passer le livreur en Pro.
- [ ] **Refus après acceptation par un livreur** : le livreur est libéré, notifié « Course annulée », et peut prendre une autre mission.

## 5. Restaurant Pro : fonctions avancées
Avec le restaurant en Pro :
- [ ] Happy Hour : créer une plage ; le prix réduit s'applique dans la fenêtre, pas en dehors.
- [ ] Précommande : le client choisit un créneau (heure de Paris, quarts d'heure) ; commande créée « programmée » ; la mission de livraison n'apparaît au livreur que **45 minutes avant**.
- [ ] Commande groupée entreprise : un lien, plusieurs participants, une seule commande.
- [ ] Statistiques avancées (`/pro/stats`) : chiffres cohérents avec les commandes passées.
- [ ] Mini-site (`/pro/minisite`) et QR (`/pro/qr`) : le QR ouvre `https://app.zeeroo.fr/m/<slug>` ; **un ancien QR** (ancien lien) redirige encore vers le bon restaurant.
- [ ] Retour en Start : les réglages Pro sont conservés en base mais masqués côté public.

## 6. Campagne marketing et administration
- [ ] Restaurant Pro : la campagne contractuelle n'est proposée **qu'après le premier paiement** (pas pendant l'essai).
- [ ] Compte administrateur : ouvrir `/admin`. Une campagne en attente est visible ; elle ne part **qu'après validation humaine** par l'administrateur.
- [ ] Un compte non administrateur n'accède pas à `/admin`.

## 7. Abonnement : impayé, résiliation, webhook
- [ ] Portail client (lien dans l'app) : changer de carte, voir les factures, résilier. Après résiliation, les droits payants cessent à la fin de la période, **les données sont conservées**.
- [ ] Impayé : dans Stripe, mettre un abonnement de test en échec de paiement (carte de test impossible en live : utiliser une période d'essai qui se termine sans moyen de paiement valide, ou simuler dans un compte de test). Attendu : droits suspendus, données conservées, aucune suppression.
- [ ] Webhook : dans Stripe, le endpoint affiche des livraisons **200** sur les événements ci-dessus ; un rejeu d'un même événement ne crée pas de doublon (table `stripe_events`).
- [ ] Les montants des commandes ne transitent **jamais** par Stripe : seul l'abonnement y figure.

## 8. Sécurité et confidentialité
- [ ] Une dark kitchen (livraison uniquement) : son **adresse n'apparaît ni sur `/decouvrir`, ni dans la page publique, ni dans les réponses de l'API publique** ; elle n'est donnée qu'au livreur affecté.
- [ ] Un client ne voit pas les commandes d'un autre ; un restaurant ne voit pas celles d'un autre restaurant.
- [ ] **Annuaire public des pros** : aucune ligne n'affiche de SIREN ni de SIRET (ni dans un lien) ; la recherche par numéro ne retrouve rien ; `GET /rest/v1/directory_businesses` en anonyme est refusé. Le SIRET saisi à l'inscription d'un professionnel est bien conservé.
- [ ] Les identités publiques des commerçants (SIRET, TVA, e-mail de contact, raison sociale, téléphone) sont publiques **par décision du propriétaire**.
- [ ] Anciens liens profonds `zeroo://` toujours ouverts par l'application mobile.

## 9. Fin de recette
- [ ] Supprimer ou désactiver les comptes et données de test (sans toucher aux données réelles) ; archiver le code promotionnel 100 %.
- [ ] Conserver les preuves : SHA du déploiement, date des tests, captures des écrans clés, versions des fonctions (`list_edge_functions`).
- [ ] Consigner le résultat dans `docs/PRODUCTION-READINESS-2026-10-24.md` (cases cochées, anomalies, décision de lancement).

## Anomalies
Pour chaque écart : écran, heure, compte utilisé, résultat attendu / obtenu, capture. Ne pas publier la vitrine avant que les sections 2 à 4 soient validées.
