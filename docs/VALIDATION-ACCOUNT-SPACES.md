# Séparation des espaces — validation du 25 octobre 2026

Branche : `fix/isolate-account-spaces`. Aucun changement déployé en production.

- `npm run check` : TypeScript, lint, formatage de `src`, 30 suites / 203 tests réussis. Les tests du provider couvrent le changement d'identité, le refus de changer d'espace et le refus d'accès en cas d'erreur réseau.
- `npm run build:web` : export réussi. Avertissements Leaflet préexistants sur les images CSS locales.
- `account_spaces.test.sql` : 16 tests pgTAP réussis dans le projet **zeeroo-recette-e2e**, migration comprise dans une transaction annulée. Vérification après test : aucune colonne de migration ni aucun utilisateur de test conservé. Production non touchée.
- `npm run db:test` : indisponible, PostgreSQL/Docker local absent (connexion 127.0.0.1:54322 refusée). Installation du banc local refusée par les restrictions système. La suite SQL complète n'est donc pas validée.
- Tests Deno de facturation et webhook : non validés, téléchargement des dépendances npm/JSR bloqué par le réseau. Deux cas de refus inter-espaces ajoutés ; fixtures restaurant/livreur désormais distinctes.
- Scénarios E2E hébergés et recette Android : à exécuter après déploiement coordonné sur staging.

## Ordre de mise en service

1. Examiner les anciens comptes multi-profils et leurs éventuels abonnements ; aucune suppression automatique de leurs données.
2. Appliquer la migration, déployer les Edge Functions utilisant `_shared/supabase.ts` (billing, order-decision, create-order, courier-decline, etc.), puis le frontend pendant une fenêtre contrôlée.
3. Avec trois comptes séparés, vérifier connexion/reconnexion, lien direct vers un autre espace, démarrage de l'abonnement dans le bon espace et déconnexion. Aucun bouton de bascule ne doit subsister.
4. Pour un ancien compte de démo multi-profils : choisir une fois son espace définitif. Toute migration de l'autre activité vers un compte distinct demande un traitement administratif.

Le périmètre ferme le changement d'espace de l'application et les points de création/facturation concernés. Il ne constitue pas un nouvel audit exhaustif de toutes les anciennes fonctions SQL métier.
