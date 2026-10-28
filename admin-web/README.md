# ZeeROO Admin Web — autonome de Lovable

Cette application statique est maintenue dans GitHub, dossier `admin-web/`, indépendamment de Lovable.

## Sécurité et état
- Aucun mode démo et aucune fixture dans le dashboard réel.
- Connexion Supabase Auth email/mot de passe ; vérification `getUser()` ; appartenance à `platform_admins` sous RLS.
- Connexion sans double authentification, conformément au choix du propriétaire du 28/10/2026. Le dashboard exige une session valide et l’appartenance à `platform_admins` ; les règles RLS restent actives.
- Profil administrateur personnel avec RLS, nom, langue et thème.
- Vue d’ensemble : compteurs exacts. Commerces, livreurs, commandes et abonnements : lecture réelle paginée (25 lignes), avec actualisation manuelle. Les abonnements proviennent des tables synchronisées par les webhooks, sans appel Stripe direct.
- Litiges : source absente de la base, état explicitement non connecté. Aucune donnée inventée.
- Lecture transversale accordée uniquement aux membres de `platform_admins` par cinq politiques SELECT dédiées ; aucun droit d’écriture métier ajouté.
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
