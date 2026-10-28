# ZeeROO Admin Web — autonome de Lovable

Cette application statique est maintenue dans GitHub, dossier `admin-web/`, indépendamment de Lovable.

## Sécurité et état
- Aucun mode démo et aucune fixture dans le dashboard réel.
- Connexion Supabase Auth email/mot de passe ; vérification `getUser()` ; appartenance à `platform_admins` sous RLS.
- Connexion sans double authentification, conformément au choix du propriétaire du 28/10/2026. Le dashboard exige une session valide et l’appartenance à `platform_admins` ; les règles RLS restent actives.
- Profil administrateur personnel avec RLS, nom, langue et thème.
- Vue d’ensemble : compteurs exacts. Commerces, livreurs, commandes et abonnements : lecture réelle paginée (25 lignes), avec actualisation manuelle. Les abonnements proviennent des tables synchronisées par les webhooks, sans appel Stripe direct.
- Litiges : dossiers opérationnels réels, avec suivi et décision via les opérations CRM contrôlées côté serveur.
- Lecture transversale réservée aux administrateurs ; mutations métier uniquement par RPC autorisées, validées et journalisées.
- L'autorisation serveur reste déterminée par les politiques RLS, pas par la navigation. Ne jamais déployer une API privilégiée qui ferait confiance à l'interface.
- Ne pas exposer de service_role ou secret dans les fichiers publics.

## Configuration et déploiement
1. Déployer `admin-web/` comme site statique séparé (Vercel avec Root Directory = `admin-web`, framework Other).
2. Renseigner `window.ZEEROO_ADMIN_CONFIG.supabasePublishableKey` dans `config.js` via un mécanisme de déploiement sécurisé (cette clé est publique, ne pas utiliser service_role). Aucun secret n'est inclus ici.
3. Configurer le domaine `admin.zeeroo.fr` **après** tests d'authentification et de RLS.
4. Vérifier la connexion par mot de passe, les comptes non-admin, les sessions expirées, les appareils mobiles et la persistance du profil.

Le client JavaScript Supabase est chargé depuis un CDN avec version figée. Pour une production durcie, installer la dépendance localement, verrouiller le lockfile et bundler les assets afin d'éviter une dépendance runtime au CDN.

## IONOS / domaine

Le projet Vercel autonome est `zeeroo-admin` (ID `prj_0SGgjAZpLb3PcRAySIcJIrnIi5dQ`). Après validation des tests, supprimer l'association Lovable de `admin.zeeroo.fr`, puis chez IONOS remplacer l'enregistrement `admin` existant par un CNAME vers `441819a6ee9b4995.vercel-dns-017.com` (valeur recommandée par Vercel le 28/10/2026). Ne pas changer les NS ni les enregistrements de la racine ou de `app`. Vérifier à nouveau les valeurs dans Vercel avant bascule.

## Fiches abonnés

Les listes Commerces, Livreurs et Abonnements proposent « Voir la fiche ». La fonction publique `admin_subscriber_details` (SECURITY INVOKER) appelle une fonction en schéma non exposé `admin_private` qui contrôle `auth.uid()` et `platform_admins` à chaque requête. La projection des champs est explicite : coordonnées, identité professionnelle, profil, e-mail et dates du compte, état d’abonnement, indicateurs Stripe Connect et activité. Aucun mot de passe, jeton, secret MFA, numéro de carte ou compte bancaire n’est retourné. Toutes les fiches sont en lecture seule.

## Console de gestion

- Clients : recherche nom/e-mail/téléphone, coordonnées, état, historique de commandes paginé (25), adresses de livraison enregistrées et fidélité.
- Commerces/livreurs : ajout depuis un compte déjà inscrit dans le bon espace, édition des coordonnées professionnelles, suspension, réactivation, suppression par archivage. Aucune suppression physique d’historique.
- Litiges : dossiers opérationnels, rattachement à une commande/client, analyse et conclusion ; aucun remboursement financier automatique.
- Avis : masquage/restauration, avec exclusion des avis masqués dans les lecteurs RLS et les agrégats de notes.
- Fidélité : consultation du programme existant (9 menus = 1 offert), ajustement justifié des récompenses disponibles de -10 à +10, sans solde négatif.
- Offres : Happy Hours existantes, recherche par ville et lien cartographique du commerce ; création en brouillon sur tous les produits disponibles du commerce, calendrier quotidien 00:00–23:59, activation explicite et règles de prix serveur existantes.
- Communications : brouillons persistés, échéances manuelles de relance, ouverture du message dans la messagerie de l’administrateur et appel téléphonique. Aucun envoi automatique, suivi de livraison ou tâche de fond.
- Journal : toutes les mutations via `admin_console` nécessitent un motif et un identifiant d’idempotence. Les opérations sont contrôlées côté serveur contre `platform_admins`.

Les suspensions empêchent les nouvelles commandes et nouvelles affectations ; les commandes historiques restent traitables. Un propriétaire ne peut pas annuler une modération. Les comptes administrateur sont protégés des suspensions client. Les nouvelles tables de support ont RLS activée et des politiques de lecture administrateur.

## Identité visuelle

Le logo officiel fourni le 28/10/2026 est conservé sans modification dans `logo-officiel.jpg` (le fichier d’origine porte une extension PNG mais contient du JPEG). Sa zone blanche est préservée pour les deux thèmes. Palette : vert #3AAD17, lime #7CDA20, encre #0B1C1C, neutres verts légers ; les liens utilisent un vert plus foncé sur fond clair pour le contraste. Le menu latéral est escamotable sur mobile ; les indicateurs restent sur deux colonnes. Le build copie explicitement l’asset officiel.

## Contrôle du 28 octobre 2026

Les dossiers affichent aussi les coordonnées personnelles actuelles du profil. Le module Revendications expose les demandes du site public : décision motivée, acceptation uniquement avec un restaurant appartenant au demandeur et le même SIRET. La déconnexion efface les fiches et invalide les lectures en attente. Les politiques de profil administrateur et de lecture de sa propre appartenance sont désormais reproduites par les migrations. Voir `docs/security/AUDIT_2026-10-28.md` pour les résultats et limites du contrôle.
