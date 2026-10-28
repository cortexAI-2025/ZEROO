# ZeeRoo : architecture (étape 0, proposition)

> Statut : **validé** (étape 0). Mis à jour au fil des étapes.

## 0. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Pays de lancement | **France** : prix TTC en euros, fuseau `Europe/Paris`, Stripe disponible. |
| Fidélité | **9 menus payés et récupérés chez un commerçant = 1 menu offert**, en comptant chaque menu, même s'ils sont achetés dans une seule commande (validé). Le commerçant indique quels produits sont des « menus » éligibles. Voir §3.1. |
| Comptes commerçant | **Un seul compte par commerce** (`merchants.owner_id` unique), pas de comptes employés au MVP. |
| Abonnement | **30 jours d'essai gratuit, puis Start 19,99 € HT/mois (23,99 € TTC) ou Pro 29,99 € HT/mois avec l'option livraison (35,99 € TTC)**, ou à l'année (199,99 € HT, 299,99 € HT), souscrit sur le web via Stripe Checkout. Les prix Stripe sont HT ; la TVA 20 % s'ajoute via un taux Stripe exclusif, ce qui détaille HT / TVA / TTC sur les factures ; le commerçant peut saisir son numéro de TVA. Le client ne paie rien. |
| Positionnement | **ZeeRoo est un service, pas un vendeur.** Les repas sont vendus par les restaurants, au prix de leur carte. **Le client paie directement chaque professionnel** (restaurant, livreur) par carte, Apple Pay ou Google Pay via **le lien de paiement de ce professionnel** (SumUp, PayPal, Stripe Payment Link, Lydia Pro…), ou en espèces ; l'argent arrive sur le compte bancaire du professionnel. ZeeRoo n'encaisse jamais l'argent des commandes. **Stripe ne sert qu'aux abonnements**, encaissés par AiWorkPay. Voir §3.6. |
| Livraison | **Retrait ou livraison par un livreur indépendant** rattaché au restaurant (avec son accord). Le livreur (auto-entrepreneur ou société, SIRET) paie un **abonnement livreur unique : 14,99 € HT par mois (17,99 € TTC) ou 149,99 € HT par an, 30 jours d'essai**, sans commission. Le **restaurant fixe le prix de la course** et sa zone ; le client paie **deux paiements distincts** : le repas au restaurant à la commande, la course au livreur quand un livreur accepte la mission (carte ou espèces au choix), chacun directement sur son compte Stripe. ZeeRoo n'encaisse jamais d'argent. Voir §3.4. |
| Domaine | **zeeroo.fr** : site vitrine et liens commerçant `https://zeeroo.fr/m/<slug>` (cibles des QR codes, redirigés vers l'app web). **app.zeeroo.fr** : app web, page d'abonnement et retours Stripe. |
| Site public | **zeeroo.fr** : site vitrine statique (dépôt `cortexAI-2025/zeroo_mainpage`, GitHub Pages) avec la démo interactive. Ce dépôt ne contient que l'application. |
| Stripe | Le titulaire a déjà un compte Stripe professionnel (activité « aiworkpay ») : la plateforme ZeeRoo doit être un **compte Stripe distinct**, créé dans la même organisation (voir étape d). |

## 1. Stack retenue et ajustements

| Domaine | Choix | Commentaire |
|---|---|---|
| App mobile | Expo (SDK courant) + TypeScript strict + Expo Router | Builds de dev EAS dès l'étape (a) : Apple/Google Sign-In et Stripe ont besoin de modules natifs, Expo Go ne suffit pas. |
| Espace commerçant | **Même app Expo, exportée aussi en web** (react-native-web) | Le commerçant peut utiliser une tablette, un téléphone ou le PC de caisse. Le web sert aussi à la souscription de l'abonnement (voir §1.2). |
| État serveur | TanStack Query + Supabase Realtime | Realtime invalide le cache des requêtes, il ne gère pas l'état lui-même. |
| État local | Zustand (panier, persisté) | Un panier = un seul commerçant. |
| Stockage local | `expo-sqlite/localStorage` | Session Supabase et préférences, avec la même API que `localStorage` sur le web. |
| Formulaires | react-hook-form + zod | Les mêmes schémas zod sont réutilisés pour valider les payloads côté Edge Functions. |
| Backend | Supabase : Postgres + PostGIS, Auth, Realtime, RLS, Edge Functions (Deno), pg_cron | |
| Paiement client | **Lien de paiement du professionnel** (carte, Apple Pay, Google Pay chez son propre fournisseur) ou espèces ; le client indique « J'ai payé », le professionnel confirme la réception | Plus de Stripe Connect pour les commandes (§3.6). |
| Abonnement commerçant | Stripe Billing (Checkout + Customer Portal) | |
| Push | Expo Notifications (Expo Push Service) | Son personnalisé « nouvelle commande ». |
| Temps de trajet | Google Routes API (`computeRoutes`), appelée **uniquement côté serveur** | La clé ne sort jamais de l'Edge Function. |
| Géocodage d'adresse | Géoplateforme IGN (`data.geopf.fr/geocodage`, ex-API Adresse) | Service public français, gratuit et sans clé. Utilisé pour l'adresse du commerce. |
| i18n | i18next + expo-localization, fichiers `fr` d'abord | Styles en propriétés logiques (`start`/`end`) dès le départ pour préparer le RTL de l'arabe. |
| Tests | Jest + Testing Library (app), Deno test (functions), **pgTAP** (`supabase test db`) pour la RLS et les règles métier SQL | |

### 1.1 Points où je challenge la proposition

1. **Type de compte Stripe Connect.** Avec des comptes Express ou Custom où la plateforme gère la tarification, Stripe facture la plateforme environ 2 € par compte actif et par mois, plus des frais par virement. Ça représenterait environ environ 10 % d'un abonnement Start à 19,99 € HT. Je recommande des comptes dont **Stripe gère la tarification** (configuration `controller` : `fees.payer = account`, `losses.payments = stripe`, `stripe_dashboard.type = full`, l'équivalent des comptes « Standard »). Avec cette configuration, la plateforme ne paie aucun frais Connect, et le commerçant a son propre dashboard Stripe pour ses virements, ses remboursements et ses litiges.
2. **Pré-autorisation puis capture.** Le paiement est autorisé à la commande (`capture_method = manual`) et **capturé seulement quand le commerçant accepte**. Si le commerçant refuse, ou ne répond pas sous N minutes, l'autorisation est annulée. Cette approche a deux avantages : aucun remboursement n'est nécessaire, et donc aucun frais Stripe n'est perdu pour le commerçant, qui ne les récupère pas sur un remboursement. Le client, lui, n'est jamais débité pour une commande refusée.
3. **Abonnement commerçant et règles des stores.** Apple et Google peuvent exiger leur système d'achat intégré (avec une commission de 15 à 30 %) pour un abonnement à un service numérique vendu dans l'app. Je propose de faire **souscrire l'abonnement sur le web** (`app.zeeroo.fr/pro`, avec Stripe Checkout), puis de laisser l'app afficher seulement l'état de l'abonnement. Les paiements des clients concernent des biens physiques (des repas), donc Stripe y est autorisé sans problème.
4. **Code de retrait.** Pour que le compteur de fidélité ne s'incrémente qu'à la remise réelle, chaque commande porte un code court (ex. `K7P2`) que le client montre en caisse. Le commerçant passe la commande à « récupérée » en le saisissant ou en scannant le QR de la commande.
5. **« Je pars maintenant » sans traçage continu (RGPD).** La position est envoyée **une seule fois**, au moment du clic. Le serveur calcule l'ETA et **ne stocke pas les coordonnées**, seulement `customer_eta_at`. Le client pourra cliquer à nouveau pour rafraîchir l'ETA.
6. **Un compte = un commerce.** Le même compte peut aussi commander comme client : l'app propose deux espaces, avec une bascule dans « Compte ».

### 1.2 Flux principaux

