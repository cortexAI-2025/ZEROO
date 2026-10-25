# Démo cliquable ZeeRoo

**`zeeroo-demo.html`** : un seul fichier HTML autonome, à ouvrir dans n'importe quel navigateur. Les trois téléphones (client, restaurant, livreur) partagent la même commande : ce qui est fait sur l'un apparaît aussitôt sur les autres. Sur petit écran, des onglets passent de l'un à l'autre. C'est la référence des écrans de l'application.

| Espace | Ce que montre la démo |
|---|---|
| Client | Onglets **À proximité** (annuaire : recherche, liste ou carte, filtres Ouvert maintenant / Retrait / Livraison disponible / Happy Hour, dark kitchen sans adresse), **Commandes**, **Fidélité** (9 menus, le 10e offert) et **Compte** (e-mail confirmé, adresses, favoris, notifications). Menu avec options et prix Happy Hour, panier (retrait ou livraison, « Dès que possible » ou créneau programmé, carte ou espèces), paiement du repas puis de la livraison quand un livreur accepte (le client paie, le professionnel confirme), suivi et codes, avis. |
| Restaurant | Commandes en direct (accepter, refuser, prête, remise avec code, commandes programmées), Menu, Activité (ventes, meilleurs produits, avis ; heures de pointe en Pro), Boutique (informations, horaires, fermetures, livraison, livreurs, lien de paiement, QR code, paniers anti-gaspi ; **Happy Hours, mini-site, commandes groupées, campagne mensuelle réservés à la formule Pro**, avec verrous et passage Start ↔ Pro) et Compte. |
| Livreur | Courses (missions proposées à tous, le premier qui accepte la prend ; **une course à la fois en Start, jusqu'à 2 en Pro, livraisons de nuit en Pro**), Restaurants (demandes de rattachement), Revenus (7 jours, carte / espèces, 0 % de commission, historique avec notes), Compte (note, entreprise, véhicule, documents, abonnement Start ou Pro). |

Les données sont fictives et la démo repart de zéro à chaque ouverture. Des boutons « Simuler » montrent les cas limites : un autre livreur plus rapide, 2 livraisons déjà en cours, délai de paiement dépassé.

## Modifier la démo

Sources dans `src/` : `head.html` (styles et squelette), `app1.js` (état, composants, client), `app2.js` (restaurant), `appc.js` (tableau de bord client), `app3.js` (livreur, actions, rendu). Puis : `python3 docs/maquette/build.py`.
