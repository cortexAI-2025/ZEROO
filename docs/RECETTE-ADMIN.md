# Recette du dashboard administrateur (admin.zeeroo.fr)

À exécuter **avant** toute mise en production du dashboard et avant la fusion de la PR #51 dans `main`.
Chaque ligne se coche à la main ; en cas d'écart, noter l'écran, l'heure, le compte utilisé et une capture.

> **Règles de sécurité de la recette**
> - Ne jamais coller un mot de passe, un jeton d'accès ou une clé `service_role` dans un message, un ticket ou une PR.
> - Les mots de passe se saisissent en mode masqué (`read -rs`) ; les jetons restent dans des variables d'environnement du terminal et ne sont pas enregistrés dans l'historique.
> - Aucune donnée réelle n'est modifiée : utiliser des comptes de test et des données de test.

## 0. Préparation

| Élément | Valeur |
|---|---|
| Version testée (déploiement Vercel / commit) | |
| Testeur et date | |
| Compte **administrateur** | compte réel présent dans `platform_admins` |
| Compte **client** de test | e-mail confirmé, **absent** de `platform_admins`, profil client complet |
| Compte **professionnel** de test (facultatif) | e-mail confirmé, fiche en brouillon |
| URL du dashboard | `https://admin.zeeroo.fr` (et l'URL du déploiement de branche, pour comparer) |
| Projet Supabase | `rgxesocsvhgsqoehxhgt` |

Deux comptes **réellement distincts** sont indispensables : la simulation côté base (section 1) ne prouve pas que le dashboard bloque un client.

## 1. Déjà vérifié côté base de données (29/10/2026, simulation annulée, aucune écriture)

Un utilisateur connecté **non administrateur** et un visiteur anonyme ont été simulés dans une transaction annulée.

| Contrôle | Résultat obtenu |
|---|---|
| `is_platform_admin()` pour un client | `false` |
| `admin_console`, `admin_subscriber_details`, `admin_profile_identity`, `admin_directory_claims`, `review_directory_claim` | refusés (`42501`) |
| Fonctions de campagne (`admin_list_campaigns`, `admin_review_campaign`, `admin_requeue_campaign`, `admin_record_publication`) | refusées (`42501`) |
| Lecture directe de `admin_audit_logs`, `admin_user_roles` | refusée (`permission denied`) |
| Auto-attribution du statut administrateur (insertion dans `platform_admins`) | refusée (`permission denied`) |
| Auto-attribution d'un rôle (`admin_user_roles`) / création d'un profil admin | refusées (droit absent / politique RLS) |
| Lignes visibles dans `admin_cases`, `admin_contact_tasks`, `platform_admins`, `admin_profiles`, `directory_claims` pour un client | 0 |
| Visiteur anonyme : toutes les fonctions admin et `is_platform_admin()` | refusés (`42501`) |
| Administrateur légitime | accepté (session sans double authentification) |

À noter : l'administrateur est accepté avec une session `aal1` — la double authentification n'est pas exigée, **par décision du propriétaire** (28/10/2026).

## 2. DNS et certificat HTTPS

À lancer depuis un poste ayant accès à Internet.

- [ ] `dig +short CNAME admin.zeeroo.fr` renvoie la cible Vercel indiquée dans le projet (`…vercel-dns…`).
- [ ] `dig +short A admin.zeeroo.fr` ne renvoie **pas** `185.158.133.1` (ancien prototype Lovable).
- [ ] `curl -sI http://admin.zeeroo.fr` redirige vers `https://` (code 301/308).
- [ ] Certificat valide, émis pour `admin.zeeroo.fr`, non expiré :
  `echo | openssl s_client -connect admin.zeeroo.fr:443 -servername admin.zeeroo.fr 2>/dev/null | openssl x509 -noout -issuer -subject -dates`
- [ ] La page ne renvoie plus l'ancien prototype : le titre est « ZeeROO · Administration ».

## 3. En-têtes de sécurité et CSP

`curl -sI https://admin.zeeroo.fr` doit contenir :

- [ ] `content-security-policy` avec `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `connect-src 'self' https://rgxesocsvhgsqoehxhgt.supabase.co`, `frame-ancestors 'none'`, `object-src 'none'`, sans `unsafe-inline` ni `unsafe-eval`.
- [ ] `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`.
- [ ] Dans le navigateur (console et onglet Réseau) : **aucune** violation de CSP et **aucune** requête vers un autre domaine que `admin.zeeroo.fr` et `rgxesocsvhgsqoehxhgt.supabase.co`.
- [ ] `/vendor/supabase.js` est servi par `admin.zeeroo.fr` (pas par `cdn.jsdelivr.net`).

## 4. Authentification dans l'interface

| Cas | Résultat attendu | OK |
|---|---|---|
| Visiteur anonyme | Formulaire de connexion ; aucune requête de données | ☐ |
| Mauvais mot de passe | Message générique, sans indiquer si l'e-mail existe | ☐ |
| Compte **client** (bons identifiants) | Écran « Accès refusé » ; **aucune** donnée chargée (onglet Réseau : seulement la vérification de session et la recherche d'appartenance, vide) | ☐ |
| Compte **professionnel** de test | Même écran « Accès refusé » | ☐ |
| Compte **administrateur** | Tableau de bord, rubriques visibles | ☐ |
| Déconnexion puis bouton « Précédent » du navigateur | Retour au formulaire, aucune donnée affichée | ☐ |
| Session expirée (supprimer le stockage local ou attendre l'expiration) | Retour au formulaire de connexion | ☐ |
| Plusieurs essais échoués | Limitation de débit de Supabase Auth observée, sans blocage définitif de l'administrateur | ☐ |

## 5. Permissions réelles avec deux comptes (appels API)

Prérequis : `jq` et `curl`. Les identifiants se saisissent sans écho ; la clé publishable est celle de `admin-web/config.js` (publique par conception).

```bash
export SUPABASE_URL=https://rgxesocsvhgsqoehxhgt.supabase.co
export ANON_KEY='<clé publishable de admin-web/config.js>'
read -rp 'E-mail du compte client de test : ' CLIENT_EMAIL
read -rsp 'Mot de passe : ' CLIENT_PASSWORD; echo
CLIENT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$CLIENT_EMAIL" --arg p "$CLIENT_PASSWORD" '{email:$e,password:$p}')" | jq -r .access_token)
unset CLIENT_PASSWORD
```

Pour chaque appel, le résultat attendu est **un refus (HTTP 401/403, code `42501`) ou 0 ligne — jamais une donnée.**

| Appel avec le jeton du **client** | Attendu | OK |
|---|---|---|
| `curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/admin_console" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CLIENT_TOKEN" -H 'Content-Type: application/json' -d '{"p_action":"clients"}'` | `Accès réservé aux administrateurs` | ☐ |
| `…/rpc/admin_directory_claims` (corps `{}`) | `admin_required` | ☐ |
| `curl -s "$SUPABASE_URL/rest/v1/admin_audit_logs?select=*" -H "apikey: …" -H "Authorization: Bearer $CLIENT_TOKEN"` | `permission denied` | ☐ |
| `curl -s "$SUPABASE_URL/rest/v1/platform_admins?select=*" …` | `[]` | ☐ |
| `curl -s -X POST "$SUPABASE_URL/rest/v1/platform_admins" … -d '{"user_id":"<id du client>"}'` | `permission denied` (aucune ligne créée) | ☐ |
| `curl -s "$SUPABASE_URL/rest/v1/profiles?select=*" …` | uniquement **son propre** profil | ☐ |
| Mêmes appels avec la **clé publishable seule** (visiteur anonyme) | refus ou `[]` | ☐ |
| Appel `admin_console` avec le jeton de l'**administrateur** | 200 avec des lignes | ☐ |

Vérifier ensuite côté base que le test n'a rien créé : `select count(*) from public.platform_admins;` doit rester inchangé.

## 6. Fonctionnalités du dashboard (avec le compte administrateur)

Chaque rubrique doit s'afficher sans erreur de console, avec des données réelles ou un état vide explicite. Toute action de modification exige un **motif** et doit laisser une ligne dans le Journal. Utiliser exclusivement des comptes et des données de test pour les actions qui modifient.

| Rubrique | À vérifier | OK |
|---|---|---|
| Vue d'ensemble | Compteurs cohérents avec la base (commerces, livreurs, commandes, abonnements) | ☐ |
| Commerces / Livreurs | Liste paginée par 25 ; « Voir la fiche » (fiche abonné, formule, échéance) ; actualisation manuelle | ☐ |
| Commerces / Livreurs — création et modification | « Ajouter … depuis un compte inscrit » (`add_entity`) et modification d'une fiche (`edit_entity`), avec motif | ☐ |
| Commerces / Livreurs — état administratif | « Suspendre » puis « Réactiver » (`set_status`) : un commerce suspendu est dépublié et mis en pause, et **ne reçoit plus de commandes** ; un livreur suspendu n'est plus disponible | ☐ |
| Commerces — publication | « Publier et reprendre les commandes » / « Dépublier » (`publish`). **Publier un commerce non affilié (sans abonnement actif ou sans moyen d'encaissement) doit être refusé** (`merchant_not_affiliated`) — voir la PR dédiée à la garde de publication de l'administration | ☐ |
| Clients | Liste paginée et recherche ; dossier d'un client (identité, adresse, téléphone) et ses commandes ; aucun mot de passe, jeton ni donnée bancaire affiché | ☐ |
| Clients — tâches de contact | Création puis clôture d'une tâche (`contact_create`, `contact_done`) | ☐ |
| Commandes, Abonnements | Listes paginées ; statut, formule et échéance cohérents avec Stripe | ☐ |
| Litiges | Création puis mise à jour d'un dossier (`case_create`, `case_update`) avec décision et motif | ☐ |
| Offres géolocalisées | Création d'une offre de test, activation / désactivation (`offer_create`, `offer_toggle`) | ☐ |
| Évaluations | Masquer puis ré-afficher un avis (`review_visibility`) | ☐ |
| Fidélité | Liste des cartes ; ajustement entre −10 et +10 avec motif (`loyalty_adjust`), refus hors bornes | ☐ |
| Communications | Liste des campagnes et de leur statut (lecture) | ☐ |
| Revendications | File des demandes ; une acceptation exige un commerce existant, du demandeur, avec le **même SIRET** ; un refus exige une justification | ☐ |
| Journal | **Chaque action de modification ci-dessus** a produit une ligne (acteur, action, cible, motif, date) | ☐ |
| Mon profil | Nom, langue et thème enregistrés et conservés après rechargement | ☐ |

## 7. Confort et accessibilité

- [ ] Mobile (≈ 390 px) : menu latéral, recherche de module, tableaux lisibles sans défilement horizontal de la page.
- [ ] Thème clair / sombre / système, mémorisé après rechargement.
- [ ] Navigation au clavier : ordre logique, focus visible, fermeture du menu avec la touche Échap.

## 8. Annuaire des affiliés et base de prospection privée (après la migration `20261029110000`)

Variables : `SUPABASE_URL`, `ANON_KEY` ; `USER_JWT` = jeton d'un compte connecté (non administrateur).

### État avant / après la migration (éditeur SQL, lecture seule — à relancer et archiver les deux résultats)

1. Nombre de fiches (attendu : 2390 avant **et** après)
```sql
SELECT count(*) AS total FROM public.directory_businesses;
```
2. Permissions des rôles publics (attendu : avant `true/true` pour `anon` et `authenticated` ; après `false/false`)
```sql
SELECT rolname,
  has_table_privilege(rolname, 'public.directory_businesses', 'SELECT') AS can_read_businesses,
  has_table_privilege(rolname, 'public.directory_claims', 'SELECT') AS can_read_claims
FROM pg_roles WHERE rolname IN ('anon', 'authenticated');
```
3. Fonctions de l'ancien annuaire (attendu : 4 lignes avant ; **0 ligne** après)
```sql
SELECT n.nspname AS schema_name, p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('search_pro_directory', 'pro_directory_cities', 'request_directory_claim')
ORDER BY n.nspname, p.proname;
```

- [ ] Anonyme : `curl -s "$SUPABASE_URL/rest/v1/directory_businesses?select=siret&limit=1" -H "apikey: $ANON_KEY"` est **refusé** (`42501`) ; avant la migration : 2 390 SIRET lisibles.
- [ ] Même appel avec `-H "Authorization: Bearer $USER_JWT"` : refusé.
- [ ] `…/rest/v1/directory_claims?select=*` : refusé en anonyme et en connecté.
- [ ] `…/rest/v1/rpc/search_pro_directory`, `…/rpc/pro_directory_cities`, `…/rpc/request_directory_claim` : **fonction introuvable** (404 / `PGRST202`).
- [ ] `…/rest/v1/merchants?select=*&is_published=eq.true` (anonyme) : voir la sécurisation de `merchants` (étape suivante) ; ne pas considérer ce point comme validé tant que SIRET, TVA et contacts privés y apparaissent.
- [ ] Sur zeeroo.fr : la section « Annuaire ZeeRoo » renvoie vers app.zeeroo.fr/decouvrir ; aucun SIRET ni recherche d'entreprises.
- [ ] Base : `select count(*) from public.directory_businesses` = 2 390 (éditeur SQL).
- [ ] Administrateur : l'onglet des demandes de revendication s'ouvre toujours (`admin_directory_claims`).
- [ ] Le SIRET saisi à l'inscription du professionnel est toujours enregistré.

## 9. Décision

| Contrôle | Résultat |
|---|---|
| Sections 2 à 5 entièrement cochées | ☐ |
| Section 6 sans écart bloquant | ☐ |
| Section 8 validée | ☐ |
| Branche de production du projet Vercel `zeeroo-admin` et dossier racine (`admin-web`) vérifiés | ☐ |
| **Go / no-go pour la fusion de #51 dans `main`** | ☐ Go ☐ No-go |

Écarts constatés :

