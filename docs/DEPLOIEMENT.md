# Mise en production : ce qui reste manuel

Les réglages hébergés (Supabase, Vercel, DNS) demandent un accès que l'assistant de développement n'a pas toujours. Cette page liste précisément ce qui reste à faire et comment le vérifier.

## 0. Installation guidée (CLI officiel)

Dans **votre** terminal, à la racine du dépôt : `npx supabase login` (connexion dans le navigateur, aucun jeton à copier), puis `scripts/deploy-production.sh --dry-run`, puis `scripts/deploy-production.sh`. Le script applique les migrations absentes de l'historique (`db push`), liste les secrets de fonctions présents ou manquants (sans les afficher) et déploie les neuf fonctions. Il ne fait ni reset ni suppression. Contrôle ensuite : `scripts/verify-production.sql` dans le SQL Editor.

**Secrets Vault des tâches planifiées** (avant que les tâches ne servent) : `functions_url` = `https://rgxesocsvhgsqoehxhgt.supabase.co/functions/v1`. `cron_secret` doit être **identique** au secret de fonction `CRON_SECRET`. Sans jamais le copier dans un chat : dans le SQL Editor, `select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret');` puis `select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';` et collez cette valeur dans Dashboard → Edge Functions → Secrets → `CRON_SECRET`. Faites de même pour `functions_url` avec `vault.create_secret('<url>', 'functions_url')`.

## Historique des migrations : Git = projet hébergé

Les versions (préfixe à 14 chiffres) des fichiers de `supabase/migrations/` sont **celles enregistrées dans le projet hébergé** (`supabase_migrations.schema_migrations`), vérifiées le 24 octobre 2026 : 33 migrations, de `20261023091648_profiles` à `20261024154935_courier_placed_missions`. Ne renommez jamais une migration déjà appliquée. Quand une migration est appliquée par le connecteur (`apply_migration`), le projet lui attribue sa propre version : renommez ensuite le fichier Git avec cette version (relisez-la avec `list_migrations`). Une migration appliquée uniquement en ligne doit être reprise dans Git le jour même : c'est ainsi que 4 correctifs se sont retrouvés absents du dépôt. Un test Jest (`src/__tests__/migrations.test.ts`) garantit des versions et des noms uniques.

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

Secrets à définir (`npx supabase secrets set …`) : voir `supabase/functions/.env.example` (clés Stripe, `STRIPE_WEBHOOK_SECRET`, `APP_WEB_URL=https://app.zeeroo.fr`, `CRON_SECRET`). Secrets Vault pour les tâches planifiées : `functions_url` et `cron_secret` (voir `supabase/migrations/20261023094706_payments.sql`).

## 3. Authentification Supabase

Authentication → URL Configuration : Site URL `https://app.zeeroo.fr`, Redirect URLs `https://app.zeeroo.fr/**` et `zeroo://**` (application mobile).

## 4. Vercel (application web)

Projet `zeroo` → Settings → Domains → ajouter `app.zeeroo.fr` ; un déploiement de production doit être « Ready ». Variables : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OAUTH_PROVIDERS`.

## 5. DNS (IONOS) et ancien domaine

- `app` : `CNAME → cname.vercel-dns.com`.
- La vitrine `zeeroo.fr` est servie par GitHub Pages (`zeroo_mainpage`) ; sa page `404.html` redirige `/m/<slug>` et les pages de l'application vers `app.zeeroo.fr` en conservant chemin et paramètres.
- **Anciens QR** `zeroo.online/m/<slug>` : le code est prêt (`vercel.json`, règles `redirects` testées), il reste à **ajouter `zeroo.online` et `www.zeroo.online` comme domaines du projet Vercel** (Settings → Domains) et à pointer leur DNS chez IONOS vers Vercel (`A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`). Les règles renvoient alors `zeroo.online/m/<slug>` vers `https://app.zeeroo.fr/m/<slug>` (même établissement, redirection permanente 308), `/pro`, `/livreur`, `/order/…` vers l'application, et tout le reste vers `https://zeeroo.fr`. Tant que ce réglage n'est pas fait, les anciens QR dépendent de ce que l'ancien domaine sert aujourd'hui. Le domaine `zeeroo.online` (avec deux « e ») est réservé aux démonstrations commerciales et ne sert pas à l'application.

## 6. Carte de l'annuaire

- **Web** : Leaflet avec les tuiles OpenStreetMap par défaut. La politique d'usage d'OpenStreetMap limite le trafic important : en production, définir `EXPO_PUBLIC_MAP_TILES_URL` (variable Vercel) avec un fournisseur de tuiles (MapTiler, Stadia Maps…) et sa clé.
- **iOS / Android** : carte intégrée **non livrée**. À faire si souhaité : `npx expo install expo-maps`, créer une clé « Maps SDK for Android » dans Google Cloud (`android.config.googleMaps.apiKey` dans `app.config.ts`), puis un build de développement (`eas build --profile development`).
