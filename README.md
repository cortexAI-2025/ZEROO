# ZeeRoo

> Le bon goût. Sans commission.

Click-and-collect et livraison **sans commission** pour restaurants, snacks et sandwicheries. **ZeeRoo est un service, pas un vendeur** : les repas sont vendus par les restaurants au prix de leur carte, et le paiement leur est versé directement. Le restaurant paie un abonnement fixe, le client ne paie aucun frais. Le commerçant paie un abonnement (30 jours d'essai, puis Start 19,99 € HT/mois ou Pro 29,99 € HT/mois avec l'option livraison, moins cher à l'année) et ne verse aucune commission sur ses commandes. Le client commande et paie depuis son téléphone, puis récupère sa commande déjà prête. Fidélité intégrée : 9 menus achetés, le 10e est offert.

- Architecture, schéma de données et plan de livraison : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Démo cliquable (client, restaurant, livreur) : [docs/maquette/zeeroo-demo.html](docs/maquette/zeeroo-demo.html), voir [docs/maquette/README.md](docs/maquette/README.md)
- Stack : Expo SDK 57 (React Native, TypeScript, Expo Router) · Supabase (Postgres, Auth, RLS, Realtime) · Stripe Billing (abonnements) (à venir)

## Avancement

| Étape | Contenu | État |
|---|---|---|
| a | Setup Expo + Supabase, authentification, choix d'espace, suppression de compte | ✅ |
| b | Espace commerçant : commerce, menu, horaires, pause, commandes en temps réel, QR code | ✅ |
| c | Espace client : recherche, fiche et menu, panier avec options, commande, suivi en direct | ✅ |
| d | Paiement direct par lien de paiement des pros (carte, Apple Pay, Google Pay) et abonnement Stripe | ✅ (à brancher sur ton compte Stripe) |
| e | Fidélité : 9 menus formules achetés = le 10e offert | ✅ |
| f | Notifications push, « Je pars maintenant » et temps de trajet | ✅ (à brancher sur Expo et Google) |
| g | Livraison par livreur indépendant : espace livreur, double paiement repas + course, abonnement livreur | ✅ (à brancher sur ton compte Stripe) |

## Prérequis

- Node.js 20 ou plus récent, et npm
- Docker (pour Supabase en local)
- Pour tester sur téléphone : l'app **Expo Go** (connexion par e-mail) ou un **build de développement** (Apple et Google Sign-In)

## Démarrage

```bash
npm install
cp .env.example .env.local

# 1. Base de données locale (Postgres, Auth, Mailpit pour les e-mails)
npm run db:start
#    → recopiez API_URL et ANON_KEY (ou PUBLISHABLE_KEY) dans .env.local

# 2. Fonctions serveur (paiements) : voir « Configurer Stripe » plus bas
cp supabase/functions/.env.example supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env

# 3. Application
npm run web        # navigateur, le plus simple pour tester les e-mails
npm start          # puis QR code dans Expo Go, ou touche i / a pour un simulateur
```

Sur un téléphone physique, `127.0.0.1` désigne le téléphone lui-même. Mettez l'adresse IP de votre ordinateur dans `EXPO_PUBLIC_SUPABASE_URL`, par exemple `http://192.168.1.20:54321`.

### E-mails en local

Supabase local n'envoie pas de vrais e-mails : ils arrivent dans **Mailpit**, sur http://127.0.0.1:54324. Les liens de confirmation et de réinitialisation renvoient vers `…/auth-callback` :

- **Web** : cliquez le lien depuis Mailpit, dans le même navigateur.
- **Téléphone** : ouvrez Mailpit depuis le navigateur du téléphone (`http://<IP de l'ordinateur>:54324`), puis cliquez le lien. Il rouvre l'app.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run check` | Typage, lint, format et tests unitaires (à lancer avant chaque commit) |
| `npm test` | Tests unitaires Jest |
| `npm run db:test` | Tests pgTAP de la base : RLS, règles métier |
| `npm run db:reset` | Recrée la base locale à partir des migrations et de `supabase/seed.sql` |
| `npm run db:types` | Régénère `src/types/database.ts` à partir du schéma local |
| `npm run format` | Formate le code avec Prettier |
| `npm run e2e` | Tests de bout en bout dans un navigateur (voir plus bas) |
| `npm run dev:order` | Simule une commande payée chez « Chez Samir » (`SLUG=mon-commerce npm run dev:order` pour un autre commerce) |

## Tester l'étape (a)

Tests automatiques :

```bash
npm run check      # 13 tests unitaires
npm run db:test    # 9 tests pgTAP sur la sécurité des profils et la suppression de compte
```

Parcours manuel (web ou téléphone) :

1. **Inscription** : « Pas encore de compte ? » → prénom, e-mail, mot de passe. Un mot de passe faible (moins de 8 caractères, ou sans chiffre) est refusé. Après validation, l'écran « Vérifiez votre boîte mail » s'affiche.
2. **Connexion avant confirmation** : elle est refusée avec « Confirmez d'abord votre adresse e-mail ».
3. **Confirmation** : cliquez le lien reçu dans Mailpit. Vous êtes connecté et l'app demande « Que souhaitez-vous faire ? ».
4. **Espaces** : « Commander » ouvre l'espace client (onglets « À proximité », « Commandes », « Compte »). Dans « Compte », « Passer à l'espace commerçant » ouvre l'espace commerçant, à l'adresse `/pro` sur le web.
5. **Persistance** : fermez puis relancez l'app (ou rechargez la page). La session et l'espace choisi sont conservés.
6. **Mot de passe oublié** : déconnectez-vous, puis « Mot de passe oublié ? ». Ouvrez le lien reçu dans Mailpit et choisissez un nouveau mot de passe.
7. **Suppression du compte** : « Compte » → « Supprimer mon compte » → confirmez. Une nouvelle connexion avec ce compte est ensuite impossible.

Ce parcours a été joué de bout en bout dans Chromium (version web) contre le Supabase local.

## Tester l'étape (b) : espace commerçant

`npm run db:reset` charge des données de démo (mot de passe `motdepasse1` pour les deux comptes) :

| Compte | Rôle |
|---|---|
| `commercant@zeroo.test` | Propriétaire du snack « Chez Samir » (menu, options, horaires 6 h – 2 h, publié) |
| `client@zeroo.test` | Cliente « Nadia », au nom de qui partent les commandes de test |

Tests automatiques : `npm run check` (tests unitaires) et `npm run db:test` (tests pgTAP). Ils couvrent notamment :
- la sécurité d'accès : chaque commerçant ne voit et ne modifie que son propre commerce, son menu et ses commandes ;
- les horaires, y compris les créneaux après minuit et le fuseau horaire ;
- la pause temporisée ;
- la machine à états des commandes et le code de retrait ;
- le chiffre d'affaires du jour ;
- l'anonymisation des commandes quand un client supprime son compte.

Parcours manuel (une tablette ou un navigateur côté caisse suffit) :

1. **Créer un commerce** : avec un nouveau compte, choisissez « Gérer mon commerce », renseignez le nom, le type, puis l'adresse. Choisissez une suggestion pour que le commerce soit géolocalisé.
2. **Menu** (onglet Menu) :
   - ajoutez une catégorie, puis un produit (prix au format `8,50`) ;
   - cochez « C'est un menu » pour la fidélité ;
   - après l'enregistrement, ajoutez un groupe d'options (ex. « Sauce », 1 au choix) et ses options ;
   - l'interrupteur de la liste coupe un produit en rupture du jour, les flèches ↑ ↓ changent l'ordre.
3. **Boutique** :
   - saisissez les horaires (`11:30`, `18h`, et un créneau peut finir après minuit), puis « Copier le lundi sur toute la semaine » ;
   - activez « Visible des clients ». Cette option est bloquée tant qu'il n'y a ni produit disponible ni horaire ;
   - testez une pause de 15 min, puis « Reprendre les commandes ».
4. **QR code** (Boutique → QR code) : il pointe vers `https://zeroo.online/m/<slug>` (le site redirige vers l'app web). On peut le partager, ou l'imprimer depuis le web.
5. **Commandes en direct** (onglet Commandes) : laissez l'écran ouvert, puis lancez `npm run dev:order` dans un terminal.
   - La commande apparaît sans rechargement, avec une sonnerie. Sur le web, cliquez d'abord « Activer la sonnerie ».
   - Choisissez un délai puis « Accepter » → « Lancer la préparation » → « Commande prête ».
   - Saisissez le code de retrait : un mauvais code est refusé. Le bon code est affiché par `npm run dev:order` (en conditions réelles, le client le montre sur son téléphone). Le chiffre d'affaires du jour se met à jour.
   - Lancez une autre commande et refusez-la avec un motif. Elle apparaît dans « Historique des commandes ».

Ces cinq parcours, et celui de l'étape (a), ont été joués de bout en bout dans Chromium contre le Supabase local.

## Tester l'étape (c) : espace client

Avec les données de démo (`npm run db:reset`), en navigateur ou sur téléphone :

1. **Sans compte, comme après un scan de QR code** : ouvrez `/m/chez-samir`, par exemple http://localhost:8081/m/chez-samir. La fiche et le menu sont visibles sans se connecter.
2. **Options** : touchez « Menu Tacos ».
   - La sauce est obligatoire (2 au maximum) et le cheddar coûte +1,00 €.
   - Le bouton « Ajouter » affiche le prix total. Un choix incomplet est signalé.
3. **Panier** :
   - modifiez les quantités et ajoutez une précision pour le commerçant ;
   - « Se connecter pour commander » : connectez-vous avec `client@zeroo.test`, vous revenez directement au panier ;
   - « Payer » : feuille de paiement Stripe sur mobile, page Stripe Checkout sur le web.
4. **Suivi** : l'écran de commande affiche le code de retrait et l'avancement.
   - Ouvrez l'espace commerçant de `commercant@zeroo.test` dans un autre navigateur, ou sur un autre appareil.
   - Acceptez, passez à « prête », puis remettez la commande avec le code. Le suivi client se met à jour en direct.
5. **Recherche** (onglet « À proximité ») :
   - par nom, ville ou code postal (ex. `75002`) ;
   - ou « Utiliser ma position ». La permission n'est demandée qu'à ce moment-là, et la position n'est jamais enregistrée.
6. **Commerce en pause** : mettez « Chez Samir » en pause côté commerçant. La fiche affiche un bandeau, et une commande déjà dans le panier est refusée par le serveur avec un message clair.

Le serveur recalcule chaque commande (`create_order`) :
- prix lus dans le menu en base ;
- options valides, avec leur minimum et leur maximum ;
- produits disponibles ;
- commerce publié, ouvert et pas en pause.

Ces règles sont couvertes par 23 tests pgTAP.

## Étape (d) : paiements

### Fonctionnement
- **Le client paie chaque professionnel directement**, par carte, Apple Pay ou Google Pay via **le lien de paiement du restaurant ou du livreur** (SumUp, PayPal, Stripe Payment Link, Lydia Pro…), ou en espèces. L'argent arrive sur leur compte bancaire ; ZeeRoo n'encaisse rien et **Stripe ne sert qu'aux abonnements** (compte d'AiWorkPay).
- **Rien n'est payé à la commande.** Une fois la commande acceptée, le client ouvre le lien du restaurant, paie, puis appuie sur « J'ai payé » ; le restaurant confirme « Paiement reçu ». En livraison, même principe avec le livreur qui prend la mission.
- **Restaurant / livreur** :
  - « Lien de paiement » (Boutique / Compte) : coller l'adresse de leur page de paiement ;
  - l'abonnement, 30 jours d'essai puis Start ou Pro (mensuel ou annuel, voir « Grille tarifaire »), se souscrit et se gère depuis la version web (`/pro`), pour respecter les règles d'Apple et Google ;
  - sans lien de paiement (ou espèces au comptoir) et abonnement en règle, le commerce affiche « Configuration à terminer » et ne reçoit pas de commandes ; un livreur sans lien ne peut pas se rendre disponible.

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), §3.6.

