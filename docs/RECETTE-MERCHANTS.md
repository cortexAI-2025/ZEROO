# Recette PR #60 — données administratives des commerces (projet Supabase de RECETTE)

**Périmètre** : projet Supabase **distinct de la production**, données fictives uniquement. Aucune étape ne touche la production. Verdict final : GO / NO-GO (section 9).
SQL de référence : migration `supabase/migrations/20261029120000_merchants_private_details.sql`, script `docs/production/merchants_private_production.sql`, retour arrière `docs/production/merchants_private_ROLLBACK.sql`. **Relever l'empreinte SHA-256 des deux scripts** (`sha256sum`) et la reporter dans le rapport.

> Leçon de préparation : la première version de la migration **effaçait** les valeurs recopiées lorsque la table contenait déjà des données (les tests pgTAP migrent une base vide et ne le voyaient pas). Corrigé (vidage avant création des déclencheurs), couvert par `scripts/localdb/backfill_check.sh` (en CI) et par des contrôles de valeurs dans le script de production. La recette DOIT donc être jouée sur une base **peuplée**.

## 0. Préparation de l'environnement
1. Créer un projet Supabase de recette (région identique à la production, même version de Postgres). Noter `SUPABASE_URL` et la clé publishable ; **ne jamais** utiliser les clés de production.
2. Appliquer les migrations **jusqu'à `20261029110000` incluse** (lots `scripts/bundle-migrations.sh`), **sans** `20261029120000`. Cet état = « avant ».
3. Charger `supabase/seed.sql` puis `docs/recette/merchants_recette_extra.sql` (comptes fictifs, mot de passe `motdepasse1`, deux commerces dont un non publié, données administratives fictives, une commande).
4. Déployer l'**application et les Edge Functions de la branche `main` actuelle** (ancienne version) sur un hébergement de recette, pointant vers le projet de recette : c'est la version « avant » pour la compatibilité.
5. Variables : `export SUPABASE_URL=… ANON_KEY=…` (jamais dans un fichier versionné). Dossier de preuves `preuves/` hors dépôt.

## 1. État AVANT (preuves)
| Action | Attendu |
| --- | --- |
| `docs/recette/checks.sql` | `table_privee_existe=f`, `vue_publique_existe=f`, `commerces_avec_colonnes_brutes=2`, `lignes_privees=0`, `migration_enregistree=f` |
| `docs/production/http_checks.sh avant preuves/avant-http.txt` | Aucun `ÉCHEC` ni `ERREUR-TECHNIQUE` ; les expositions connues sont `ATTENDU-AVANT` (`merchants` expose SIRET/TVA… car la recette contient un commerce publié) |
| Parcours manuels (section 6) en version « avant » | Référence de comportement : commande, paiement par lien, mini-site |

## 2. Application de la migration (état APRÈS)
1. Sauvegarde du projet de recette (Database > Backups) — répétition de la vraie procédure.
2. Coller `docs/production/merchants_private_production.sql` dans l'éditeur SQL → Run. Le dernier tableau doit afficher `commerces_avant = commerces_apres` et `avec_donnees_avant = lignes_privees`. Toute exception = **NO-GO** (noter le message).
3. `docs/recette/checks.sql` → attendu : `table_privee_existe=t`, `vue_publique_existe=t`, `commerces_avec_colonnes_brutes=0`, `lignes_privees=2`, `valeurs_privees_non_nulles=12`, `declencheurs_ecriture=7`, `colonnes_calculees=8`, `anciennes_fonctions_annuaire=0`, `vue_security_invoker=t`, `migration_enregistree=t`.
4. **Déployer immédiatement** l'application et les Edge Functions de la branche de la PR #60 (dont `create-order`).

## 3. Matrice HTTP par persona (réelle)
```
node docs/recette/scenarios.mjs --write preuves/apres-scenarios.txt
docs/production/http_checks.sh apres preuves/apres-http.txt   # USER_JWT facultatif
```
La matrice vérifie, **pour chaque persona** (visiteur anonyme, client sans commande, client ayant commandé, livreur rattaché, propriétaire, autre restaurateur, administrateur) :
- les valeurs **lisibles** (lecture autorisée qui fonctionne réellement) et les valeurs masquées (`null`), colonne par colonne ;
- les colonnes brutes de `merchants` : aucune valeur sensible, pour tout le monde ;
- le commerce **non publié** : visible de son propriétaire et de l'administrateur dans `merchants`, de **personne** dans `public_merchants` ;
- `public_merchants` : lecture réelle (1 ligne, colonnes exactes) pour anonyme **et** comptes connectés — preuve que `security_invoker = true` reste lisible avec les droits sur `merchants` ;
- tables fermées (`merchant_private`, `directory_businesses`, `directory_claims`) refusées à tous ; `admin_directory_claims` fonctionne pour l'administrateur seulement ;
- avec `--write` : le numéro public apparaît pour l'anonyme à l'autorisation et disparaît au retrait, le téléphone privé reste masqué, une écriture croisée d'un autre restaurateur n'a aucun effet ; l'état final est « non autorisé ».

