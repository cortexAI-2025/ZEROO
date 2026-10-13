# Démo cliquable ZeeRoo

**`zeeroo-demo.html`** : un seul fichier HTML autonome, à ouvrir dans n'importe quel navigateur. Les trois téléphones (client, restaurant, livreur) partagent la même commande : ce qui est fait sur l'un apparaît aussitôt sur les autres. Sur petit écran, des onglets passent de l'un à l'autre. C'est la référence des écrans de l'application.

| Espace | Ce que montre la démo |
|---|---|
| Client | Restaurants (note, favoris), menu avec options, panier (retrait ou livraison, carte ou espèces), paiement du repas, puis de la livraison quand un livreur accepte, suivi et codes, avis (restaurant et livreur). Onglets Commandes (historique, facture, commander à nouveau) et Profil (fidélité, informations, adresses, paiement, favoris, notifications). |
| Restaurant | Commandes en direct (accepter, refuser, prête, remise avec code), Menu (catégories, produits, options, ruptures), Activité (ventes, meilleurs produits, note et avis), Boutique (entreprise : raison sociale, SIRET, TVA ; horaires ; livraison ; livreurs ; paiements ; abonnement Start ou Pro avec l'option livraison). |
| Livreur | Missions proposées à tous (le premier qui accepte la prend, 2 livraisons au plus), délai de paiement de 5 minutes, codes de retrait et de livraison, espèces. Revenus (7 jours, carte / espèces, 0 % de commission), historique avec notes, profil (note, entreprise, véhicule, documents, abonnement, restaurants). |

Les données sont fictives et la démo repart de zéro à chaque ouverture. Des boutons « Simuler » montrent les cas limites : un autre livreur plus rapide, 2 livraisons déjà en cours, délai de paiement dépassé.

## Modifier la démo

Sources dans `src/` : `head.html` (styles et squelette), `app1.js` (état, composants, client), `app2.js` (restaurant), `appc.js` (tableau de bord client), `app3.js` (livreur, actions, rendu). Puis : `python3 docs/maquette/build.py`.