```
CLIENT                         EDGE FUNCTIONS                    STRIPE                COMMERÇANT
panier ──► create-order ──────► vérifie ouvert / pause / abo
                                 recalcule les prix en base
                                 crée order (pending_payment)
                                 PaymentIntent manuel ──────────► (compte connecté)
PaymentSheet ◄── client_secret
paie (autorisation) ──────────────────────────────────────────► webhook amount_capturable_updated
                                 stripe-webhook : order → placed ─────────────────────► Realtime + push + son
                                                                                       accepte (+ délai)
                                 order-decision ◄──────────────────────────────────────┘
                                 capture PI ─────────────────────► capture
                                 order → accepted ──► push client
« Je pars » ──► customer-departure : Google Routes → customer_eta_at ────────────────► « arrive dans 12 min »
                                                                                       preparing → ready
                                 RPC set_order_status ◄────────────────────────────────┘ (push client « prête »)
montre le code ───────────────────────────────────────────────────────────────────────► collected
                                 trigger SQL : fidélité +1 (même transaction)
```

- **Navigation** : tant que la session n'est pas relue au démarrage, les gardes de navigation laissent toutes les routes ouvertes. Un lien direct (QR code, notification, rechargement) arrive ainsi sur la bonne page.
- **Temps réel côté app** : `useRealtimeChanges()` ouvre un canal par écran, avec un nom unique. supabase-js réutilise un canal de même nom, et fermer un écran couperait l'abonnement d'un autre.
- **Webhook Stripe** : la signature est vérifiée, chaque événement n'est traité qu'une fois (`stripe_events`), et un événement de paiement n'est pris en compte que s'il vient du compte Stripe de la commande avec un montant au moins égal au total. Un commerçant, maître de son propre compte, ne peut donc pas valider la commande d'un autre.
- **Notifications** : le trigger `orders_notify_status_change` appelle `notify-order-update` via pg_net (asynchrone, la transaction n'attend pas), avec le secret interne lu dans Vault. Une notification manquée ne fait jamais échouer une commande.
- **Expiration** : pg_cron appelle `expire-orders` chaque minute. Une commande `placed` non acceptée après 10 min (réglable) passe à `expired`, et le PaymentIntent est annulé.

## 2. Arborescence du dépôt

```
zeroo/
├── src/
│   ├── app/                          # Expo Router : routes uniquement, écrans fins
│   │   ├── _layout.tsx               # providers + gardes (Stack.Protected) session / espace
│   │   ├── index.tsx                 # app.zeeroo.fr : page d'accueil (visiteur web) ou redirection
│   │   ├── mentions-legales.tsx, confidentialite.tsx
│   │   ├── auth-callback.tsx         # retour des liens e-mail (confirmation, mot de passe)
│   │   ├── choose-space.tsx          # « Commander » ou « Gérer mon commerce »
│   │   ├── update-password.tsx
│   │   ├── (auth)/                   # sign-in, sign-up, forgot-password
│   │   ├── (client)/                 # onglets : explore (à proximité), orders, loyalty, account
│   │   ├── m/[slug].tsx              # fiche commerçant + menu, sans compte (cible du QR code)
│   │   ├── cart.tsx                  # panier, sans compte ; connexion demandée pour commander
│   │   ├── order/[id].tsx            # suivi temps réel (+ « Je pars maintenant » à l'étape f, livraison à l'étape g)
│   │   ├── livreur/                  # espace livreur (étape g) : inscription, onglets courses, restaurants, revenus, compte
│   │   └── pro/                      # espace commerçant (URL /pro sur le web)
│   │       ├── _layout.tsx           # garde : pas de commerce → onboarding
│   │       ├── (tabs)/               # index (commandes en direct), menu, shop (boutique), account
│   │       ├── onboarding.tsx        # création du commerce (Stripe Connect + abonnement à l'étape d)
│   │       ├── item/[id].tsx         # produit + options ; category/[id].tsx
│   │       ├── info.tsx, hours.tsx   # informations, horaires
│   │       ├── qr.tsx                # QR code affichable / imprimable
│   │       └── history.tsx           # historique des commandes
│   ├── features/                     # logique par domaine : api.ts, hooks.ts, components/, schemas.ts
│   │   ├── auth/  merchants/  menu/  cart/  orders/
│   │   ├── loyalty/  payments/  notifications/  location/
│   │   └── merchant-dashboard/
│   ├── components/                   # ui/ (Button, AppText, Screen, TextField…), form/
│   ├── lib/                          # supabase.ts, query-client.ts, env.ts, confirm.ts…
│   ├── i18n/                         # index.ts, locales/fr/*.json
│   ├── theme/
│   └── types/database.ts             # généré : `supabase gen types typescript`
├── supabase/
│   ├── config.toml
│   ├── migrations/                   # SQL versionné (schéma, RLS, fonctions, triggers)
│   ├── functions/
│   │   ├── _shared/                  # cors, stripe client, admin client, auth, zod schemas
│   │   ├── create-order/             # commande (prix en base) + PaymentIntent ou Checkout
│   │   ├── order-payment-status/     # vérifie l'autorisation après la feuille de paiement
│   │   ├── customer-cancel-order/    # annulation par le client avant acceptation
│   │   ├── order-decision/           # accepter (capture) / refuser (annulation)
│   │   ├── stripe-webhook/           # paiements, comptes Connect, abonnements
│   │   ├── connect-onboarding/       # création compte + Account Link
│   │   ├── billing/                  # Checkout abonnement + portail client
│   │   ├── expire-orders/            # appelée par pg_cron (secret partagé)
│   │   ├── customer-departure/       # « Je pars maintenant » : trajet Google Routes, position non stockée
│   │   └── notify-order-update/      # push Expo, appelée par le trigger orders_notify_status_change
│   ├── tests/                        # pgTAP : RLS, transitions de statut, fidélité
│   └── seed.sql                      # 2 commerçants, menus, 1 client de test
├── assets/                           # icônes, splash, sounds/new-order.wav
├── docs/ARCHITECTURE.md
├── app.config.ts                     # lit les variables EXPO_PUBLIC_*
├── eas.json
├── .env.example
└── README.md
```

Le dépôt reste un **repo unique, sans monorepo** : une seule app et le dossier `supabase/`. Les types partagés sont générés depuis la base. Si une page web vitrine arrive plus tard, on passera à un workspace pnpm.

## 3. Schéma de base de données (brouillon)

Conventions : montants en **centimes entiers** (`*_cents`), devise `EUR`, horodatages `timestamptz`, clés `uuid`.

```sql
create extension if not exists postgis;

-- Enums -------------------------------------------------------------------
create type subscription_status as enum ('incomplete', 'incomplete_expired', 'trialing',
                                         'active', 'past_due', 'canceled', 'unpaid', 'paused');
create type order_status        as enum ('pending_payment', -- PaymentIntent créé, pas encore autorisé
                                         'placed',          -- paiement autorisé, attend le commerçant
                                         'accepted',        -- capturé, délai annoncé
                                         'preparing',
                                         'ready',
                                         'collected',       -- remise au client → fidélité
                                         'refused',
                                         'expired',         -- pas de réponse du commerçant
                                         'cancelled');      -- paiement abandonné / échoué

-- Utilisateurs (« users » = auth.users + profil applicatif) ----------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  phone         text,
  locale        text not null default 'fr',
  created_at    timestamptz not null default now()
);

-- Commerçants ---------------------------------------------------------------
create table merchants (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null unique references profiles(id),  -- 1 compte = 1 commerce
  slug                 text not null unique,            -- lien / QR code : zeeroo.fr/m/<slug>
  name                 text not null,
  description          text,
  category             text not null,                   -- 'snack' | 'sandwicherie' | 'restaurant'…
  phone                text,
  address_line         text not null,
  postal_code          text not null,
  city                 text not null,
  location             geography(Point, 4326) not null,
  timezone             text not null default 'Europe/Paris',
  logo_url             text,
  cover_url            text,
  default_prep_minutes int  not null default 15 check (default_prep_minutes between 1 and 120),
  is_paused            boolean not null default false,  -- « plus de commandes pour l'instant »
  paused_until         timestamptz,                     -- reprise auto optionnelle
  is_published         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on merchants using gist (location);

-- Données Stripe du commerçant, séparées pour ne jamais être lisibles publiquement
create table merchant_stripe_accounts (
  merchant_id        uuid primary key references merchants(id) on delete cascade,
  stripe_account_id  text not null unique,
  charges_enabled    boolean not null default false,
  payouts_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table merchant_opening_hours (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- ISO : 1 = lundi
  opens_at    time not null,
  closes_at   time not null,                                      -- < opens_at = passe minuit
  check (opens_at <> closes_at)
);

create table subscriptions (
  merchant_id            uuid primary key references merchants(id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 subscription_status not null default 'incomplete',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- Menu ----------------------------------------------------------------------
create table menu_categories (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  name        text not null,
  position    int  not null default 0,
  is_active   boolean not null default true
);

create table menu_items (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants(id) on delete cascade,
  category_id  uuid not null references menu_categories(id) on delete cascade,
  name         text not null,
  description  text,
  price_cents  int  not null check (price_cents >= 0),
  image_url    text,
  is_available boolean not null default true,     -- rupture du jour
  is_loyalty_menu boolean not null default false, -- compte pour la fidélité et peut être offert
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Options : « Sauce (1 au choix) », « Suppléments (0 à 3) »
create table menu_option_groups (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  item_id     uuid not null references menu_items(id) on delete cascade,
  name        text not null,
  min_select  int  not null default 0 check (min_select >= 0),
  max_select  int  not null default 1 check (max_select >= min_select),
  position    int  not null default 0
);

create table menu_options (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references merchants(id) on delete cascade,
  group_id          uuid not null references menu_option_groups(id) on delete cascade,
  name              text not null,
  price_delta_cents int  not null default 0 check (price_delta_cents >= 0),
  is_available      boolean not null default true,
  position          int  not null default 0
);

-- Commandes -----------------------------------------------------------------
create table orders (
  id                       uuid primary key default gen_random_uuid(),
  pickup_code              text not null,                      -- ex. 'K7P2', unique par commerçant et par jour
  customer_id              uuid references profiles(id) on delete set null,  -- anonymisé si compte supprimé
  merchant_id              uuid not null references merchants(id),
  status                   order_status not null default 'pending_payment',
  subtotal_cents           int not null check (subtotal_cents >= 0),
  discount_cents           int not null default 0 check (discount_cents >= 0),
  total_cents              int not null check (total_cents = subtotal_cents - discount_cents),
  currency                 char(3) not null default 'EUR',
  is_loyalty_reward        boolean not null default false,    -- contient le menu offert
  loyalty_counted          boolean not null default false,    -- idempotence du +1
  customer_note            text,
  prep_minutes             int,                                -- délai annoncé par le commerçant
  estimated_ready_at       timestamptz,
  customer_departed_at     timestamptz,                        -- « Je pars maintenant »
  customer_eta_at          timestamptz,                        -- arrivée estimée (pas de coordonnées stockées)
  stripe_payment_intent_id text unique,
  refusal_reason           text,
  placed_at   timestamptz, accepted_at  timestamptz, ready_at     timestamptz,
  collected_at timestamptz, cancelled_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on orders (merchant_id, status, created_at desc);
create index on orders (customer_id, created_at desc);

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  menu_item_id     uuid references menu_items(id) on delete set null,
  name             text not null,                 -- instantané : le menu peut changer après coup
  unit_price_cents int  not null check (unit_price_cents >= 0),  -- prix + options
  quantity         int  not null check (quantity between 1 and 50),
  options          jsonb not null default '[]',   -- [{group, name, price_delta_cents}]
  line_total_cents int  not null check (line_total_cents = unit_price_cents * quantity)
);

-- Fidélité ------------------------------------------------------------------
create table loyalty_cards (
  user_id               uuid not null references profiles(id)  on delete cascade,
  merchant_id           uuid not null references merchants(id) on delete cascade,
  paid_menus_count      int  not null default 0 check (paid_menus_count between 0 and 8),
  rewards_available     int  not null default 0 check (rewards_available >= 0),  -- menus offerts à utiliser
  -- order_items.is_loyalty_menu (instantané) et is_loyalty_reward (ligne offerte, quantité 1)
  rewards_redeemed      int  not null default 0,
  updated_at            timestamptz not null default now(),
  primary key (user_id, merchant_id)
);

-- Notifications / technique -------------------------------------------------
create table push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  expo_token   text not null unique,
  platform     text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now()
);

create table stripe_events (            -- idempotence du webhook
  id          text primary key,         -- evt_…
  type        text not null,
  received_at timestamptz not null default now()
);
```

### 3.1 Fonctions SQL clés (règles métier côté serveur)

| Fonction | Rôle |
|---|---|
| `is_merchant_owner(merchant_id)` | Helper RLS : `auth.uid()` est le propriétaire du commerce. |
| `is_merchant_open(merchant_id, at)` | Horaires + fuseau horaire du commerçant, gère le passage de minuit. |
| `merchant_can_take_orders(merchant_id)` | `is_published` **et** ouvert **et** pas en pause **et** abonnement `active`/`trialing` **et** `charges_enabled`. Appelée par `create-order` **et** revérifiée au webhook. |
| `set_opening_hours(merchant_id, slots)` | Remplace tous les créneaux d'un commerce en une transaction (étape b). |
| `is_open_now`, `is_paused_now`, `is_accepting_orders` | Colonnes calculées sur `merchants`, lisibles via PostgREST (`select('*, is_open_now')`). |
| `merchant_today_summary(merchant_id)` | Nombre de commandes et chiffre d'affaires du jour, dans le fuseau du commerce. |
| `nearby_merchants(lat, lng, radius_m)` | `ST_DWithin` + distance + drapeau « ouvert maintenant ». |
| `search_merchants(query)` | Recherche par nom, ville ou code postal, insensible aux accents. |
| `create_order(customer_id, merchant_id, items, note)` | Service role uniquement (Edge Function `create-order`). Recalcule tout côté serveur : prix du menu, options (existence, disponibilité, min / max par groupe), disponibilité des produits, commerce en état d'encaisser. Crée la commande en `pending_payment`. |
| `mark_order_authorized` / `mark_order_payment_failed` | Idempotentes, appelées par le webhook ou après la feuille de paiement : `pending_payment → placed` ou `→ cancelled`. |
| `apply_order_transition(order, actor, status, …)` | Service role. Moteur unique des transitions ; vérifie l'acteur (commerçant propriétaire, ou client pour l'annulation). `set_order_status` (commerçant) n'autorise plus que préparation / prête / remise : accepter et refuser passent par `order-decision`, qui capture ou annule le paiement. |
| `is_payments_ready`, `is_subscription_active` | Lien de paiement renseigné (ou espèces acceptées au comptoir), abonnement `trialing` ou `active`. Inclus dans `is_accepting_orders`. |
| `expire_stale_orders()` | Sans réponse après 10 min → `expired`, paiement jamais finalisé après 35 min → `cancelled`. Appelée par pg_cron via `expire-orders`, qui libère les autorisations Stripe. |
| `set_order_status(order_id, status)` | Machine à états pour les transitions sans Stripe (`accepted → preparing → ready → collected`), réservée au commerçant. |
| trigger `orders_apply_loyalty` | Dans la même transaction que le changement de statut. À `collected` (une seule fois, `loyalty_counted`) : ajoute les menus formules **payés** (instantané `order_items.is_loyalty_menu`, ligne offerte exclue) ; tous les 9 → `rewards_available + 1`, avec retenue (ex. 8 + 3 menus → 1 offert, compteur à 2). À `refused` / `cancelled` / `expired` : rend le menu offert réservé. |

