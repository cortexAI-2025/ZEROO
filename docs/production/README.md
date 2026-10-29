# Scripts de production (exécutés à la main par le propriétaire)

## private_prospects_production.sql
Migration `20261029110000_private_prospects` : annuaire public = affiliés ; fiches Sirene = base privée.
Éditeur SQL Supabase, projet `rgxesocsvhgsqoehxhgt`, en une seule exécution (transaction).

Préconditions vérifiées en lecture seule sur la production (29/10/2026) :
- aucune fonction, vue ni autre code ne dépend des 3 fonctions supprimées (le dashboard admin passe par `admin_directory_claims`, qui reste) ;
- 2 390 fiches, 0 demande de revendication ; migration non enregistrée ;
- politiques existantes : `listed directory references`, `claimant reads own claims`, `admins read claims` (la dernière reste, inoffensive sans droit de table).

Avant : sauvegarde (Database > Backups) ; retour arrière : `private_prospects_ROLLBACK.sql` (réexpose le SIRET : décision explicite seulement).
Après : contrôles anonymes réels (docs/RECETTE-ADMIN.md §8), puis fusion de la PR du site.
