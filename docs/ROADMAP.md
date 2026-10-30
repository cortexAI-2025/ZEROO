# Feuille de route ZEEROO (30/10/2026)

Document de suivi, sans effet sur le code ni sur la production. Mis à jour par le propriétaire du projet.

## Priorité immédiate : recette de `app.zeeroo.fr`

Quatre vérifications restent à faire sur l'environnement réel (elles ne peuvent pas être réalisées depuis la session de développement, dont le réseau bloque les sites en production) :

1. **Sécurité de `create-order`** : un `POST` sans jeton sur `https://rgxesocsvhgsqoehxhgt.supabase.co/functions/v1/create-order` doit répondre HTTP 401.
2. **Commande de test avec un vrai compte client** : avec un prix annoncé falsifié (outil de développement du navigateur), la page doit afficher le message dédié (`price_changed`) et non l'erreur générique. Voir `docs/production/PREPROD-CREATE-ORDER.md`, §7 à §8.
3. **Connexions** : restaurateur et administrateur sur les vrais sites (`app.zeeroo.fr`, `admin.zeeroo.fr`).
4. **Supabase** : activer la protection contre les mots de passe compromis (« leaked password protection »).

Ensuite, selon la recette : commandes, paiements et sécurité de bout en bout (voir `docs/RECETTE.md` et `docs/production/`).

## Fonctionnalités différées

Les deux PR ci-dessous ont été **fermées sans fusion** le 30/10/2026. Leur travail **n'est pas dans `main`** ; les branches sont conservées sur GitHub. Elles datent d'avant plusieurs fusions (#51, #60, #61, #62, #57) : il faudra les rebaser et les adapter au code actuel. À rouvrir ou à refaire quand la recette sera terminée.

### #41 — Kit QR imprimable

- Branche : `feat/merchant-qr-print-kit` (base `ba9d469`, 9 fichiers).
- Contenu : écran QR du restaurant avec deux destinations (vitrine vers `app.zeeroo.fr/m/<slug>`, flyers vers `zeeroo.fr/m/<slug>`), documents d'impression A6, autocollant 10 × 10 cm et A4 de quatre flyers, QR vectoriels, avertissement si le commerce n'est pas publié. Fichiers propres à la PR : `src/features/merchant/printKit.ts`, son test, `docs/QR-PRINT-KIT.md`.
- À faire : rebase sur `main`, adaptation de `src/app/pro/qr.tsx`, `src/app/m/[slug].tsx`, des types et des textes ; coordination avec **`zeroo_mainpage#17`** (page `zeeroo.fr/m/<slug>` de la vitrine) ; test d'impression et de scan sur appareil réel, après publication d'un commerce.

### #48 — Thème clair / sombre / système

- Branche : `feat/light-dark-theme-20261028` (base `d29746d`, 1 fichier, brouillon).
- Contenu : sélecteur global à trois états, persistance locale, synchronisation avec `Appearance`.
- À faire : rebase et adaptation de `src/app/_layout.tsx` à l'architecture actuelle ; vérification de l'ergonomie du bouton (Android, iOS, web), du contraste, et des écrans aux couleurs codées en dur ; tests sur mobile.

## Autres points ouverts connus

- Notifications Web Push : non traitées.
- Les décisions de mise en production restent au propriétaire : aucune migration SQL ni déploiement d'Edge Function sans autorisation explicite (voir `docs/production/`).