**Menu offert (validé).** Seuls les **menus formules** (`menu_items.is_loyalty_menu`) comptent et peuvent être offerts, jamais les produits au détail. Quand `rewards_available > 0`, le client marque une ligne de menu formule (`use_reward`). `create_order` en isole une unité (ligne `is_loyalty_reward`), déduit son prix de base (`discount_cents`), garde les suppléments payants, et réserve le menu sous verrou de la carte. Une seule utilisation par commande. Si le reste est inférieur à 0,50 €, il est offert aussi : la commande est alors à 0 €, envoyée sans Stripe (`create-order` → `mark_order_authorized`). L'avantage reste d'environ 10 % des menus achetés, quel que soit leur nombre par commande.

Transitions autorisées :
`pending_payment → placed | cancelled` (webhook / annulation client / expiration) · `placed → accepted | refused` (Edge Function `order-decision`, avec Stripe) · `placed → cancelled` (client, `customer-cancel-order`) · `placed → expired` (pg_cron) · `accepted → preparing → ready → collected` (RPC commerçant).

### 3.4 Livraison par livreur indépendant (étape g)

> **Remplacé pour les paiements par le §3.6** : plus de Stripe Connect ni de délai de 5 minutes. Les règles de missions (premier qui accepte, 2 livraisons au plus) restent valables.

