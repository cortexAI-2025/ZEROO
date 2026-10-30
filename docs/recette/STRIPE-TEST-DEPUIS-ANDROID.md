# Test Stripe réel (mode test) depuis Android — sans installer d'outil sur le téléphone

**Principe** : le test tourne dans un environnement distant (GitHub Codespaces) qui dispose de Docker, Node, Deno et Stripe CLI ; vous ne faites que le piloter depuis le navigateur du téléphone. **Votre clé Stripe de test n'est jamais écrite dans une conversation ni dans le dépôt** : elle est stockée comme *secret Codespaces* et exposée au script par variable d'environnement.
Ce que fait le test, et ses garanties : en-tête de `scripts/localdb/recette_stripe_cli.sh`. Base et API : **locales au Codespace** (aucune production Supabase). Côté Stripe : **uniquement des objets de test**.

## Avant de commencer (5 minutes)
1. **Clé de test restreinte (recommandé)** : Stripe > Développeurs > Clés API > *Créer une clé restreinte* **en mode test** (bascule « Mode test » active). Autorisations en écriture : Produits, Prix, Clients, Abonnements, Méthodes de paiement (PaymentMethods), Sessions Checkout ; en lecture : Événements, Solde (Balance). Évitez la clé secrète standard si possible. Ne l'envoyez à personne (ni à l'assistant).
2. **Secret Codespaces** : github.com > Settings > Codespaces > *New secret* : nom `STRIPE_TEST_SECRET_KEY`, valeur = la clé, **accès limité au dépôt `cortexAI-2025/ZEROO`**.

## Lancer le test
1. Sur le dépôt `cortexAI-2025/ZEROO`, branche `ccr-cbee9612-jsmce8-merchants-privacy` : **Code > Codespaces > ⋯ > New with options** ; configuration de dev container : **« ZEEROO — recette Stripe en mode test »** ; machine 4 cœurs ou plus. (Interface « version ordinateur » du navigateur conseillée sur le téléphone.)
2. Dans le terminal du Codespace :
   ```bash
   scripts/localdb/recette_stripe_cli.sh --check        # outils présents, clé de TEST détectée (aucune écriture)
   scripts/localdb/recette_stripe_cli.sh --check-key    # vérifie auprès de Stripe que le compte est en mode test (lecture seule)
   scripts/localdb/recette_stripe_cli.sh --yes ~/preuves-stripe   # le test (crée puis nettoie des objets de test)
   ```
   Durée : environ 10 minutes (téléchargement des images Docker, démarrage de la pile). Le script s'arrête de lui-même si une garantie n'est pas satisfaite.
3. Récupérez `~/preuves-stripe/` (clic droit > Télécharger) : journaux déjà **filtrés** (clés, secrets de webhook et jetons masqués). Relisez-les avant de les partager.

## Après le test
- Supprimez le Codespace (github.com/codespaces) et le secret Codespaces ; révoquez la clé restreinte dans Stripe si elle ne sert plus.
- Les objets de test créés (produit, prix, client, abonnement) sont désactivés/supprimés par le script ; vous pouvez le vérifier dans le tableau de bord Stripe (mode test).
- Le modèle `.devcontainer/stripe-recette/` n'a **pas pu être testé** par l'assistant (pas d'accès à Codespaces ni à Stripe) : si l'installation échoue, copiez l'erreur (sans clé) et dites-le.

## Autre option (non recommandée sans décision explicite)
Autoriser `api.stripe.com` dans la politique réseau de l'environnement de l'assistant et lui fournir la clé comme secret d'environnement : l'assistant pourrait alors lancer le test lui-même. Cela place une clé (même de test) dans un environnement de travail partagé : à n'envisager que sur décision du propriétaire.
