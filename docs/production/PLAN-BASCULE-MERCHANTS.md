# Plan de bascule production — données administratives des commerces (PR #60)

**Statut : plan préparé, AUCUNE exécution autorisée.** Chaque étape de production exige le « GO » explicite du propriétaire. Ce document n'est pas un avis juridique ni une autorisation.

## 0. Ce qui est déployé, et par quel véhicule
| Élément | Contenu | Véhicule |
| --- | --- | --- |
| Base de données | `docs/production/merchants_private_production.sql` (transaction unique, contrôles internes) | Éditeur SQL Supabase, par le propriétaire |
| Application web (app.zeeroo.fr) + Edge Function `create-order` | Partie applicative de la PR #60 | **Branche `ccr-cbee9612-jsmce8-merchants-app-on-main` → PR vers `main`** (uniquement les fichiers applicatifs, appliqués proprement sur `main` ; tsc, eslint, prettier, jest 214 OK). La PR #60 elle-même repose sur la chaîne #59 ← #51 et n'est **pas** le véhicule de déploiement. |
Ordre obligatoire : **`create-order` (version tolérante) d'abord, puis la base, puis l'application aussitôt après**.
- La nouvelle `create-order` lit le lien de paiement dans `merchant_private` **et**, à défaut, dans la colonne historique de `merchants` : elle fonctionne avant la migration, après la migration et après un retour arrière (prouvé par `recette_http.sh`, étapes 12 et 53). Elle se déploie donc **en avance, sans risque**, ce qui supprime toute fenêtre où les paiements par carte seraient refusés.
- Il ne reste qu'une fenêtre : l'application web (ancienne version) entre la migration et le déploiement de la PR applicative. Fusionner la PR applicative **avant** la migration casserait l'application (colonnes calculées absentes) : interdit.

## 1. Conditions du GO production (toutes requises)
- [ ] Relecture du SQL final : empreintes SHA-256 vérifiées sur le fichier téléchargé de GitHub (`merchants_private_production.sql` `ba8c9300…4502`, `merchants_private_ROLLBACK.sql` `401ae67d…b0db` ; migration `73c7aec1…4c3` ; **à recalculer si le fichier change**).
- [ ] Webhook Stripe : test réel en **mode test** réussi (voir §6), ou acceptation écrite de cette limite.
- [ ] Sauvegarde Supabase de moins de 24 h confirmée **et** procédure de restauration relue.
- [ ] `http_checks.sh avant` exécuté sur la production et archivé.
- [ ] Garde du jour J (§3, étape 1) : **aucun commerce publié, aucune commande en cours**. État relevé en lecture seule le 29/10/2026 : 1 commerce (avec données administratives réelles), **0 publié**, 0 abonnement actif, 0 commande. Si un commerce est publié d'ici là → **STOP** : une bascule « expand / contract » en deux migrations (double écriture, puis vidage) devient nécessaire ; ne pas improviser.
- [ ] Aucun restaurateur connecté pendant la fenêtre (un onglet ancien est géré par la convention `''`/`null`, mais on évite le risque).

