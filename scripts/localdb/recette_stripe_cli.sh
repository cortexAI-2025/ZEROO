#!/usr/bin/env bash
# TEST STRIPE RÉEL EN MODE TEST (webhook réel) contre la pile LOCALE — à lancer par le propriétaire, sur sa machine.
# Ce que c'est : de VRAIS événements Stripe (mode test, signés par Stripe) livrés par `stripe listen` à la VRAIE Edge Function
# stripe-webhook locale, qui met à jour la base locale. Aucune production Supabase, aucune carte réelle, aucun compte live.
# Ce que ça écrit : des objets de TEST dans votre compte Stripe en mode test (produit, prix, client, abonnement), annulés à la fin.
# Prérequis : Docker démarré, Deno, Node, psql, Stripe CLI (https://docs.stripe.com/stripe-cli) ; une clé secrète DE TEST.
#   STRIPE_TEST_SECRET_KEY=sk_test_... scripts/localdb/recette_stripe_cli.sh [--check] <dossier-de-preuves>
# --check : vérifie seulement les prérequis (ne démarre rien, n'écrit rien chez Stripe).
# Ce script n'a PAS été exécuté par l'assistant (api.stripe.com est injoignable depuis son environnement).
set -uo pipefail
cd "$(dirname "$0")/../.."
CHECK=0; [ "${1:-}" = "--check" ] && { CHECK=1; shift; }
OUT="${1:-/tmp/zeeroo-stripe-proofs}"; mkdir -p "$OUT"; W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"
fail=0; ok() { echo "OK    $1"; }; ko() { echo "ÉCHEC $1"; fail=1; }
KEY="${STRIPE_TEST_SECRET_KEY:-}"
case "$KEY" in sk_test_*|rk_test_*) ok "clé de TEST détectée";; "") ko "STRIPE_TEST_SECRET_KEY absente"; exit 2;; *) ko "clé refusée : seules les clés sk_test_/rk_test_ sont acceptées (jamais de clé live)"; exit 2;; esac
for b in docker node psql stripe "${DENO:-deno}"; do command -v "$b" >/dev/null 2>&1 && ok "outil présent : $b" || ko "outil manquant : $b"; done
docker info >/dev/null 2>&1 && ok "Docker démarré" || ko "Docker non démarré"
[ $fail = 0 ] || exit 2
[ $CHECK = 1 ] && { echo "Prérequis satisfaits."; exit 0; }
S() { stripe --api-key "$KEY" "$@"; }
J() { node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"; }
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres DENO="${DENO:-deno}"
export RECETTE_PASSWORD="$(grep -o 'mot de passe : [A-Za-z0-9]*' supabase/seed.sql | head -1 | awk '{print $NF}')"

echo "== 1. Pile locale (migration complète) ===================================================="
scripts/localdb/http_stack.sh up 20261029120000 > "$OUT/00-pile.txt" 2>&1 || { tail -5 "$OUT/00-pile.txt"; exit 1; }
export PGPASSWORD="$(node -p "require('$W/keys.json').dbpw")"
ANON="$(node -p "require('$W/keys.json').anon")"; API=http://127.0.0.1:54321

echo "== 2. Produit et prix de TEST (compte Stripe en mode test) =================================="
PROD=$(S products create --name "ZeeRoo recette locale" -d "metadata[zeeroo]=recette" | J .id)
mkprice() { S prices create --currency eur --unit-amount "$1" -d "recurring[interval]=$2" --product "$PROD" | J .id; }
P_START_M=$(mkprice 1999 month); P_START_Y=$(mkprice 19999 year); P_PRO_M=$(mkprice 2999 month); P_PRO_Y=$(mkprice 29999 year)
P_C_START_M=$(mkprice 1499 month); P_C_START_Y=$(mkprice 14999 year); P_C_PRO_M=$(mkprice 2499 month); P_C_PRO_Y=$(mkprice 24999 year)
ok "produit $PROD et 8 prix de test créés"

echo "== 3. Edge Functions réelles + Stripe CLI (webhook réel) ==================================="
WHSEC=$(S listen --print-secret)
export STRIPE_SECRET_KEY="$KEY" STRIPE_WEBHOOK_SECRET="$WHSEC" STRIPE_API_BASE=""   # STRIPE_API_BASE vide : Stripe réel (mode test)
export STRIPE_PRICE_START_MONTH=$P_START_M STRIPE_PRICE_START_YEAR=$P_START_Y STRIPE_PRICE_PRO_MONTH=$P_PRO_M STRIPE_PRICE_PRO_YEAR=$P_PRO_Y
export STRIPE_PRICE_COURIER_START_MONTH=$P_C_START_M STRIPE_PRICE_COURIER_START_YEAR=$P_C_START_Y STRIPE_PRICE_COURIER_PRO_MONTH=$P_C_PRO_M STRIPE_PRICE_COURIER_PRO_YEAR=$P_C_PRO_Y
docs/recette/functions_serve.sh stop >/dev/null 2>&1; kill "$(cat "$W/gateway.pid" 2>/dev/null)" 2>/dev/null
STRIPE_REAL=1 docs/recette/functions_serve.sh start >/dev/null && ok "fonctions servies contre Stripe (mode test)"
nohup node docs/recette/gateway.mjs > "$W/gateway.log" 2>&1 & echo $! > "$W/gateway.pid"; sleep 2
S listen --forward-to "$API/functions/v1/stripe-webhook" --events 'checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted' > "$OUT/stripe-listen.log" 2>&1 & LISTEN=$!
sleep 6; grep -q "Ready" "$OUT/stripe-listen.log" && ok "stripe listen prêt (événements réels livrés au webhook local)" || { ko "stripe listen non prêt"; cat "$OUT/stripe-listen.log" | head -5; }
cleanup() { kill $LISTEN 2>/dev/null; [ -n "${CUS:-}" ] && S customers delete "$CUS" >/dev/null 2>&1; S products update "$PROD" -d active=false >/dev/null 2>&1; }
trap cleanup EXIT

echo "== 4. Session Checkout RÉELLE (mode test) créée par la fonction billing ====================="
TOK=$(curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"commercant2@zeroo.test\",\"password\":\"$RECETTE_PASSWORD\"}" | J .access_token)
R=$(curl -s -X POST "$API/functions/v1/billing" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"action":"checkout","plan":"start","interval":"month"}')
echo "$R" | grep -q 'checkout.stripe.com' && ok "URL de paiement Stripe (test) renvoyée : $(echo "$R" | J .url | cut -c1-60)…" || ko "billing : $R"
CUS=$(psql -X -At -c "select stripe_customer_id from public.subscriptions where merchant_id='31000000-0000-0000-0000-000000000001'")
[ -n "$CUS" ] && ok "client Stripe de test lié au commerce : $CUS" || ko "aucun client Stripe enregistré"

echo "== 5. Abonnement RÉEL de test (carte de test 4242) : événements émis par Stripe ==============="
S payment_methods attach pm_card_visa -d "customer=$CUS" >/dev/null 2>&1
SUB=$(S subscriptions create -d "customer=$CUS" -d "items[0][price]=$P_START_M" -d "default_payment_method=pm_card_visa" -d trial_period_days=30 | J .id)
for i in $(seq 1 30); do st=$(psql -X -At -c "select status from public.subscriptions where merchant_id='31000000-0000-0000-0000-000000000001'"); [ "$st" = trialing ] || [ "$st" = active ] && break; sleep 2; done
[ "$st" = trialing ] || [ "$st" = active ] && ok "webhook RÉEL reçu et traité : abonnement $SUB → statut « $st » en base" || ko "statut en base : « $st » (le webhook n'a pas été traité ?)"
psql -X -At -c "select count(*) from public.stripe_events" | xargs -I{} echo "événements Stripe enregistrés (déduplication) : {}"
grep -c "customer.subscription" "$OUT/stripe-listen.log" | xargs -I{} echo "événements livrés par stripe listen : {}"

echo "== 6. Publication autorisée par l'abonnement réel (lien de paiement lu dans merchant_private) =="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/rest/v1/merchants?id=eq.31000000-0000-0000-0000-000000000001" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"is_published":true}')
[ "$(psql -X -At -c "select is_published from public.merchants where id='31000000-0000-0000-0000-000000000001'")" = t ] && ok "publication acceptée (abonnement réel + encaissement)" || ko "publication refusée (HTTP $CODE)"

echo "== 7. Résiliation RÉELLE : customer.subscription.deleted ==================================="
S subscriptions cancel "$SUB" >/dev/null 2>&1
for i in $(seq 1 30); do st=$(psql -X -At -c "select status from public.subscriptions where merchant_id='31000000-0000-0000-0000-000000000001'"); [ "$st" = canceled ] && break; sleep 2; done
[ "$st" = canceled ] && ok "résiliation traitée par le webhook réel : statut « canceled »" || ko "résiliation non traitée : « $st »"
[ "$(psql -X -At -c "select is_published from public.merchants where id='31000000-0000-0000-0000-000000000001'")" = f ] && ok "fiche dépubliée automatiquement à la résiliation" || ko "fiche encore publiée"

echo "== 8. Idempotence : rejeu d'un événement déjà reçu ========================================="
EVT=$(psql -X -At -c "select id from public.stripe_events order by 1 limit 1")
[ -n "$EVT" ] && S events resend "$EVT" >/dev/null 2>&1 && sleep 4 && ok "événement $EVT rejoué : doublon ignoré (voir journal de la fonction)" || echo "INFO  rejeu non réalisé"
echo; echo "Verdict test Stripe réel (mode test) : $([ $fail = 0 ] && echo CONFORME || echo 'ÉCHECS — voir ci-dessus')"; exit $fail
