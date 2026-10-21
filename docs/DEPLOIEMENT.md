# Mise en production : ce qui reste manuel

Les réglages hébergés (Supabase, Vercel, DNS) demandent un accès que l'assistant de développement n'a pas toujours. Cette page liste précisément ce qui reste à faire et comment le vérifier.

## 1. Base de données Supabase

Avec le CLI (recommandé) :

```
npx supabase login
npx supabase link --project-ref <ref du projet>
npx supabase db push
```

Sans CLI : `scripts/bundle-migrations.sh <dossier>` produit des scripts à coller dans **SQL Editor → Run**, dans l'ordre. Chaque script est une transaction (tout passe ou rien ne change) et enregistre l'historique des migrations, ce qui évite qu'un futur `db push` les rejoue. Pour ne livrer que les nouveautés : `scripts/bundle-migrations.sh <dossier> <première-migration-à-inclure>`.

Vérification : `select count(*) from supabase_migrations.schema_migrations;` doit égaler le nombre de fichiers de `supabase/migrations/`.

## 2. Fonctions serveur

```
npx supabase functions deploy
```

Secrets à définir (`npx supabase secrets set …`) : voir `supabase/functions/.env.example` (clés Stripe, `STRIPE_WEBHOOK_SECRET`, `APP_WEB_URL=https://app.zeeroo.fr`, `CRON_SECRET`). Secrets Vault pour les tâches planifiées : `functions_url` et `cron_secret` (voir `supabase/migrations/20261008180000_payments.sql`).

## 3. Authentification Supabase

Authentication → URL Configuration : Site URL `https://app.zeeroo.fr`, Redirect URLs `https://app.zeeroo.fr/**` et `zeroo://**` (application mobile).

## 4. Vercel (application web)

Projet `zeroo` → Settings → Domains → ajouter `app.zeeroo.fr` ; un déploiement de production doit être « Ready ». Variables : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OAUTH_PROVIDERS`.

## 5. DNS (IONOS) et ancien domaine

- `app` : `CNAME → cname.vercel-dns.com`.
- La vitrine `zeeroo.fr` est servie par GitHub Pages (`zeroo_mainpage`) ; sa page `404.html` redirige `/m/<slug>` et les pages de l'application vers `app.zeeroo.fr` en conservant chemin et paramètres.
- **Anciens QR** `zeroo.online/m/<slug>` : aucun code ne peut les rediriger tant que l'ancien domaine pointe ailleurs. Configurer chez IONOS une **redirection HTTP permanente (301) de `zeroo.online/*` vers `https://zeeroo.fr/$1`**, ou héberger l'ancien domaine sur le même site. Le domaine `zeeroo.online` est réservé aux démonstrations commerciales et ne sert pas à l'application.

## 6. Carte de l'annuaire

- **Web** : Leaflet avec les tuiles OpenStreetMap par défaut. La politique d'usage d'OpenStreetMap limite le trafic important : en production, définir `EXPO_PUBLIC_MAP_TILES_URL` (variable Vercel) avec un fournisseur de tuiles (MapTiler, Stadia Maps…) et sa clé.
- **iOS / Android** : carte intégrée **non livrée**. À faire si souhaité : `npx expo install expo-maps`, créer une clé « Maps SDK for Android » dans Google Cloud (`android.config.googleMaps.apiKey` dans `app.config.ts`), puis un build de développement (`eas build --profile development`).