## 1bis. Dépendances SQL (audit exhaustif, lecture seule)
`docs/recette/sql_dependencies_audit.sql` (à relancer sur la production avant la bascule) recense fonctions, vues, politiques RLS, tâches `pg_cron`, index, contraintes et déclencheurs touchant les six colonnes. **Résultat du 29/10/2026 sur la production** :
| Type | Trouvé | Traitement |
| --- | --- | --- |
| Fonctions (10) | `is_payments_ready`, `admin_private.subscriber_details`, `admin_private.review_directory_claim`, `admin_private.console`, `public.create_merchant` ; **plus** `admin_private.directory_claims`, `create_courier`, `is_courier_active`, `order_courier_profile`, `set_courier_availability` (colonnes d'un autre objet : annuaire Sirene, livreurs) | les trois premières sont **réécrites par le script** ; `console` et `create_merchant` **écrivent** dans `merchants` → déclencheurs d'écriture (null = conserver, `''` = effacer) ; les cinq dernières ne lisent pas `merchants` |
| Vues, politiques RLS, tâches `pg_cron`, index | **aucune** | — |
| Contraintes (6) | `CHECK` sur les six colonnes de `merchants` | reprises sur `merchant_private` ; passent à vide dans `merchants` |
| Déclencheurs sur `merchants` (11) | identiques à ceux de la recette locale | les nouveaux `a00_*` passent avant eux |
**Toute ligne supplémentaire le jour J = STOP.** Limite connue : la console admin qui omet un champ ne peut plus l'effacer (null = conserver) ; pour effacer, envoyer `''`.

## 2. Préparation (J-1)
1. Sauvegarde (Database > Backups) ; noter l'heure.
2. `SUPABASE_URL=… ANON_KEY=… [USER_JWT=…] docs/production/http_checks.sh avant preuves/prod-avant.txt` — attendu : `ATTENDU-AVANT` sur `merchants` (colonnes brutes) ; **`NON-PROBANT`** possible (0 commerce publié) : normal.
3. `docs/recette/checks.sql` (éditeur SQL) → `preuves/prod-checks-avant.csv`. Attendu : `table_privee_existe=f`, `commerces=1`, `commerces_publies=0`, `commerces_avec_colonnes_brutes=1`, `migration_enregistree=f`.
4. Empreinte des valeurs actuelles (à comparer après) : `select md5(string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by id)) from public.merchants;` — **noter le résultat**.
5. Prévenir les personnes concernées ; vérifier que la PR applicative est prête (CI verte) mais **non fusionnée**.

## 3. Jour J (durée visée : moins de 10 minutes)
| # | Action | Attendu / critère d'arrêt |
| --- | --- | --- |
| 1 | Garde : `select (select count(*) from public.merchants where is_published) as publies, (select count(*) from public.orders where status::text not in ('collected','delivered','cancelled')) as commandes_en_cours;` | `0` et `0`. Sinon **STOP** |
| 2 | Coller `merchants_private_production.sql` en une fois → Run | Dernier tableau : `commerces_avant = commerces_apres`, `avec_donnees_avant = lignes_privees`. **Toute exception = rien n'est appliqué** (transaction) ; ne pas relancer sans analyse |
| 3 | `checks.sql` ; empreinte des valeurs privées (même requête sur `merchant_private`) | `table_privee_existe=t`, `commerces_avec_colonnes_brutes=0`, `lignes_privees=1`, `valeurs_privees_non_nulles>0`, **empreinte identique à celle du J-1** |
| 4 | **Aussitôt** : fusionner la PR applicative dans `main` (déploiement Vercel de app.zeeroo.fr). `create-order` est déjà déployée (J-1) | Déploiement « Ready » en moins de 15 min (sinon §3bis) |
| 5 | `http_checks.sh apres preuves/prod-apres.txt` | 0 échec, 0 erreur technique ; `NON-PROBANT` toléré tant qu'aucun commerce n'est publié |
| 6 | Parcours restaurateur (compte propriétaire) : boutique (lien de paiement affiché), informations (SIRET, TVA, e-mail, téléphone pré-remplis), **Enregistrer sans rien changer**, console admin (fiche abonné) | Valeurs identiques avant/après (re-vérifier l'empreinte) |
| 7 | Archiver les preuves ; noter l'heure de fin | — |

Fenêtre de dégradation (étapes 2 → 4) : l'ancienne application ne voit plus téléphone ni lien de paiement ; l'ancienne `create-order` refuse les paiements par carte. **Impact nul tant que 0 commerce est publié** (état du 29/10/2026).

## 3bis. Procédure d'arrêt si le déploiement échoue après la migration SQL
Principe : **après la migration, on avance, on ne revient pas en arrière côté application** (une ancienne application ne voit plus téléphone ni lien de paiement ; elle ne détruit plus de données grâce à la règle `''`/`null`, mais elle est dégradée). Horloge : T0 = fin du script SQL.
| Panne | Détection | Action (dans l'ordre) |
| --- | --- | --- |
| Build Vercel en échec | job rouge / déploiement « Error » | 1. lire le journal ; 2. corriger **en avançant** (nouveau commit sur la PR applicative, ou re-déploiement) ; 3. **ne pas** promouvoir/restaurer l'ancien déploiement Vercel. Tant que 0 commerce est publié : aucun impact, pas d'urgence |
| Déploiement « Ready » mais application cassée (`400` sur `merchants`, colonnes calculées) | parcours restaurateur (§3 étape 6), `http_checks.sh apres` | vérifier que la migration est bien enregistrée (`checks.sql`) ; relancer le déploiement ; si la cause est le SQL → §4 (retour arrière sûr) |
| `create-order` en échec (déploiement J-1 manqué ou erreur) | journal de la fonction ; commande de test refusée | redéployer ; la fonction tolérante ne dépend pas de l'ordre. Si impossible : commerces dépubliés (aucune commande possible) plutôt que paiements refusés |
| Les deux en échec | — | ne pas improviser : T0 + 30 min sans application fonctionnelle **et** un commerce publié → retour arrière sûr (§4, niveau 2) |
| Un commerce est publié pendant la fenêtre | garde étape 1 / alerte propriétaire | **STOP immédiat**, ne pas migrer ; si déjà migré : accélérer le déploiement applicatif ou dépublier le temps de la fenêtre |
Critère de fin de fenêtre : déploiement « Ready », `http_checks.sh apres` sans échec, parcours restaurateur sans perte de valeur (empreinte).

## 4. Retour arrière — sans réexposer les données
Hiérarchie (du moins au plus coûteux) :
1. **Corriger en avançant** (recommandé) : redéployer la nouvelle application / `create-order` ; aucune donnée n'est touchée.
2. **Retour arrière « sûr »** (dernier recours applicatif) : `merchants_private_ROLLBACK_SAFE.sql`.
   - Il **dépublie d'abord tous les commerces** (liste mémorisée) puis restaure les valeurs dans `merchants`. Un visiteur anonyme ne voit alors **aucune ligne** de `merchants` : rien n'est exposé. Seuls le propriétaire et les clients ayant commandé (politiques d'origine) voient les colonnes restaurées.
   - Redéployer ensuite l'**ancienne** application et l'**ancienne** `create-order`, vérifier avec `http_checks.sh avant`.
   - **La republication réexpose** les données (ancien modèle) : `merchants_private_ROLLBACK_REPUBLISH.sql`, refusé sans l'ordre explicite `set zeeroo.accept_exposure = 'oui';` et seulement après décision du propriétaire. Elle ne republie que les commerces encore éligibles.
   - Effet de bord assumé : commerces hors annuaire et sans commandes jusqu'à la republication.
   - **Visibilité par profil après le retour arrière sûr** (mesurée par `safe_rollback_check.sh`, comparée au modèle d'origine d'avant la migration) :
     | Profil | Lignes de `merchants` visibles | Champs administratifs lisibles |
     | --- | --- | --- |
     | Visiteur anonyme, client sans commande | **0** | aucun |
     | Autre restaurateur | sa propre fiche seulement | la sienne |
     | **Client ayant commandé**, **livreur rattaché** | la fiche du commerce concerné | **oui : SIRET, TVA, e-mail, raison sociale** (politiques d'origine : ils lisent la ligne entière) |
     | Propriétaire, administrateur | sa fiche / toutes | oui |
     Ce n'est jamais **plus** que le modèle d'origine, mais c'est une **exposition résiduelle** pour les clients ayant déjà commandé et les livreurs rattachés pendant la durée du retour arrière (commerces dépubliés, donc peu de monde). Pour supprimer cette exposition résiduelle, utiliser la variante **réduite** (niveau 2bis ci-dessous) : les clients et livreurs ne lisent alors aucune donnée administrative.
   - Vérifié en local : `docs/recette/safe_rollback_check.sh` (anonyme 0 ligne, valeurs restaurées à l'identique, republication refusée sans ordre, puis effective avec l'ordre).
2bis. **Retour arrière « à exposition réduite »** (variante validée par le propriétaire ; scénario distinct, testé séparément : `docs/recette/RAPPORT-RETOUR-ARRIERE-REDUIT-2026-10-29.md`) : `merchants_private_ROLLBACK_REDUCED.sql`.
   - `merchant_private` est **conservée et fermée** ; **seuls téléphone et lien de paiement** (nécessaires à l'ancienne application) sont restaurés dans `merchants` ; raison sociale, SIRET, TVA et e-mail **ne quittent jamais** `merchant_private` (un SIRET saisi dans l'ancienne application y est aussi routé). Les clients et livreurs ne lisent donc **aucune** donnée administrative, même pendant l'incident. Commerces dépubliés d'abord (liste mémorisée).
   - Limites assumées : l'ancienne application voit SIRET/TVA/e-mail/raison sociale **vides** ; la console admin affiche téléphone et lien **vides** ; **ne pas redéployer la nouvelle application avant la réapplication**.
   - Republication : `merchants_private_ROLLBACK_REPUBLISH.sql` (réexpose **téléphone et lien de paiement** au public, ancien modèle ; garde-fou explicite).
   - **Retour à la nouvelle application** : `merchants_private_REAPPLY_AFTER_REDUCED.sql` (fonctionne malgré la présence de `merchant_private`, n'écrase ni ne supprime rien : les valeurs saisies dans `merchants` pendant le mode réduit sont recopiées en privé, colonnes vidées avant la réinstallation des déclencheurs ; contrôles par empreintes ; transaction annulée au moindre écart), puis `merchants_private_REAPPLY_REPUBLISH.sql` (republication **sans** exposition).
   - Ne remplace **pas** automatiquement les autres retours arrière : choix explicite du propriétaire.
3. **Ancien script `merchants_private_ROLLBACK.sql`** (restauration brute) : **réexpose immédiatement** les commerces publiés ; ne l'utiliser que si aucun commerce n'est publié (état actuel) ou sur décision explicite.
4. **Restauration de la sauvegarde / point dans le temps** : perd les écritures postérieures (avec 0 commande, impact limité) ; décision du propriétaire.
Critères de déclenchement : valeurs privées différentes (empreinte), `http_checks.sh apres` en échec, application inutilisable, erreur Postgres récurrente. Une `ERREUR-TECHNIQUE` seule (réseau) n'est pas un critère : refaire le contrôle.

## 4bis. Compatibilité application × état de la base (testée)
| Application déployée | Base : modèle fermé (après migration / réapplication) | Base : mode réduit (retour arrière réduit) |
| --- | --- | --- |
| **Nouvelle** (PR #61) | ✅ nominal (recette : 102 + 12 + 9 contrôles) | ❌ **à éviter** : téléphone et lien de paiement illisibles par la nouvelle application (`has_payment_link` faux → carte indisponible au panier) ; `create-order` reste valable (`compat-nouvelle-app-mode-reduit.txt`) |
| **Ancienne** | ⚠️ dégradée mais **sans perte de données** (téléphone, lien invisibles ; règle `''`/`null`) | ✅ nominal (7 contrôles navigateur, commandes, 2 cycles) |
Conséquences opérationnelles :
- **Retour arrière réduit = base ET application** : appliquer `…_ROLLBACK_REDUCED.sql` **et** redéployer l'ancienne application (précédent déploiement Vercel) ; ne jamais laisser la nouvelle application sur une base en mode réduit.
- **Réapplication = base puis nouvelle application** : `…_REAPPLY_AFTER_REDUCED.sql`, puis déploiement immédiat de la nouvelle application (même fenêtre qu'à la migration initiale : l'ancienne application est alors dégradée, sans perte), puis `…_REAPPLY_REPUBLISH.sql` si des commerces sont encore dépubliés. La réapplication est donc compatible avec la version déployée **à condition** que la nouvelle application soit redéployée aussitôt après ; si l'ancienne application reste en place, la dégradation (sans perte de données) persiste.
- `create-order` (tolérante) est valable dans **tous** les états ; elle n'est jamais la cause d'une incompatibilité.

## 5. Après la bascule
- Surveiller 24 h : journaux API / Postgres / Edge Functions (`permission denied for table merchants`, `column … does not exist`).
- Quand un premier commerce est publié : relancer `http_checks.sh apres` (le contrôle sera alors probant) et `scenarios.mjs` sur un commerce de test **de recette**, pas sur un vrai commerce.
- Étapes suivantes (non incluses) : fiche légale publique (cadrage `docs/LEGAL-SHEET.md`), QR codes (PR #41), vue « Prospects » admin.

## 6. Test Stripe réel en mode test (à faire avant le GO, ou à accepter comme limite)
Le webhook réel n'a pas été prouvé (la recette locale signe les événements avec un secret local). Le script `scripts/localdb/recette_stripe_cli.sh` a été **durci** (clé uniquement en variable d'environnement et jamais en argument, affichage et journaux filtrés, compte et objets vérifiés `livemode=false` avant/après chaque écriture, signature invalide refusée, événements retrouvés chez Stripe, résiliation → dépublication, refus si l'environnement référence un Supabase distant ; garde-fous testés avec un faux `stripe`). **Mode d'emploi depuis Android : `docs/recette/STRIPE-TEST-DEPUIS-ANDROID.md`** (Codespaces, secret Codespaces, aucune clé dans une conversation). Options :
- **A. Stripe CLI en local** (compte Stripe en mode test, par le propriétaire) : `scripts/localdb/http_stack.sh up` puis `docs/recette/functions_serve.sh start` avec `STRIPE_SECRET_KEY=<clé sk_test_ du compte>` (sans `STRIPE_API_BASE`) et `STRIPE_WEBHOOK_SECRET=<whsec_ affiché par la CLI>` ; `stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook` ; `billing` crée une session Checkout réelle en mode test ; payer avec la carte de test ; vérifier la ligne `subscriptions` et la publication. Aucune carte réelle, aucune production.
- **B. Projet hébergé de recette** (`zeeroo-recette-e2e`, en pause : réactivation payante, décision du propriétaire).
- **C. Accepter la limite** par écrit (la recette locale couvre la signature, la déduplication et la logique ; pas la livraison réelle des événements Stripe).

## 7. Responsabilités
Propriétaire : GO, exécution du SQL, fusion, déploiements, sauvegarde. Assistant : préparation, scripts, relecture, exécution des contrôles locaux et en lecture seule. Aucune écriture en production par l'assistant sans autorisation explicite.