**Principes validés.**
- Le client choisit **retrait** ou **livraison** si le restaurant livre.
- Le prix de la course est **fixé par le restaurant** (un tarif unique, dans un rayon qu'il choisit) et affiché avant validation.
- Le client paie **deux paiements séparés**, chacun en charge directe Stripe Connect sans commission :
  - le repas sur le compte du restaurant ;
  - la course sur le compte du livreur.
- ZeeRoo ne touche jamais l'argent. Le relevé du client porte deux lignes : le restaurant et le livreur.
- Le livreur paie l'abonnement ZeeRoo (14,99 € HT par mois, 30 jours d'essai). Le restaurant ne le rémunère pas.

**Activation d'un livreur.** Un livreur peut se rendre disponible s'il remplit trois conditions :
1. Son compte Stripe Connect est actif (`charges_enabled`). Stripe vérifie l'identité et l'immatriculation (SIRET, Kbis ou avis de situation INSEE selon le statut).
2. Son abonnement est `trialing` ou `active`.
3. Au moins un restaurant a accepté son rattachement.

Le SIRET saisi est contrôlé (14 chiffres, clé de Luhn) et unique.

**Missions (migration `20261023094801_missions_cash.sql`, remplace l'attribution à la commande).**
- La commande n'attend plus un livreur : le repas est payé, le restaurant accepte, puis la course est **proposée à tous les livreurs** rattachés, disponibles et ayant de la capacité (`available_missions`, sans l'adresse précise du client). **Le premier qui accepte l'obtient** (`courier_accept_mission` : verrou sur le livreur et `for update skip locked` sur la commande).
- **Capacité** : jusqu'à **2 livraisons simultanées** par livreur, y compris pendant une tournée (`courier_at_capacity`). Un livreur plein ne voit plus de missions.
- À la création, la livraison n'est proposée que s'il existe au moins un livreur rattaché et disponible avec de la capacité (contrôle souple, `merchant_delivery_quote`).
- Un livreur peut **abandonner** une mission non payée (`courier-decline` → `courier_release_mission`) ; elle retourne dans le pool et ne lui est plus reproposée (`order_courier_skips`).
- Les livreurs sont prévenus par notification d'une nouvelle mission (trigger `orders_notify_missions`), le client quand un livreur prend sa course.
- Limite connue : si aucun livreur n'accepte, la commande reste en attente de livreur (pas encore d'alerte ni de bascule en retrait).

