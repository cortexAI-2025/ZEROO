# Maquette cliquable Zéroo

**`zeroo-maquette.html`** : un seul fichier HTML autonome, à ouvrir dans n'importe quel navigateur (double-clic, aucune installation). Il présente les trois espaces côte à côte, dans des cadres de téléphone ; sur petit écran, des boutons Client / Restaurant / Livreur passent de l'un à l'autre.

| Espace | Parcours cliquable |
|---|---|
| Client | Accueil et catégories → restaurant et carte → panier (retrait ou livraison) → paiement → suivi de commande (code de retrait 4821, « Je pars maintenant ») → fidélité (9 menus, le 10e offert) |
| Restaurant | Commandes en temps réel (nouvelles → en cuisine → prêtes → remises), pause, carte (disponible / épuisé), abonnement 30 € TTC par mois |
| Livreur | Disponibilité, courses proposées → récupération → validation avec le code du client (4821), revenus, restaurants rattachés, abonnement |

Les restaurants, plats, prix, clients et adresses sont **fictifs**. Chaque ouverture du fichier repart de l'état initial. Sans connexion, la police Plus Jakarta Sans est remplacée par celle du système.

## Modifier la maquette

- Écrans : `src/Main.dc.html` (client), `src/Pro.dc.html` (restaurant), `src/Livreur.dc.html` (livreur). Chaque fichier contient le gabarit HTML (`{{…}}`, `<sc-if>`, `<sc-for>`) et la logique de l'écran (`class Component`).
- Régénérer le fichier autonome : `python3 docs/maquette/build.py` (Python 3, sans dépendance). Les logos viennent de `assets/images/`.