Attendu : `Bilan … 0 échec(s), 0 erreur(s) technique(s)` pour les deux scripts. Un `NON-PROBANT` est **impossible** en recette (le seed publie « Chez Samir ») : s'il apparaît, le seed est incomplet → corriger avant de conclure.
**Distinguer échec attendu / vraie fuite** : en mode `avant`, `ATTENDU-AVANT` n'est pas une anomalie ; en mode `apres` tout `ÉCHEC` est une fuite ou une régression → NO-GO. `ERREUR-TECHNIQUE` = contrôle invalide (réseau, 5xx, compte absent) : à refaire, sans conclusion de sécurité.

## 4. Revue des droits (SQL, lecture seule)
Rejouer dans l'éditeur SQL du projet de recette (ou lire les résultats des tests `merchants_private_security.test.sql`, 28 contrôles) : fonctions ajoutées toutes `SECURITY DEFINER` + `search_path` vide ; `can_see_merchant_private` et `route_merchant_private` sans EXECUTE pour `anon`/`authenticated` ; `merchant_private` sans droit ni politique ; vue en lecture seule.

## 5. Compatibilité (créations, paiements, abonnements, `create-order`)
Jouer avec la **nouvelle** application (comptes fictifs, Stripe en mode test / stripe-mock) :
| Parcours | Attendu |
| --- | --- |
| Client sans commande ouvre le mini-site de Chez Samir | Fiche lisible ; pas de téléphone privé ; bouton « Appeler » absent tant que le numéro public n'est pas autorisé |
| Restaurateur autorise puis retire le numéro public (écran boutique) | Le numéro apparaît puis disparaît du mini-site, sans recharger la base |
| Client crée une commande avec paiement par lien | `create-order` (Edge Function) lit le lien dans `merchant_private` ; commande créée ; la page commande affiche le lien de paiement |
| Même parcours chez un restaurateur **sans** lien (paiement carte) | `create-order` répond `merchant_no_payment_link` ; l'application n'affiche pas « payer par carte » (`has_payment_link`) |
| Commande espèces / retrait | Inchangée |
| Livraison : livreur rattaché voit le téléphone du restaurant | Oui ; le SIRET jamais |
| Abonnement : essai → actif → résilié (webhooks Stripe test) | Publication refusée sans abonnement ; fiche dépubliée à la résiliation ; `is_payments_ready` cohérent (lien lu dans `merchant_private`) |
| Console admin : fiche abonné, modification d'un commerce, revue de revendication | SIRET/TVA/e-mail visibles de l'admin ; écriture OK |
| Restaurateur modifie sa fiche (nom, SIRET, TVA, e-mail) | Valeurs enregistrées dans `merchant_private`, relues par l'écran ; SIRET invalide refusé |
| Tâches asynchrones : expiration des paniers (`pg_cron`), notifications | Sans erreur dans les journaux Supabase |
| **Ancienne** application encore ouverte pendant la bascule | Comportement dégradé documenté (téléphone / lien absents) puis normal après rechargement |

## 6. Retour arrière complet puis réapplication (répétition)
1. `checks.sql` (référence « après »), noter l'empreinte des valeurs : `select md5(string_agg(merchant_id::text||coalesce(siret,'')||coalesce(phone,'')||coalesce(payment_link,''),';' order by merchant_id)) from public.merchant_private;`
2. Exécuter `docs/production/merchants_private_ROLLBACK.sql`. `checks.sql` → `table_privee_existe=f`, `commerces_avec_colonnes_brutes=2`, `migration_enregistree=f`. Redéployer l'application et `create-order` **précédents** (restauration applicative) ; rejouer les parcours « avant » de la section 5.
3. Vérifier l'empreinte `select md5(string_agg(id::text||coalesce(siret,'')||coalesce(phone,'')||coalesce(payment_link,''),';' order by id)) from public.merchants;` = celle du point 1.
4. Réappliquer `merchants_private_production.sql`, puis l'application de la branche : `checks.sql` identique au point 1, **même empreinte**.
5. Refaire le cycle une seconde fois (c'est ce qui a révélé le défaut d'ordre en préparation).
Répétition locale déjà faite : deux cycles, empreinte identique à chaque étape, 12 valeurs privées conservées.

## 7. Compatibilité des fonctions et traitements asynchrones
Relire les journaux Supabase (API, Edge Functions, Postgres) pendant 24 h après la bascule de recette : aucune erreur `permission denied for table merchants` ni `column … does not exist`.

## 8. Archivage des preuves
`preuves/` : `avant-http.txt`, `apres-http.txt`, `apres-scenarios.txt`, sorties de `checks.sql` (avant, après, retour arrière, réapplication), captures des parcours section 5, empreintes SHA-256 des scripts. Aucun jeton ni mot de passe (les scripts les masquent ; relire avant partage).

## 9. Rapport final et verdict
Modèle : tableau des sections 1 à 7 (OK / anomalie), liste des anomalies avec gravité, empreintes SHA-256 de `merchants_private_production.sql` et `merchants_private_ROLLBACK.sql`, version de l'application et de `create-order` testées.
- **GO** : sections 1 à 7 sans anomalie bloquante, 0 échec dans les deux scripts, retour arrière + réapplication à l'identique.
- **NO-GO** : toute fuite en mode `apres`, toute perte ou altération de valeur, tout parcours de commande ou de paiement cassé, tout `ERREUR-TECHNIQUE` non expliqué.
Le passage en production est ensuite une décision séparée du propriétaire (sauvegarde, `http_checks.sh avant` sur la production, script, déploiement coordonné, `http_checks.sh apres`).
