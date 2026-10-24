# Tests de bout en bout périmés (Stripe Connect)

Ces scénarios ont été écrits pour l'ancien modèle de paiement (PaymentIntent capturé, comptes Stripe Connect
des restaurants et des livreurs, fonction `connect-onboarding`, webhook « compte connecté »). Le modèle actuel est
différent : **le client paie directement le professionnel** (lien de paiement ou espèces), le client *déclare*
avoir payé, le professionnel *confirme* ; Stripe ne sert qu'aux abonnements ZeeRoo, sans Connect.

Ils ne sont **plus lancés** (`npm run e2e` ne les appelle pas) : ils échoueraient pour des raisons qui n'ont plus
rien à voir avec le produit. Ils restent ici comme référence des parcours à réécrire (client, livraison, fidélité,
notifications) pour le modèle actuel, sur un Supabase local (`supabase start`).

Le modèle actuel est couvert, en attendant, par les tests de base de données exécutés en CI :
- `supabase/tests/database/payments_direct.test.sql` : déclaration / confirmation du paiement (repas et course),
  espèces au comptoir, refus d'un tiers ;
- `supabase/tests/database/delivery.test.sql`, `release_courier.test.sql`, `plans.test.sql` : cycle de livraison,
  affectation et libération du livreur, droits par formule.
Les abonnements (Stripe Billing : essai, changement de formule, impayé, webhook signé et idempotent) ne sont pas
testés automatiquement et restent à recetter sur Stripe en mode test.
