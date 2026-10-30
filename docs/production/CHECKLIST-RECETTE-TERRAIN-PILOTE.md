# Checklist de recette terrain — premier restaurateur pilote

À exécuter par le propriétaire sur `https://app.zeeroo.fr` (et `https://admin.zeeroo.fr` pour la partie administration). Version courte, pour un premier restaurateur. La recette complète reste dans `docs/RECETTE.md`.

Cocher chaque case, noter la date, l'heure (UTC) et le résultat. Ne jamais coller un mot de passe, une clé ou un secret dans ce document.

## 0. Règles du test

- [ ] Le restaurateur pilote est **informé et d'accord** avant chaque commande de test qui le concerne.
- [ ] **Aucun paiement réel.** Le client règle en **espèces** au retrait ou à la livraison. Le lien de paiement du restaurant n'est pas utilisé pendant la recette.
- [ ] Les commandes de test sont **annulées ou remises** à la fin, et leur note indique « test ». Ne pas laisser une commande de test en file de préparation.
- [ ] Trois comptes distincts et une adresse e-mail par compte : client, restaurateur, administrateur. Navigateurs ou fenêtres de navigation privée séparés.

## 1. Bloquants à lever avant la recette

Ces quatre points restent à faire sur l'environnement réel. Tant qu'ils ne sont pas cochés, ne pas ouvrir la recette au restaurateur pilote.

- [ ] **Sécurité de `create-order`** : une requête `POST` sans jeton sur `https://rgxesocsvhgsqoehxhgt.supabase.co/functions/v1/create-order` répond **401**. Relevé : code HTTP ____.
- [ ] **Prix falsifié refusé** : avec un compte client, modifier le prix annoncé d'une ligne dans l'outil de développement du navigateur, puis valider. Attendu : message dédié (code `price_changed`), jamais l'erreur générique. Commande non créée.
- [ ] **Connexions** sur les vrais sites : restaurateur sur `app.zeeroo.fr`, administrateur sur `admin.zeeroo.fr`. Un compte non administrateur n'accède pas à l'administration.
- [ ] **Protection des mots de passe compromis** activée dans le tableau de bord Supabase (Authentication). Capture ou date d'activation : ____.

## 2. Inscription et connexion (restaurateur)

- [ ] Inscription sur `/sign-up` avec l'adresse du restaurateur pilote ; e-mail de confirmation reçu ; lien ouvert ; retour dans l'app.
- [ ] Déconnexion puis reconnexion.
- [ ] « Mot de passe oublié » : e-mail reçu, nouveau mot de passe défini.
- [ ] Le compte arrive dans l'espace restaurateur (`/pro`), pas dans l'espace client.

## 3. Mise en place du restaurant

- [ ] Onboarding : nom, adresse, horaires, mode de retrait.
- [ ] Moyen d'encaissement : espèces au comptoir (ou lien de paiement, sans l'utiliser pour la recette).
- [ ] Créer 1 catégorie et 2 produits, dont un avec une option.
- [ ] Vérifier avec le restaurateur que les prix, les noms et les descriptions sont exacts avant toute publication.

## 4. Abonnement et publication

- [ ] **Publication refusée sans abonnement** : avant d'avoir un abonnement actif, l'interrupteur de publication est désactivé avec une explication. La fiche n'apparaît pas dans l'annuaire de l'application.
- [ ] Abonnement Start souscrit (`/pro/stripe`). Le restaurateur a accepté le prix affiché : 19,99 € HT, soit 23,99 € TTC avec TVA. Carte du restaurateur (essai de 30 jours) : aucun débit pendant l'essai.
- [ ] **Anti-doublon** : relancer « S'abonner » ne crée pas un second abonnement (contrôle dans Stripe : un seul abonnement).
- [ ] Publication de la fiche : elle apparaît dans l'annuaire de l'application pour un client connecté, et sur `/m/<slug>`.
- [ ] Le QR code de la fiche ouvre `https://app.zeeroo.fr/m/<slug>`.

## 5. Commande client en retrait (cœur du pilote)

- [ ] Client : trouver le restaurant sur `/decouvrir`, ouvrir sa fiche, ajouter un produit au panier.
- [ ] Commander en **retrait**, paiement **espèces**. La commande est envoyée.
- [ ] Restaurateur : la commande apparaît dans `/pro` (notification sonore ou visuelle) ; **accepter** et indiquer l'heure de préparation.
- [ ] Client : le suivi sur `/order/<id>` passe à « en préparation » puis « prête ». Le **code de retrait** est affiché.
- [ ] Restaurateur : saisir le code et marquer la commande **remise**. Le paiement espèces est confirmé.
- [ ] Refus : une seconde commande de test est **refusée** par le restaurateur. Le client est prévenu, aucun paiement déclaré.
- [ ] Expiration (optionnel) : une commande laissée sans réponse expire, et le client est prévenu.

## 6. Livraison (seulement si le pilote la propose)

- [ ] Adresse de livraison réelle du testeur. La dark kitchen, si elle existe, n'apparaît sur aucune page publique.
- [ ] Commande en livraison, paiement espèces. Restaurateur accepte ; un livreur test reçoit la mission et l'accepte.
- [ ] Le client voit le nom du livreur et le **code de livraison**. Le livreur remet la commande avec ce code.

## 7. Sécurité minimale

- [ ] Le client ne voit jamais les commandes d'un autre client ; le restaurateur ne voit que les siennes.
- [ ] L'annuaire public n'affiche ni SIREN ni SIRET. La recherche par numéro ne retrouve rien.
- [ ] Un compte administrateur n'est pas partagé avec le restaurateur.

## 8. Fin de recette

- [ ] Commandes de test annulées ou remises ; aucune commande de test en cours.
- [ ] Compte de test client supprimé ou désactivé, sans toucher aux données réelles du restaurateur.
- [ ] Le restaurateur a validé sa fiche publique (nom, horaires, produits, prix).
- [ ] Preuves conservées : date, heure UTC, captures des écrans clés, codes HTTP relevés.
- [ ] Décision : go / no-go pour ouvrir le pilote à de vrais clients. Décision : ____.

## Anomalies

Pour chaque écart : écran, heure UTC, compte utilisé, résultat attendu, résultat obtenu, capture.

| # | Écran / étape | Heure UTC | Compte | Attendu | Obtenu | Capture |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
