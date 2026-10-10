# Zéroo face à Uber Eats, Deliveroo et les plateformes sans commission

> Document de travail. Les prix des concurrents sont ceux relevés au moment de la rédaction : **à revérifier sur leurs sites avant toute diffusion** (les offres et contrats changent).

Le principal avantage de Zéroo est de réunir une marketplace multi-restaurants, un réseau de livreurs indépendants et des abonnements fixes sans commission.

## Grille tarifaire retenue

| Profil | Mensuel HT | Annuel HT |
|---|---|---|
| Restaurant Start | 9,99 € | 99,99 € |
| Restaurant Pro | 19,99 € | 199,99 € |
| Livreur, formule unique | 9,99 € | 99,99 € |
| Client | Gratuit | Gratuit |

TVA 20 % en plus (TTC : 11,99 € et 119,99 € pour Start et Livreur, 23,99 € et 239,99 € pour Pro).

Seuls les **abonnements** Zéroo sont facturés par Zéroo, via Stripe. Les restaurants encaissent directement leurs commandes et les livreurs leurs courses, sur leur propre compte (Stripe Connect) : Zéroo n'encaisse jamais l'argent des commandes. Le contenu de la formule Pro par rapport à Start reste à définir.

## 1. Comparatif des tarifs en France

| Plateforme | Abonnement restaurant | Commission sur ventes |
|---|---|---|
| Uber Eats | Selon offre et contrat | Variable, jusqu'à 30–33 % selon les offres relevées |
| Deliveroo | Selon contrat | Négociée contractuellement |
| Click & Croque | Dès 29 € HT/mois | 0 % |
| EatOS | 49 € HT/mois | 0 % |
| Click Eat | 59 € HT/mois | 0 % |
| Zéroo Start | 9,99 € HT/mois | 0 % |
| Zéroo Pro | 19,99 € HT/mois | 0 % |

Les prix des trois logiciels sans commission sont ceux de leurs sites officiels. Pour Uber Eats, les frais varient selon le marché et le contrat ; Deliveroo ne publie pas de grille française universelle.

## 2. Coût annuel pour un restaurant

À l'année, Zéroo Start est environ 71 % moins cher que Click & Croque (99,99 € contre 348 € HT), et Zéroo Pro environ 66 % moins cher qu'EatOS (199,99 € contre 588 € HT).

Attention : Click Eat inclut des intégrations de caisse et de livraison avec des partenaires, et EatOS propose notamment une gestion de cuisine et des outils marketing. Ces fonctionnalités ne sont pas automatiquement équivalentes à celles de Zéroo.

## 3. Comparaison sur 100 commandes par mois

Hypothèse : panier moyen de 25 €, soit 2 500 € de ventes mensuelles.

| Solution | Coût mensuel simulé |
|---|---|
| Uber Eats à 30 % | 750 € |
| Deliveroo à 25 % (hypothèse) | 625 € |
| Click & Croque | 29 € |
| EatOS | 49 € |
| Click Eat | 59 € |
| Zéroo Start annuel | 8,33 € équivalent/mois |
| Zéroo Pro annuel | 16,67 € équivalent/mois |

Ces montants comparent uniquement commission ou abonnement. Ils n'incluent pas les frais bancaires, les coûts de livraison, la publicité ni les différences de trafic apporté. Pour Deliveroo, 25 % est une hypothèse et non un tarif confirmé.

## 4. Comparaison des fonctionnalités

| Fonctionnalité | Uber / Deliveroo | Click & Croque / EatOS / Click Eat | Zéroo prévu |
|---|---|---|---|
| Marketplace multi-restaurants | Oui | Non, principalement boutiques propres | Oui |
| Commission 0 % | Non, généralement | Oui | Oui |
| Click & collect | Oui | Oui | Oui |
| Livraison | Oui | Oui, selon solution | Oui |
| Réseau propre de livreurs inscrits | Oui | Non, généralement | À développer |
| Abonnement livreur | Pas le modèle habituel | Non applicable | 9,99 € HT/mois |
| Encaissement direct restaurant | Selon dispositif | Oui, selon solution | Oui |
| Fidélité | Selon offre | Selon offre | Prévue |

## 5. Le point différenciant : les livreurs

Les plateformes comme Uber Eats et Deliveroo rémunèrent les livreurs à la course sans leur imposer le modèle d'abonnement de Zéroo.

Avec Zéroo, un livreur paierait 99,99 € HT par an pour accéder aux missions et conserver la rémunération intégrale convenue pour chaque livraison, hors ses propres charges.

Ce modèle peut être attractif pour un livreur très actif, mais constitue une barrière à l'entrée pour un débutant. Il faudra donc garantir un volume de missions suffisant et ne pas présenter l'abonnement comme une garantie de revenus.

## 6. Positionnement concurrentiel recommandé

> **La marketplace sans commission, accessible dès 99,99 € HT/an.**
> Une seule plateforme pour commander, vendre et livrer. Les professionnels encaissent directement leurs prestations, et Zéroo se rémunère par abonnement.

Analyse : Zéroo possède un avantage tarifaire très important face aux cinq concurrents comparés. En revanche, il n'aura un avantage commercial réel que si les clients trouvent suffisamment de restaurants et si les livreurs reçoivent régulièrement des courses.

Conserver cette grille de prix pour le lancement. La priorité est maintenant de développer le réseau local et de sécuriser techniquement le paiement direct du restaurant et du livreur sur une même commande, sans que Zéroo détienne les fonds.