### Grille tarifaire

Prix HT, TVA 20 % en plus. Seuls les abonnements passent par Stripe : les restaurants encaissent leurs commandes et les livreurs leurs courses directement, sur leur propre compte. Le client ne paie rien.

| Profil | Mensuel HT (TTC) | Annuel HT (TTC) |
|---|---|---|
| Restaurant Start | 19,99 € (23,99 €) | 199,99 € (239,99 €) |
| Restaurant Pro (retrait + livraison) | 29,99 € (35,99 €) | 299,99 € (359,99 €) |
| Livreur, formule unique | 14,99 € (17,99 €) | 149,99 € (179,99 €) |
| Client | Gratuit | Gratuit |

Le catalogue d'affichage est dans `src/features/billing/plans.ts` ; les prix facturés sont ceux des prix Stripe. **Les deux formules restaurant ne se distinguent pour l'instant que par le prix** : le contenu de Pro par rapport à Start reste à définir. Comparatif avec Uber Eats, Deliveroo et les solutions sans commission : [docs/COMPARATIF.md](docs/COMPARATIF.md).

### Configurer Stripe (mode test d'abord)
Dans le dashboard du **compte Stripe dédié à ZeeRoo** :

Stripe ne sert qu'aux abonnements (pas de Connect).

1. **Profil** : nom « ZeeRoo », icône, couleur (pages d'abonnement).
2. **Catalogue de produits** → trois produits (« ZeeRoo Restaurant Start », « ZeeRoo Restaurant Pro », « ZeeRoo Livreur »), chacun avec un prix récurrent **mensuel** et un prix **annuel**, **hors taxe** (« Taxe exclue du prix »). Copier les six identifiants `price_…` dans les variables `STRIPE_PRICE_START_MONTH`, `_START_YEAR`, `STRIPE_PRICE_PRO_MONTH`, `_PRO_YEAR`, `STRIPE_PRICE_COURIER_MONTH`, `_COURIER_YEAR` (voir la grille ci-dessous).
   - **Catalogue de produits → Taux de taxe** : créer « TVA 20 % », France, **exclusif** (ajouté au prix HT). Copier `txr_…` dans `STRIPE_TAX_RATE_ID`.
   - Les factures affichent alors, par exemple pour Start mensuel, 19,99 € HT + 4,00 € de TVA = 23,99 € TTC, avec l'adresse du commerce et son numéro de TVA s'il le saisit.
   - Penser aussi à renseigner, dans les paramètres de facturation Stripe, les mentions de ZeeRoo : raison sociale, adresse, SIREN et numéro de TVA.
3. **Paramètres → Facturation → Portail client** → activer le portail : changement de carte, factures, résiliation.
4. **Développeurs → Webhooks**, un point de terminaison « Votre compte » vers `https://<projet>.supabase.co/functions/v1/stripe-webhook`, événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` ; copier son secret dans `STRIPE_WEBHOOK_SECRET`.
5. **Secrets serveur.** Ne colle jamais les clés dans le code ni dans un chat :
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… \
     STRIPE_TAX_RATE_ID=txr_… \
     STRIPE_PRICE_START_MONTH=price_… STRIPE_PRICE_START_YEAR=price_… \
     STRIPE_PRICE_PRO_MONTH=price_… STRIPE_PRICE_PRO_YEAR=price_… \
     STRIPE_PRICE_COURIER_MONTH=price_… STRIPE_PRICE_COURIER_YEAR=price_… \
     APP_WEB_URL=https://app.zeroo.online CRON_SECRET=$(openssl rand -hex 32)
   ```
6. **Expiration automatique**, chaque minute via pg_cron. Dans l'éditeur SQL Supabase, en remettant la même valeur que `CRON_SECRET` :
   ```sql
   select vault.create_secret('https://<projet>.supabase.co/functions/v1', 'functions_url');
   select vault.create_secret('<valeur de CRON_SECRET>', 'cron_secret');
   ```
En local, `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook` relaie les webhooks d'abonnement.

### Tester sans compte Stripe
> À mettre à jour : `e2e/payments.e2e.js` et les étapes Connect de `e2e/delivery.e2e.js` décrivent encore l'ancien paiement par Stripe Connect.

`e2e/payments.e2e.js` teste les fonctions contre **stripe-mock**, le serveur de test officiel de Stripe :
- création de commande et du paiement ;
- webhooks signés, signature invalide, doublon ;
- acceptation avec capture, refus et annulation sans débit ;
- Stripe Checkout, montant minimum, abonnement impayé ;
- inscription Connect, abonnement avec essai, portail ;
- expiration.

```bash
# stripe-mock sur le réseau Docker de Supabase, pour que les fonctions le joignent par son nom
docker run -d --name stripe-mock --network supabase_network_zeroo -p 12111:12111 stripe/stripe-mock
# dans supabase/functions/.env : STRIPE_SECRET_KEY=sk_test_mock, STRIPE_API_BASE=http://stripe-mock:12111,
# STRIPE_WEBHOOK_SECRET=whsec_platform_test, STRIPE_CONNECT_WEBHOOK_SECRET=whsec_connect_test, CRON_SECRET=cron_test
npx supabase functions serve --env-file supabase/functions/.env
npm run e2e
```

## Étape (e) : fidélité

**Règle.** Chez un même commerçant, 9 menus formules payés et récupérés = 1 menu formule offert.
- Seuls les produits cochés « Menu formule » par le commerçant comptent et peuvent être offerts. Les produits au détail ne comptent pas.
- Chaque menu compte, même s'ils sont plusieurs dans une commande. Le menu offert ne compte pas.
- Les suppléments payants d'un menu offert restent dus. Si ce qui reste à payer est inférieur à 0,50 € (minimum Stripe), c'est offert aussi.
- Le menu offert est réservé dès la commande, puis rendu automatiquement si la commande est refusée, annulée ou expirée.
- Tout est calculé en base, dans la même transaction que le changement de statut (`create_order` et trigger `orders_apply_loyalty`) : l'app ne fait qu'afficher.

**Tester** avec les données de démo : Nadia (`client@zeroo.test`) a déjà 7/9 menus et 1 menu offert chez « Chez Samir ».
1. Onglet **Fidélité** : la carte de Chez Samir, avec ses tampons.
2. Ajoutez un Kebab (détail) : il ne peut pas être offert. Ajoutez 2 « Menu Américain », puis « Utiliser mon menu offert ici » : 9,50 € sont déduits.
3. Côté commerçant, la ligne affiche « 🎁 Offert (fidélité) ». Après la remise, la carte passe à 8/9 : seul le menu payé compte.
4. Un menu offert seul donne une commande à 0 €, sans paiement. Si le commerçant la refuse, le menu offert revient sur la carte.

Tests : 24 tests pgTAP (`supabase/tests/database/loyalty.test.sql`) et `e2e/loyalty.e2e.js`.

## Étape (f) : notifications et trajet

**Notifications push** (Expo Push). Elles partent d'un trigger en base à chaque changement de statut, puis passent par pg_net et la fonction `notify-order-update` :

| Événement | Destinataire | Message |
|---|---|---|
| Commande payée | Commerçant | « Nouvelle commande 🔔 Nadia · 15,00 € », avec la sonnerie de commande |
| Acceptée | Client | « Chez Samir prépare votre commande, prête vers 12:45. » |
| Prête | Client | « Votre commande vous attend. Code de retrait : K7P2 » |
| Refusée / expirée | Client | Motif, et « Vous n'avez pas été débité. » |
| Annulée par le client | Commerçant | « Nadia a annulé sa commande K7P2. » |
| Client en route | Commerçant | « Nadia arrive vers 12:45 (dans 9 min) » |

- Toucher une notification ouvre le bon écran (suivi de commande, ou tableau du commerçant).
- La permission est demandée au moment utile (après une commande, sur le tableau des commandes), jamais au lancement.
- Un téléphone désinstallé est retiré automatiquement, et la déconnexion retire l'appareil du compte.

**« Je pars maintenant »** (suivi de commande) :
- Le client choisit à pied, à vélo ou en voiture. Sa position est lue une seule fois.
- La fonction `customer-departure` calcule le trajet avec Google Routes (trafic pris en compte en voiture), puis oublie la position : seule l'heure d'arrivée est enregistrée.
- Le commerçant voit « 🚗 Arrivée prévue vers 12:45 (dans 9 min) » et « ⏱ Lancez la préparation dans 3 min », selon son délai de préparation.
- Au plus un calcul par minute et par commande. Sans clé Google, ou si l'API ne répond pas, le trajet est estimé à partir de la distance.

### Configurer
1. **Expo / EAS** :
   - `npx eas-cli login` puis `npx eas-cli init`. Mettre l'identifiant affiché dans `.env.local` (`EAS_PROJECT_ID=…`).
   - Android : `npx eas-cli credentials` pour déposer la clé de service Firebase (FCM v1).
   - iOS : la clé APNs est gérée par EAS au premier build.
2. **Google Maps Platform** :
   - Activer l'API **Routes**, créer une clé et la restreindre à cette API.
   - `npx supabase secrets set GOOGLE_ROUTES_API_KEY=…`
3. **Vault** : les secrets `functions_url` et `cron_secret` de l'étape (d) servent aussi aux notifications. Sans eux, aucune notification ne part.

Les notifications ne fonctionnent que sur un vrai téléphone, avec un build de développement (`npx eas-cli build --profile development`). Sur le web, le tableau du commerçant sonne déjà en direct.

**Tests** : 15 tests pgTAP (`notifications.test.sql`, qui vérifie l'appel pg_net) et `e2e/notifications.e2e.js`. Ce dernier démarre de faux services Expo Push et Google Routes, et vérifie chaque message envoyé, la suppression des appareils désinstallés, l'appel à Google (mode, clé côté serveur), la limitation des appels et l'absence de position stockée. Il lui faut :
- les fonctions servies avec `EXPO_PUSH_URL`, `GOOGLE_ROUTES_URL` et `GOOGLE_ROUTES_API_KEY=test-key` (voir `supabase/functions/.env.example`) ;
- `E2E_DB_FUNCTIONS_URL`, l'adresse des fonctions vue depuis la base. Par défaut : Kong (`http://supabase_kong_zeroo:8000/functions/v1`).

## Étape (g) : livraison par livreur indépendant

**Le modèle.**
- Le client choisit **à emporter** ou **livraison** si le restaurant livre.
- Le restaurant fixe **le prix de la course** (de 0,50 € à 20 €) et sa **zone** (de 1 à 8 km).
- Le livreur est indépendant (auto-entrepreneur ou société, SIRET) et se rattache aux restaurants qui l'acceptent.
- Il paie un **abonnement livreur unique : 14,99 € HT par mois (17,99 € TTC) ou 149,99 € HT par an, 30 jours d'essai**, sans commission.
- Le client fait **deux paiements** : le repas, versé au restaurant, et la course, versée au livreur. Chacun va directement sur le compte Stripe du vendeur. ZeeRoo n'encaisse rien et le restaurant ne paie pas le livreur.

**Parcours.**
1. **Client** :
   - dans le panier, « 🛵 Livraison », adresse choisie dans la liste, téléphone pour le livreur ;
   - l'app vérifie que l'adresse est dans la zone et qu'un livreur est libre, puis affiche repas + course ;
   - il paie : deux feuilles de paiement dans l'app, ou deux pages Stripe à la suite sur le web.
2. **Base** : le livreur disponible servi le moins récemment est réservé dès la commande. MVP : une course à la fois par livreur, sans suivi GPS.
3. **Livreur** : il reçoit « Nouvelle course », puis **confirme** ou **décline**. S'il décline, la commande est annulée et rien n'est débité.
4. **Restaurant** : il ne peut accepter qu'après la confirmation du livreur. À l'acceptation, le repas et la course sont débités.
5. **Remise au livreur** : le livreur montre le **code de retrait**, le restaurant le saisit (« Remettre au livreur »). Le client voit « Léa est en route » avec son **code de livraison** à 4 chiffres.
6. **Livraison** : le client donne ce code au livreur, qui valide. La fidélité compte à la livraison.

**Espace livreur** (« Livrer » au choix de l'espace, `/livreur`) :
- **inscription** : nom, téléphone, statut, SIRET vérifié, véhicule ;
- **Courses** : disponibilité, courses en direct ;
- **Restaurants** : demandes de rattachement ;
- **Revenus** : jour, semaine, mois ;
- **Compte** : paiements Stripe, abonnement.

Il ne peut se rendre disponible qu'avec un compte Stripe actif, un abonnement en règle et au moins un restaurant qui l'a accepté. Stripe vérifie son identité et son immatriculation lors de l'inscription aux paiements.

**Côté restaurant** : Boutique → **Livraison** pour activer la livraison, régler le prix et la zone, accepter, refuser ou retirer des livreurs.

**Tester avec les données de démo.**
- « Chez Samir » livre à 3 km pour 3,50 €.
- Karim (`livreur@zeroo.test`, mot de passe `motdepasse1`) est rattaché et disponible.
- Commandez avec Nadia en livraison (adresse dans Paris 2e), confirmez avec Karim, acceptez avec Samir, puis suivez la remise et la livraison.

**RGPD.** L'adresse, le téléphone et les instructions de livraison sont effacés 7 jours après la fin de la commande ; la ville reste. La position du livreur n'est pas suivie.

**Tests** :
- 59 tests pgTAP (`delivery.test.sql`) ;
- `e2e/delivery.e2e.js` : serveur, double paiement contre stripe-mock, webhooks, notifications du livreur et du client, nouveau livreur ;
- `e2e/delivery-app.e2e.js` : trois navigateurs (nouvelle livreuse, restaurant, cliente), du profil livreur à la livraison.

## Page d'accueil de l'app web

La racine de l'app web (`src/app/index.tsx`) affiche la page d'accueil aux visiteurs (`src/features/landing/LandingPage.tsx`). Les utilisateurs connectés sont redirigés vers leur espace, et dans l'app mobile on va directement à la connexion.

**Contenu :**
- le modèle de service : les repas sont vendus par les restaurants, au prix de la carte, et le restaurant paie un abonnement fixe ;
- le fonctionnement en 3 étapes, puis les avantages pour les clients et pour les restaurants ;
- une comparaison avec les plateformes à commission (indicative, sans nommer de concurrent) ;
- les trois abonnements (Start, Pro, Livreur) en HT avec le TTC, et une FAQ.

**Les deux boutons** mènent à l'inscription en mémorisant l'espace visé. Le pied de page renvoie aux pages `/mentions-legales` et `/confidentialite`.

**Éditeur et exploitant** : aiworkpay SASU (941 861 775 RCS Paris), déjà renseigné dans `legal.mentions` et `legal.privacy` (`src/i18n/locales/fr/translation.json`). **À compléter au lancement de l'app** : l'hébergeur de l'app web et la région Supabase (éléments entre crochets). Faites relire ces textes par un juriste.

Le référencement passe par `<Head>` (titre, description, Open Graph). L'écran « À proximité » des clients est désormais à l'adresse `/explore`.

## Domaines

- **zeroo.online** : site vitrine (dépôt `cortexAI-2025/zeroo_mainpage`, GitHub Pages), avec la démo interactive. Les liens commerçant `zeroo.online/m/<slug>` (QR codes) y sont redirigés vers l'app web.
- **app.zeroo.online** : l'app web (Expo), cible de `APP_WEB_URL` (retours Stripe, abonnements), hébergée sur **Vercel** (projet `zeroo`, relié à ce dépôt : chaque push sur `main` est déployé). `vercel.json` : `npm run build:web` → `dist/`, toutes les routes renvoient vers `index.html` (application monopage). Variables à définir dans Vercel : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OAUTH_PROVIDERS` (voir « Inscription et connexion »).

Ce dépôt-ci ne contient que l'application.

## Inscription et connexion

- **Clients** : « Continuer avec Google » ou « Continuer avec Apple » en premier ; l'e-mail + mot de passe reste en dessous.
- **Commerçants et livreurs** : Google, Apple ou e-mail, puis vérification obligatoire de l'e-mail et du téléphone mobile (code SMS) avant de créer leur espace. La règle est appliquée en base (`pro_verification_required`).

À configurer dans Supabase (projet de production) :
1. **Authentication → URL Configuration** : Site URL `https://app.zeroo.online`, Redirect URLs `https://app.zeroo.online/**` (et `zeroo://**` pour l'app mobile).
2. **Authentication → Providers → Google** : ID client et secret OAuth (Google Cloud Console, type « Application Web », URI de redirection autorisée : `https://<projet>.supabase.co/auth/v1/callback`). Ajoutez aussi les ID clients iOS / Android dans « Authorized Client IDs » pour l'app mobile.
3. **Authentication → Providers → Apple** : Services ID, Team ID, Key ID et clé `.p8` (compte Apple Developer), même URL de retour.
4. **Authentication → Providers → Phone** : activez le fournisseur SMS (Twilio, Vonage ou MessageBird) pour l'envoi des codes. Laissez « Enable phone signup » désactivé : le téléphone sert seulement à vérifier les professionnels.
5. Dans Vercel, `EXPO_PUBLIC_OAUTH_PROVIDERS` = `google,apple` (retirez un fournisseur tant qu'il n'est pas configuré, son bouton disparaît).

Données de démo : le commerçant et le livreur ont un téléphone vérifié ; un nouveau compte pro de test doit passer par la vérification SMS (en local, `[auth.sms.test_otp]` de `supabase/config.toml` permet un code fixe).

## Identité visuelle

Slogan : **« Le bon goût. Sans commission. »** L'affiche de référence est dans `assets/brand/affiche-zeroo.jpg`.

Les visuels sont générés par `python3 scripts/brand-assets.py` dans `assets/images/` (logo redessiné avec la police Inter Display Black Italic) :

| Fichier | Usage |
|---|---|
| `logo.png` / `logo-dark.png` | Logo « ZEEROO » sur fond transparent, pour fond clair / sombre, via `src/components/Logo.tsx` |
| `logo-mark.png` | Symbole « oo » seul |
| `icon.png` | Icône iOS et App Store, 1024 px, symbole vert sur fond vert forêt |
| `android-icon-*.png` | Icône Android adaptative : premier plan, fond vert forêt, version monochrome |
| `splash-icon.png` / `splash-icon-dark.png` | Écran de lancement (fond blanc, ou sombre en mode sombre) |
| `favicon.png` | Favicon du site |

**Couleurs** (`src/theme/index.ts`) :
- vert `#1F7A35` pour les boutons et les liens sur fond clair (contraste 5,4:1 avec le blanc) ;
- vert vif du logo `#5DBE3A` et vert forêt `#0D3B2A` ;
- liens `#7ED957` sur fond sombre.

Le vert vif du logo n'atteint que 2,4:1 avec le texte blanc : il est réservé au logo et aux décorations, jamais aux boutons.

Pour l'impression (QR codes en vitrine, flyers, sacs) et les stores, demandez au graphiste le logo officiel en **SVG**, puis adaptez le script.

## Après le MVP
Pistes non incluses, à prioriser ensemble :
- liens universels : le lien d'un QR code ouvre l'app si elle est installée ;
- clôture de compte commerçant (résiliation de l'abonnement puis suppression) ;
- photos des produits ;
- arabe / darija avec interface en RTL ;
- statistiques commerçant ;
- comptes employés ;
- remboursement partiel depuis l'app.

## Tests de bout en bout

`npm run e2e` joue les parcours page d'accueil, authentification, commerçant, client, fidélité et livraison dans un vrai navigateur, et les paiements, notifications et livraisons côté serveur, contre le Supabase local. Les pages Stripe sont simulées et les webhooks signés comme le ferait Stripe. Préparation (fonctions et stripe-mock : voir « Tester sans compte Stripe ») :

```bash
npx playwright install chromium   # une seule fois
npm run db:reset                  # données de démo
npm run web                       # l'app doit tourner sur http://localhost:8081
npm run e2e                       # dans un second terminal
```

Ces tests modifient les données locales : relancez `npm run db:reset` pour repartir de zéro.

## Connexion Apple et Google

Les deux utilisent le flux natif : l'app obtient un jeton d'identité, puis appelle `supabase.auth.signInWithIdToken`. Elles nécessitent un **build de développement** (`npx eas-cli build --profile development`) ; Expo Go ne suffit pas. Sur le web, seule la connexion par e-mail est proposée pour l'instant.

**Apple** (iOS) :
1. Dans le portail Apple Developer, activez « Sign in with Apple » sur l'App ID `fr.zeroo.app`.
2. Dans le dashboard Supabase → Authentication → Providers → Apple, activez le provider et ajoutez `fr.zeroo.app` aux Client IDs.

**Google** :
1. Dans Google Cloud Console, créez des identifiants OAuth de type **Web**, **iOS** (bundle `fr.zeroo.app`) et **Android** (package `fr.zeroo.app` + empreinte SHA-1 de signature).
2. Renseignez `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` et `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` (l'ID iOS inversé).
3. Dans le dashboard Supabase → Providers → Google, ajoutez les IDs client Web et iOS, et activez « Skip nonce check » (nécessaire pour iOS).

Tant que ces variables sont vides, les boutons correspondants n'apparaissent pas.

## Structure

```
src/app/          routes Expo Router (écrans fins)
src/features/     logique par domaine (auth, space, puis menu, orders, loyalty…)
src/components/   composants d'interface réutilisables
src/lib/          clients et utilitaires (Supabase, env, React Query)
src/i18n/         traductions (fr ; ar prévu)
supabase/         config locale, migrations SQL, tests pgTAP
docs/             architecture
```

## Sécurité

- Aucune clé en dur. Les variables `EXPO_PUBLIC_*` sont publiques par nature : n'y placez jamais de secret. Les clés Stripe et Google Routes resteront côté serveur (secrets des Edge Functions).
- Toutes les tables ont la RLS activée. Chaque migration qui ajoute une table s'accompagne de tests pgTAP dans `supabase/tests/`.
