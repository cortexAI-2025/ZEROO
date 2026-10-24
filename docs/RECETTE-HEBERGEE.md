# Recette hébergée ZEEROO (isolée de la production)

## Environnements
- Application Vercel : https://zeeroo-recette-e2e.vercel.app
- Supabase : `drebeoivuytxbvmppprz`
- Production : **ne pas utiliser** `rgxesocsvhgsqoehxhgt`

## Trois comptes Auth de recette
Créer trois utilisateurs via **Supabase Dashboard > Authentication > Users > Add user** dans le projet de recette uniquement, en cochant « Auto Confirm User » :
- `commercant@zeroo.test` (commerce)
- `client@zeroo.test` (client)
- `livreur@zeroo.test` (livreur)

Choisir trois mots de passe de test uniques et les stocker dans un gestionnaire de secrets. Ne jamais les committer. Les adresses en `.test` ne reçoivent pas de vrais emails. La création via Dashboard utilise Supabase Auth Admin plutôt que des INSERT directs dans `auth.users`.

## Vérifications automatiques
```bash
export E2E_SUPABASE_URL=https://drebeoivuytxbvmppprz.supabase.co
export E2E_SUPABASE_ANON_KEY='<clé anon publique du projet de recette>'
node e2e/hosted-recette.mjs
```
Les vérifications de connexion sont facultatives et utilisent `E2E_CLIENT_EMAIL/PASSWORD`, `E2E_MERCHANT_EMAIL/PASSWORD` et `E2E_COURIER_EMAIL/PASSWORD`.

Le script refuse explicitement tout projet Supabase autre que la recette et ne modifie aucune donnée. Il contrôle l'API Auth, l'annuaire public, l'interdiction de lire les commandes anonymement et les sessions Auth si les identifiants sont fournis.

## Tests manuels à effectuer ensuite
1. Se connecter en commerçant ; créer/publier le commerce et un menu de test.
2. Se connecter en livreur ; créer le profil, obtenir le rattachement au commerce et activer la disponibilité.
3. Se connecter en client ; consulter le menu et tester une commande selon les modes de paiement réellement configurés.
4. Vérifier acceptation, préparation, attribution, enlèvement, livraison et clôture ; vérifier les restrictions RLS par rôle.
5. Tester les abonnements via Stripe **test** et un webhook pointant uniquement vers `https://drebeoivuytxbvmppprz.supabase.co/functions/v1/stripe-webhook`.

**Attention :** les anciens tests `e2e/*.e2e.js` supposent Docker, Mailpit, une base locale préremplie et certains flux Stripe Connect. Ils ne doivent pas être exécutés directement contre la recette hébergée. Ce smoke test ne prétend pas valider le circuit commande/livraison ni les paiements.