**Paiements.**
- **Repas** : autorisé à la commande (capture manuelle, capturé à l'acceptation du restaurant) sur le compte du restaurant. La commande passe en `placed` dès que le repas est autorisé. Refus, annulation ou expiration libèrent l'autorisation : aucun débit. Un repas à 0 € (menu offert) compte comme autorisé.
- **Espèces au comptoir** (retrait uniquement, restaurants avec `accepts_cash_pickup`) : aucun paiement en ligne, la commande est `placed` immédiatement ; `paid_at` est posé au retrait. Pas d'espèces pour le repas d'une livraison.
- **Course** (`delivery_payment_method`, choix du client à la commande) :
  - **carte** : quand un livreur accepte, le client dispose de **5 minutes** (`delivery_payment_due_at`) pour la régler en un geste (Edge Function `pay-delivery`, charge directe sur le compte du livreur, encaissée tout de suite). Non payée à temps, la mission repart dans le pool (`expire_unpaid_missions`, appelée par `expire-orders`) et le paiement ouvert est annulé. Le paiement est rattaché au livreur actuel (`delivery_payment_intent_id`) : un paiement d'un ancien livreur est ignoré ou remboursé. Le restaurant ne remet pas la commande au livreur tant que la course par carte n'est pas payée (`delivery_not_paid`) ;
  - **espèces** : aucun paiement en ligne, le livreur encaisse à la porte ; `delivery_paid_at` est posé à la validation par code.
- ZeeRoo ne touche jamais l'argent des commandes. Le relevé du client porte une ligne par vendeur.
- Phase 2 prévue : carte enregistrée à la commande et course prélevée automatiquement à l'acceptation (nécessite des clients Stripe côté plateforme et le clonage des moyens de paiement vers les comptes livreurs).

**Statuts** (ajouts `out_for_delivery`, `delivered`).

| Transition | Qui | Condition |
|---|---|---|
| `placed → accepted` | restaurant, `order-decision` | capture du repas (rien en espèces) ; la course est ensuite proposée aux livreurs |
| mission prise | livreur, `courier_accept_mission` | le statut ne change pas ; `courier_id`, `courier_accepted_at` |
| `accepted → preparing → ready` | restaurant | inchangé |
| `ready → out_for_delivery` | restaurant (`set_order_status`) | un livreur doit avoir pris la course, et la course par carte être payée ; le livreur présente le **code de retrait** |
| `out_for_delivery → delivered` | livreur (`courier_mark_delivered`) | le client donne son **code de livraison** (4 chiffres) au livreur |
| `ready → collected` | restaurant | retrait uniquement |

Expiration : sans réponse du restaurant après 10 minutes, la commande passe en `expired`. La fidélité compte aussi à `delivered`.

**Données (migration `20261023094750_delivery.sql`).**
- `couriers` (un profil par compte) :
  - `display_name`, `phone` ;
  - `legal_status` (`auto_entrepreneur` | `societe`), `siret` ;
  - `vehicle` (`bike` | `scooter` | `car` | `foot`) ;
  - `is_available`.
- `courier_stripe_accounts` et `courier_subscriptions` : même forme que les tables du commerçant.
- `merchant_couriers (merchant_id, courier_id, status pending | approved | rejected)` : le livreur demande son rattachement, le restaurant accepte, refuse ou retire.
- `merchants` : `delivery_enabled`, `delivery_fee_cents` (de 0,50 € à 20 €), `delivery_radius_m` (de 500 m à 15 km). Ces colonnes sont modifiables par le propriétaire.
- `orders` :
  - `fulfillment` (`pickup` | `delivery`), `delivery_fee_cents` ;
  - l'adresse (ligne, code postal, ville, coordonnées), `delivery_instructions`, `delivery_phone`, `delivery_distance_m` ;
  - `courier_id`, `courier_name` (instantané), `courier_stripe_account_id` ;
  - `delivery_payment_intent_id`, `delivery_checkout_session_id` ;
  - `meal_authorized_at`, `delivery_authorized_at`, `courier_accepted_at`, `out_for_delivery_at`, `delivered_at`, `delivery_paid_at` ;
  - `delivery_code`, `cancelled_by`.
- `total_cents` reste le montant du repas, versé au restaurant ; le client paie `total_cents + delivery_fee_cents`.

**Fonctions SQL** :
- `merchant_delivery_quote(merchant, lat, lng)` : livraison possible, raison sinon, prix, distance ;
- `create_order(…, p_delivery)` ;
- `mark_order_authorized` (repas) et `mark_delivery_authorized` (course) ;
- `create_courier`, `set_courier_availability`, `request_merchant_link`, `leave_merchant` ;
- `decide_courier_link`, `remove_courier` ;
- `courier_mark_delivered`, `courier_earnings_summary` ;
- `purge_delivery_details`.

**RLS.**
- Le livreur voit son profil, ses comptes, ses rattachements et **les commandes qui lui sont attribuées** (avec leurs lignes et le commerce).
- Le restaurant voit les livreurs rattachés ou candidats chez lui (nom, téléphone, véhicule).
- Le client ne voit jamais la table `couriers`, seulement le prénom recopié sur sa commande.
- Toutes les écritures passent par des fonctions serveur.

**RGPD.**
- L'adresse, les coordonnées, le téléphone et les instructions de livraison sont nécessaires à la course. Ce sont les seules coordonnées client stockées.
- Elles sont **effacées 7 jours après** la fin de la commande (`purge_delivery_details`, tâche d'expiration) ; la ville est conservée.
- La position du livreur n'est pas suivie.

### 3.5 Tableaux de bord, avis et option livraison

Migration `20261023094811_dashboards.sql`, écrans calqués sur la démo `docs/maquette/zeeroo-demo.html`.

- **Formules restaurant** : Start (19,99 € HT/mois) = retrait sur place ; Pro (29,99 € HT/mois) = retrait **et option livraison**. `subscriptions.plan` est écrit par le webhook Stripe (prix souscrit). Activer la livraison exige Pro (`delivery_requires_pro`) ; un retour à Start coupe la livraison, et `merchant_delivery_quote` revérifie la formule.
- **Avis** (`order_reviews`) : après une commande retirée ou livrée, le client note le restaurant et, pour une livraison, le livreur (1 à 5 étoiles, un commentaire), une seule fois, via `submit_order_review`. Notes publiques des restaurants : `merchant_ratings` (sans commentaires) ; note du livreur : `courier_rating_summary`. Le restaurant et le livreur lisent les avis qui les concernent (RLS).
- **Entreprise du restaurant** : raison sociale, SIRET (clé de Luhn), n° de TVA, e-mail de contact, publics comme les mentions légales. **Livreur** : zone de travail ; nom, téléphone et véhicule modifiables, SIRET et statut figés.
- **Client** : adresses enregistrées (`customer_addresses`, 10 au plus, une par défaut, proposées dans le panier), restaurants favoris (`customer_favorites`), « Commander à nouveau » qui remet dans le panier les produits encore à la carte.
- **Statistiques** : `merchant_sales_by_day` et `merchant_top_items` (onglet Activité du restaurant), `courier_earnings_by_day` (gains par jour, carte / espèces).

### 3.6 Paiements directs par lien de paiement (décision du 13 octobre 2026)

Migration `20261023094827_payment_links.sql`.

- **Stripe sert uniquement aux abonnements** des restaurants et des livreurs (compte d'AiWorkPay, webhook `stripe-webhook` limité aux abonnements). Plus de Stripe Connect : les fonctions `connect-onboarding`, `pay-delivery` et `order-payment-status` sont supprimées.
- Chaque restaurant et chaque livreur renseigne **son lien de paiement** (`merchants.payment_link`, `couriers.payment_link`, `https://…`) : la page de son propre fournisseur (SumUp, PayPal, Stripe Payment Link, Lydia Pro…), qui accepte la carte, Apple Pay et Google Pay et verse l'argent sur son compte bancaire.
- **Commande** : `create-order` crée la commande et l'envoie aussitôt au restaurant, sans paiement préalable (carte refusée si le restaurant n'a pas de lien : `merchant_no_payment_link`).
- **Repas** : une fois la commande acceptée, le client ouvre le lien du restaurant, paie, puis appuie sur « J'ai payé » (`customer_declare_payment(order, 'meal')` → `meal_payment_declared_at`). Le restaurant confirme la réception (`merchant_confirm_payment` → `paid_at`). Espèces au comptoir : `paid_at` au retrait.
- **Livraison** : quand un livreur prend la mission, le client paie via le lien du livreur (fourni par `order_courier_profile`), déclare (`delivery_payment_declared_at`) et le livreur confirme (`courier_confirm_delivery_payment` → `delivery_paid_at`). Espèces : `delivery_paid_at` à la livraison.
- **Plus de délai de paiement** : `expire_unpaid_missions` ne libère plus rien ; la remise au livreur n'exige plus que la livraison soit payée. Le restaurant et le livreur voient l'état du paiement et décident. Un livreur ne peut plus abandonner une course dont il a confirmé le paiement.
- **Disponibilité** : un restaurant reçoit des commandes avec un lien de paiement ou les espèces au comptoir (`is_payments_ready`) ; un livreur doit avoir un lien de paiement et un abonnement actif (`is_courier_active`, `courier_payment_link_required`).
- Limite assumée : ZeeRoo ne peut pas vérifier les paiements faits hors de l'app ; c'est le professionnel qui confirme. Les anciennes colonnes Stripe des commandes restent en base, inutilisées.

### 3.7 Inscription : Google / Apple pour les clients, vérification des professionnels (13 octobre 2026)

Migration `20261023094834_pro_verification.sql`.

- **Clients** : Google et Apple sont mis en avant sur les écrans de connexion et d'inscription (un geste, pas de mot de passe) ; l'e-mail + mot de passe reste possible en dessous. Le compte est créé à la première connexion. Sur le web (`app.zeeroo.fr`), Google et Apple passent par la redirection OAuth de Supabase (`signInWithOAuth`, retour sur `/auth-callback`) ; sur mobile, par les modules natifs (jeton d'identité → `signInWithIdToken`). `EXPO_PUBLIC_OAUTH_PROVIDERS` liste les fournisseurs activés côté web.
- **Professionnels** (commerçant, livreur) : même choix de connexion (Google, Apple ou e-mail), puis **e-mail confirmé** avant de créer le commerce ou le profil livreur (décision du propriétaire : plus de vérification par téléphone ni SMS pour l'instant ; migration `email_only_pro_verification`). Avec Google ou Apple, l'e-mail est déjà confirmé.
- **Côté serveur** : `is_pro_verified()` et un trigger `require_verified_pro` sur l'insertion dans `merchants` et `couriers` (erreur `pro_verification_required`). Les écritures sans utilisateur (données de démo, service) ne sont pas concernées. Le numéro de téléphone saisi reste un champ de contact facultatif.
- **Configuration Supabase** : fournisseurs Google et Apple (Authentication → Providers). Le fournisseur Phone reste désactivé : aucun SMS, aucun coût associé.

### 3.8 Modes de commande et dark kitchens (21 octobre 2026)

- Catégories : `snack`, `sandwicherie`, `restaurant`, `boulangerie`, **`dark_kitchen`** (cuisine sans boutique), `autre`.
- `merchants.offers_pickup` (retrait sur place, défaut `true`, `false` à la création d'une dark kitchen) et `delivery_enabled` (existant, formule Pro). Colonnes calculées : `offers_delivery` (= `delivery_enabled` **et** formule Pro) et `has_order_mode` (= retrait ou livraison). `is_accepting_orders` exige au moins un mode.
- `create_order` refuse un retrait non proposé (`pickup_unavailable`) et revérifie la formule Pro pour la livraison. Couper le retrait suppose une livraison active (`order_mode_required`).
- `merchants.pickup_instructions` (300 caractères) : consignes affichées sur la fiche et sur la commande.
- Annuaire public (`nearby_merchants`, `search_merchants`) : pour un établissement **sans retrait**, l'adresse est omise, la recherche par code postal ne le trouve pas et la distance est calculée sur une grille d'environ 1 km, arrondie à 500 m.
- **Adresse précise (corrigé le 28 octobre 2026)** : elle vit dans la table fermée `merchant_locations` (aucun droit pour `anon` / `authenticated`). L'API publique ne la renvoie jamais ; les colonnes `address_line`, `latitude`, `longitude` de `merchants` restent vides (un déclencheur redirige les écritures). L'app lit `address_line:merchant_address_line` (et latitude / longitude), colonnes calculées qui ne rendent la valeur qu'à un établissement qui accueille du public (retrait), à son propriétaire et aux livreurs qu'il a acceptés. Les fonctions de l'annuaire, des distances, de l'attribution et du groupage lisent la vraie valeur côté serveur. `postal_code` et `city` restent publics (zone de service). Fonction `customer-departure` à redéployer.
- **Annuaire public** : `/decouvrir` (sans compte) ; la connexion n'est demandée que pour commander ou enregistrer un favori.
- **Annuaire de l'application = affiliés seulement (migrations `affiliated_directory`, `publication_guard`)** : affilié = abonnement ZeeRoo `trialing`/`active` **et** encaissement configuré (`payment_link` ou `accepts_cash_pickup`). Stripe ne sert qu'à l'abonnement de la plateforme : **aucun compte Stripe Connect n'est exigé** pour publier. Les commerces non inscrits ne sont jamais en base (ils n'existent que dans l'annuaire statique de zeeroo.fr, avec la mention « Pas encore sur ZeeRoo »).
- **Publication imposée par PostgreSQL** : une fiche est créée en brouillon privé à l'onboarding. Le déclencheur `merchants_publication_guard` refuse `is_published = true` pour les rôles `anon` / `authenticated` (erreur `merchant_not_affiliated`, y compris par appel direct à l'API) tant que le professionnel n'est pas affilié, et dépublie une fiche publiée dont l'encaissement est retiré. Le déclencheur `subscriptions_unpublish_on_lapse` dépublie la fiche quand le statut d'abonnement quitte `trialing`/`active` (annulé, impayé, en pause, expiré) ; la fiche et ses données sont conservées et le professionnel la republie lui-même après régularisation. Le serveur (`postgres`, `service_role`, fonctions `SECURITY DEFINER`) n'est pas soumis à la garde.
- **Webhook Stripe sans désordre** : chaque événement est dédupliqué (`stripe_events`), et pour les événements d'abonnement l'état réel est relu chez Stripe (un événement tardif ne réactive ni ne suspend à tort). Un événement d'un ancien abonnement terminé ne touche pas le nouvel abonnement en cours.

### 3.9 Disponibilité de livraison fiable (21 octobre 2026)

- **Fenêtre de disponibilité** : `couriers.available_until`. Se mettre disponible ouvre une fenêtre de 15 minutes, renouvelée toutes les 5 minutes par `courier_heartbeat()` tant que l'app est ouverte (et au retour au premier plan). `is_online` (colonne calculée) = disponible **et** fenêtre non expirée. Une fenêtre expirée ne se rétablit pas par le signal : le livreur la rouvre lui-même. La déconnexion le met hors ligne. Les disponibilités existantes sont périmées à l'application de la migration.
- **Qui est proposé** : `available_couriers`, `available_missions`, `courier_accept_mission` et la notification « nouvelle mission » ne retiennent que les livreurs **en ligne**, rattachés (`approved`), avec abonnement et lien de paiement, et sous la capacité (2 livraisons simultanées, **tous établissements confondus**).
- **Ce que voit le client** : `merchants.delivery_available_now` = livraison proposée (formule Pro) **et** au moins un livreur proposable. Sinon : retrait seul si l'établissement l'offre, sinon « Livraison momentanément indisponible » et commande impossible. Le serveur revérifie à la commande (`no_courier_available`) et à l'attribution (`courier_unavailable`, `courier_at_capacity`).
- **Une seule prise en charge** : `for update skip locked` sur la commande + verrou sur la ligne du livreur ; vérifié avec deux sessions SQL simultanées (`supabase/tests/concurrency/missions.sh`).
- **Mission que personne ne prend** : `orders.delivery_unclaimed_at` est posé par `flag_unclaimed_missions()` (tâche pg_cron chaque minute) 15 minutes après l'acceptation par le restaurant. Le client et le restaurant sont prévenus (notification `mission_unclaimed`) et peuvent annuler (`cancel_unclaimed_delivery`). **Aucun remboursement n'est simulé** : le repas est payé directement au restaurant (lien de paiement), le remboursement éventuel se règle entre eux ; une récompense fidélité utilisée est rendue.

### 3.10 Formules, créneaux de menu, horaires de jour et de nuit (22 octobre 2026)

- **Formule** : `menu_items.is_formula`. Une formule est un produit dont les composants sont des **groupes d'options obligatoires** (`min_select ≥ 1`, système existant) ; le prix est celui du produit plus les suppléments choisis, validé par `create_order`. Le professionnel décide quelles formules comptent pour la fidélité (`is_loyalty_menu`).
- **Moments** : `menu_items.meal_periods` ⊂ {`breakfast`, `lunch`, `dinner`, `night`}. Dans l'app, choisir un moment crée les créneaux types (petit déjeuner 06:00–11:00, déjeuner 11:00–15:00, dîner 18:00–23:00, nuit 22:00–04:00) via `set_item_slots` ; l'écran prévient si un moment tombe hors des horaires d'ouverture.
- **Créneaux** : `menu_item_slots` (jour ISO, début, fin ; fin < début = passe minuit). Sans créneau, le produit est servi pendant toute l'ouverture. `is_in_slot(item, instant)` évalue dans le fuseau de l'établissement ; `create_order` refuse un produit hors créneau (`item_out_of_slot`) ; la fiche publique grise le produit et affiche ses heures de service (colonne calculée `is_in_slot_now`).
- **Fenêtre hebdomadaire commune** : `time_in_window` sert aux horaires, aux créneaux de menu et servira aux promotions (même règle, passage de minuit : le soir, puis le lendemain matin ; le dimanche déborde sur le lundi).
- **Horaires** : plusieurs plages par jour et passage de minuit (déjà gérés) ; **fermetures exceptionnelles** (`merchant_closures`, jours entiers en heure de l'établissement via `add_closure`) prioritaires sur les horaires et affichées sur la fiche publique.
- **Cohérence** : un produit n'est commandable que si l'établissement est ouvert (horaires, fermetures, pause, abonnement, mode actif) **et** que le produit est dans son créneau **et** disponible. La disponibilité des livreurs est indépendante des horaires (24 h/24, § 3.9).

### 3.11 Happy Hours (23 octobre 2026)

Promotions programmées, **incluses dans Start et Pro, sans commission**. Ce n'est pas une offre anti-gaspi.

- **Modèle** : `happy_hours` (nom, `discount_type` `percent` ou `price`, validité, retrait/livraison, quota, activation), `happy_hour_slots` (jours + plages, passage de minuit, comme les horaires), `happy_hour_items` (produits ou formules visés, prix promotionnel pour une offre « prix »). Écriture par `save_happy_hour` / `set_happy_hour_active` / `delete_happy_hour` uniquement (validation côté serveur : produit du commerce, vraie réduction) ; lecture publique si le commerce est publié.
- **Règles de prix, côté serveur seulement** (`active_happy_hours` + `create_order`) :
  - **une offre par produit, jamais cumulée** ; en cas de chevauchement, le prix le plus bas gagne, puis l'offre la plus ancienne, puis le plus petit identifiant ;
  - la réduction porte sur le **prix du produit, pas sur les suppléments** ; une offre qui ne réduit pas le prix n'est pas retenue ;
  - le **menu offert de la fidélité reste au plein tarif** (il remplace l'offre) ;
  - **quota** : verrou sur l'offre, deux commandes simultanées ne dépassent jamais le stock (vérifié avec deux sessions SQL). Au-delà du stock restant, le reste de la ligne est au **tarif habituel** ; la commande refusée, expirée ou annulée rend son stock ;
  - **prix annoncé** : le client envoie le total qu'il a vu pour chaque ligne (`expected_total_cents`). S'il a changé (offre terminée, stock épuisé, prix modifié) la commande est refusée (`price_changed`) et le panier est relu ; rien n'est facturé à l'insu du client ;
  - **prix conservé dans la commande** : `order_items.unit_price_cents` (appliqué), `regular_unit_cents` (tarif habituel), `happy_hour_id`, `happy_hour_name`.
- **Côté client** : badge « Happy Hour », prix promotionnel, tarif habituel barré (le prix pratiqué hors offre), heure de fin, stock restant, sur la fiche et dans le panier ; une offre qui se termine pendant la préparation du panier est signalée. Colonne calculée `has_happy_hour_now` pour le filtre de l'annuaire.
- **Affichage des réductions** : le « prix habituel » affiché est le tarif de la carte. Le commerçant doit pratiquer réellement ce prix hors de l'offre ; l'éditeur le rappelle. La conformité réglementaire (par exemple la règle du prix de référence sur 30 jours pour les annonces de réduction) reste à faire valider par le titulaire avant mise en production.

### 3.12 Annuaire, favoris, « Recommander » (24 octobre 2026)

- **Annuaire** : `nearby_merchants` et `search_merchants` renvoient, pour les seuls établissements publiés, les modes (`offers_pickup`, `offers_delivery`), la disponibilité réelle (`delivery_available_now`), `has_happy_hour_now`, les moments de repas servis (`meal_periods`, produits disponibles) et la position (`latitude`, `longitude`). Les **filtres** (catégorie, ouvert maintenant, retrait, livraison disponible, Happy Hour, moment) s'appliquent dans l'app sur ces colonnes (`features/discover/filters.ts`, testé). La recherche fonctionne par nom/ville/code postal, par **adresse** (géocodage IGN, sans géolocalisation) ou autour de la position si le client l'autorise.
- **Carte** : sur le **web** (Leaflet, fond OpenStreetMap par défaut, configurable par `EXPO_PUBLIC_MAP_TILES_URL`). Un établissement **sans accueil du public** (dark kitchen) a `latitude`/`longitude` nulles : il n'est pas placé sur la carte, et sa fiche affiche sa zone de service. **Sur iOS/Android, la carte intégrée n'est pas livrée** : elle demande `expo-maps`, un build de développement et une clé Google Maps (Android) ; l'annuaire y reste en liste, avec l'itinéraire vers l'app de plans pour les établissements qui accueillent.
- **Favoris** (`customer_favorites`, RLS par propriétaire, supprimés avec le compte) : synchronisés entre appareils, affichés avec leur état actuel (ouvert, modes, livraison momentanément indisponible, Happy Hour). Un établissement dépublié disparaît de la liste côté client (RLS sur `merchants`), il n'est jamais présenté comme commandable.
- **Recommander** (historique et détail d'une commande) : reconstitue le panier avec les produits, quantités et options encore disponibles, aux **prix actuels** (une promotion passée n'est jamais reprise ; l'offre en vigueur s'applique ensuite). Les produits supprimés, en rupture, hors créneau ou dont une option a disparu sont écartés **et signalés**, les prix modifiés aussi ; les horaires et le mode de commande sont revérifiés (mode de repli si besoin). Aucun paiement ni envoi : le panier s'ouvre avec un compte rendu à relire.

### 3.13 Mini-site Pro et liens publics (25 octobre 2026)

- **Pour tous (Start compris)** : le lien `https://zeeroo.fr/m/<slug>` ouvre la **fiche de commande** : nom, catégorie, adresse ou zone de service, horaires, fermetures exceptionnelles, menu et formules, Happy Hours en cours, modes de commande réels, commande directe, photo, itinéraire seulement si l'établissement accueille le public.
- **Formule Pro** : personnalisation (`logo_url`, `tagline`, `about`, `accent_color`) et carte de situation (web). `merchants.has_minisite` (colonne calculée : Pro en essai ou actif). Écrire un réglage demande Pro (`minisite_requires_pro`, déclencheur) ; **effacer** reste possible. Aucune double saisie : la photo, les horaires, le menu, les Happy Hours et les modes viennent des écrans existants.
- **Expiration de Pro** : aucune donnée supprimée, **le lien ne change pas**, la fiche repasse à la présentation Start (`siteStyle`, testé) ; les réglages sont retrouvés au retour en Pro et l'écran Mini-site le dit.
- **Acheminement du lien** : `zeeroo.fr/m/<slug>` est servi par la vitrine (GitHub Pages) dont `404.html` renvoie vers `app.zeeroo.fr/m/<slug>` en conservant chemin, paramètres et ancre. Anciens QR `zeroo.online/m/<slug>` : règles `redirects` de `vercel.json` (voir `docs/DEPLOIEMENT.md`, domaine à ajouter chez Vercel).
- **Limite** : l'aperçu enrichi (image, titre) lors d'un partage sur les réseaux n'est pas servi, la fiche étant rendue dans l'application après redirection.

### 3.14 Paniers anti-gaspi (26 octobre 2026)

Fonction **complémentaire**, incluse dans Start et Pro, placée après la carte sur la fiche : jamais le positionnement principal.

- **Modèle** : `surprise_baskets` (titre, contenu connu ou **panier surprise**, prix, valeur estimée facultative, nombre de paniers, **allergènes** parmi les 14 réglementaires + certification de l'exactitude, créneau de retrait de 12 h maximum, activation) et `basket_reservations` (client, quantité 1 à 3, prix figé, code de retrait, statut `reserved` / `collected` / `cancelled` / `expired`). Écriture par fonctions seulement (`save_basket`, `set_basket_active`, `reserve_basket`, `cancel_basket_reservation`, `collect_basket_reservation`) ; lecture publique des offres ouvertes d'un commerce publié.
- **Paiement** : **sur place, au retrait**, directement au commerçant. Aucun paiement en ligne, aucun remboursement à gérer, rien n'est encaissé par ZeeRoo.
- **Stock protégé** : verrou sur le panier ; deux réservations simultanées ne dépassent jamais le stock (vérifié avec deux sessions SQL). Limite de 3 paniers actifs par client et par offre.
- **Annulation** : le client jusqu'au début du créneau, le commerçant à tout moment avant la remise ; le stock est libéré.
- **Fermeture automatique** : `is_reservable` (colonne calculée) est faux dès la fin du créneau ; les réservations non retirées expirent 30 minutes après (tâche pg_cron, `expire_basket_reservations`). Le stock d'une offre terminée n'est pas remis en vente.
- **Informations alimentaires** : allergènes déclarés affichés ; un panier surprise affiche en plus une mise en garde (composition variable, demander au commerçant en cas d'allergie). L'offre ne peut pas être proposée sans certification de l'exactitude (`allergens_confirmed`).
- **RGPD** : le nom du client est effacé avec son compte (réservation conservée, anonymisée).

### 3.2 Row Level Security (résumé)

Principe : **les clients ne font jamais d'INSERT ni d'UPDATE sur `orders`, `order_items`, `loyalty_cards`, `subscriptions` ou `merchant_stripe_accounts`**. Ces écritures passent par les Edge Functions (service role) ou par des fonctions `security definer` qui vérifient les droits.

| Table | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| profiles | soi-même ; le commerçant pour ses clients (nom seulement, via vue) | soi-même (update des colonnes autorisées) |
| merchants | tous (y compris anonyme) si `is_published` ; propriétaire toujours | propriétaire (update) ; création via RPC `create_merchant` |
| merchant_stripe_accounts, subscriptions | propriétaire | service role uniquement |
| merchant_opening_hours, menu_* | public si le commerçant est publié ; propriétaire | propriétaire |
| orders, order_items | client propriétaire ; commerçant concerné | aucune directe (Edge Functions / RPC) |
| loyalty_cards | le client ; commerçant concerné (pour la caisse) | aucune directe (trigger) |
| push_tokens | soi-même | soi-même |
| stripe_events | personne | service role |

Realtime : on publie `orders` (et `loyalty_cards`). La RLS filtre les événements, donc chacun ne reçoit que ses lignes.

### 3.3 RGPD

- Localisation demandée **au moment de l'usage** (recherche à proximité, « Je pars »), avec un écran d'explication avant la demande système. Si le client refuse, il peut chercher par ville ou code postal.
- Aucune coordonnée du client n'est stockée en base.
- Suppression de compte (exigée par Apple et Google) : RPC `delete_my_account()` (étape a), qui supprime l'utilisateur ; profil, tokens et cartes de fidélité suivent par cascade. Les commandes sont **anonymisées** (`customer_id = null`) et non supprimées, à cause des obligations comptables du commerçant. Pour un propriétaire de commerce, `delete_my_account()` refuse explicitement (`merchant_owner_cannot_delete`). À l'étape (d), une Edge Function clôturera d'abord le commerce et résiliera l'abonnement Stripe.
- Données minimales : nom d'affichage optionnel, téléphone optionnel.

### 3.15 Livraisons groupées, première version (27 octobre 2026)

Un livreur garde la limite de 2 livraisons simultanées. La deuxième n'est prise que si `missions_compatible()` l'accepte (contrôle serveur dans `courier_accept_mission`, erreur `mission_not_compatible`, et filtre dans `available_missions`) :

- retraits : même restaurant ou restaurants à 1 km au plus ;
- livraisons : adresses à 2 km au plus ;
- préparations : heures de fin de préparation à 15 minutes au plus d'écart ;
- la première course ne doit pas être déjà `out_for_delivery`.

Chaque commande garde son statut, son code de livraison, son client et son prix de course : **aucune remise ni répartition financière inventée**, aucune coordonnée d'un client partagée avec un autre. `courier_stops()` donne la tournée (retraits groupés par restaurant, puis livraisons de proche en proche) ; `order_delivery_eta()` donne au client l'heure estimée de **sa** commande, arrondie aux 5 minutes.

Limites assumées : estimation par vitesse moyenne du véhicule (5/15/20/25 km/h) + 3 minutes par arrêt, sans géolocalisation en direct du livreur ni calcul d'itinéraire routier ; ordre des livraisons par plus proche voisin (pas d'optimisation exacte) ; les seuils sont des constantes SQL (`grouping_max_*`), à ajuster sur retour terrain.

## 4. Variables d'environnement prévues

```
# App (publiques, embarquées dans le bundle)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_WEB_URL=                 # pour les liens QR / abonnement

# Edge Functions (secrets Supabase, jamais dans l'app)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_START_MONTH=
STRIPE_PRICE_START_YEAR=
STRIPE_PRICE_PRO_MONTH=
STRIPE_PRICE_PRO_YEAR=
STRIPE_PRICE_COURIER_START_MONTH=
STRIPE_PRICE_COURIER_START_YEAR=
STRIPE_PRICE_COURIER_PRO_MONTH=
STRIPE_PRICE_COURIER_PRO_YEAR=
GOOGLE_ROUTES_API_KEY=
EXPO_ACCESS_TOKEN=
ORDER_ACCEPT_TIMEOUT_MINUTES=10
```

## 5. Plan de livraison

| Étape | Contenu | Test |
|---|---|---|
| a ✅ | Expo SDK 57 + Router + TS + i18n + Supabase local + profils + auth (e-mail, Apple, Google) + choix d’espace + suppression de compte | Voir README : tests pgTAP, Jest, parcours manuel |
| b ✅ | Création du commerce (adresse géocodée), menu (catégories, produits, options, rupture, ordre), horaires, pause, publication, commandes en temps réel avec sonnerie, transitions de statut, code de retrait, CA du jour, historique, QR code | `npm run dev:order`, tests pgTAP, parcours web de bout en bout |
| c ✅ | Recherche (proximité + nom / ville / code postal), fiche et menu publics (lien du QR code), panier avec options, commande via `create_order()` (sans paiement), suivi temps réel, historique | pgTAP + `npm run e2e` (client et commerçant dans deux navigateurs) |
| d ✅ | Stripe Connect (inscription + webhooks), PaymentSheet (mobile) et Checkout (web), pré-autorisation puis capture à l'acceptation, refus / annulation / expiration sans débit, abonnement Billing avec essai de 30 jours (web) | pgTAP, `e2e/payments.e2e.js` contre stripe-mock, parcours web avec pages Stripe simulées ; à valider avec les clés de test du compte ZeeRoo |
| e ✅ | Fidélité (menus formules uniquement) : décompte au trigger, menu offert réservé à la commande et rendu en cas d'échec, commande à 0 € sans Stripe, carte client (onglet + fiche commerce), affichage commerçant | 24 tests pgTAP, `e2e/loyalty.e2e.js` |
| f ✅ | Push Expo sur changement de statut (trigger + pg_net + `notify-order-update`), « Je pars maintenant » (`customer-departure`, Google Routes avec repli sur une estimation), conseil « lancer la préparation dans X min » | 15 tests pgTAP, `e2e/notifications.e2e.js` (faux Expo Push et Google), parcours web ; à valider sur appareil physique |
| g ✅ | Livraison par livreur indépendant : espace livreur (profil, SIRET, Stripe Connect, abonnement 14,99 € HT, rattachement aux restaurants, disponibilité, courses, revenus), réglages de livraison du restaurant (prix, rayon, livreurs), choix retrait / livraison et adresse côté client, double paiement repas + course, codes de retrait et de livraison | pgTAP (`delivery.test.sql`), `e2e/delivery.e2e.js` contre stripe-mock |

## Comptes séparés (25 octobre 2026)

Un compte Auth appartient définitivement à un seul espace : client, restaurant (`merchant`) ou livreur (`courier`). `profiles.account_space` fait autorité. `claim_account_space` affecte une seule fois l'espace à l'utilisateur de la session, sous verrou de ligne ; le navigateur ne peut pas écrire cette colonne. L'ancien `zeroo.space` est ignoré. Un autre usage exige une déconnexion et un compte distinct. Les caches de requêtes sont purgés au changement d'identité.

Les créations de commerce, de livreur et de commande contrôlent l'espace en base. Les helpers de propriété et les fonctions serveur de facturation/création de commande le contrôlent aussi. Les routes privées sont fermées pendant la lecture du rôle ; un lien direct vers un autre espace ne l'accorde pas. Les menus publics restent consultables.

Reprise : les comptes possédant un seul profil professionnel retrouvent cet espace automatiquement. Les anciens comptes de démonstration multi-profils doivent choisir une fois leur espace définitif. Les données et abonnements historiques restent conservés. Avant le déploiement, examiner ces comptes et leurs éventuels abonnements : une réaffectation de données à un compte distinct demande un traitement administratif explicite. Cette migration ne refond pas toutes les anciennes RPC métier ; leur contrôle d'identité et leurs RLS restent en place. Ne pas appliquer la migration en production sans déployer aussi les fonctions serveur et le frontend correspondants.


## Administration web autonome — authentification (28/10/2026)

Le site statique `admin-web/` utilise Supabase Auth (email et mot de passe), valide la session avec `getUser()` puis vérifie l’appartenance du compte à `public.platform_admins` sous RLS. À la demande explicite du propriétaire, aucun enrôlement TOTP ni niveau AAL2 n’est requis par ce site. Les politiques RLS et les droits administrateur restent inchangés. Le site ne modifie ni les facteurs MFA existants ni les autres applications du projet.


### Données réelles du dashboard administrateur (28/10/2026)

Le navigateur lit `merchants`, `couriers`, `orders`, `subscriptions` et `courier_subscriptions` avec la session utilisateur et les règles RLS. Cinq politiques SELECT autorisent la lecture transversale uniquement si `is_platform_admin()` confirme une appartenance à `platform_admins`. Aucun accès métier en écriture ni clé privilégiée n’est ajouté. La vue d’ensemble utilise des comptages exacts ; les listes sont paginées par 25 avec projection explicite des colonnes et jointures de noms. Les demandes devenues obsolètes après navigation sont ignorées. Les litiges n’ont pas de source locale et restent signalés non connectés.
