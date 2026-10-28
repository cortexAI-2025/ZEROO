# ZeeROO Admin Web — autonome de Lovable

Cette application statique est maintenue dans GitHub, dossier `admin-web/`, indépendamment de Lovable.

## Sécurité et état
- Aucun mode démo et aucune fixture dans le dashboard réel.
- Connexion Supabase Auth email/mot de passe ; vérification `getUser()` ; appartenance à `platform_admins` sous RLS.
- MFA TOTP AAL2 requise avant ouverture du dashboard. La configuration initiale d'un facteur MFA doit être faite via un parcours sécurisé existant ou un écran d'enrôlement à développer.
- Profil administrateur personnel avec RLS, nom, langue et thème.
- Les rubriques métiers restent volontairement désactivées jusqu'à audit des schémas et politiques RLS. **Ce n'est pas encore un dashboard métier de production.**
- L'autorisation serveur reste déterminée par les politiques RLS, pas par la navigation. Ne jamais déployer une API privilégiée qui ferait confiance à l'interface.
- Ne pas exposer de service_role ou secret dans les fichiers publics.

## Configuration et déploiement
1. Déployer `admin-web/` comme site statique séparé (Vercel avec Root Directory = `admin-web`, framework Other).
2. Renseigner `window.ZEEROO_ADMIN_CONFIG.supabasePublishableKey` dans `config.js` via un mécanisme de déploiement sécurisé (cette clé est publique, ne pas utiliser service_role). Aucun secret n'est inclus ici.
3. Configurer le domaine `admin.zeeroo.fr` **après** tests d'authentification et de RLS.
4. Vérifier l'enrôlement MFA, les comptes non-admin, les sessions expirées, les appareils mobiles et la persistance du profil.

Le client JavaScript Supabase est chargé depuis un CDN avec version figée. Pour une production durcie, installer la dépendance localement, verrouiller le lockfile et bundler les assets afin d'éviter une dépendance runtime au CDN.
