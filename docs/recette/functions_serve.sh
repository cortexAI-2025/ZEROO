#!/usr/bin/env bash
# Sert LES VRAIES Edge Functions (code du dépôt) avec Deno, contre la pile locale (http_stack.sh) :
# Supabase local + stripe-mock. Clés de TEST uniquement ; aucun accès Stripe ni Supabase distant.
#   DENO=/chemin/deno docs/recette/functions_serve.sh start|stop
set -euo pipefail
cd "$(dirname "$0")/../.."
W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"; DENO="${DENO:-deno}"
case "${1:-start}" in
  stop) [ -f "$W/functions.pids" ] && xargs -r kill < "$W/functions.pids" 2>/dev/null || true; rm -f "$W/functions.pids"; echo "fonctions arrêtées"; exit 0;;
esac
SERVICE=$(node -p "require('$W/keys.json').service"); ANON=$(node -p "require('$W/keys.json').anon")
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON" SUPABASE_SERVICE_ROLE_KEY="$SERVICE"
if [ "${STRIPE_REAL:-0}" = 1 ]; then : # Stripe RÉEL (mode test) : clés et prix fournis par l'environnement (recette_stripe_cli.sh), aucun stripe-mock
else
export STRIPE_SECRET_KEY=sk_test_123 STRIPE_API_BASE=http://127.0.0.1:12111 STRIPE_WEBHOOK_SECRET="$(node -p "require('$W/keys.json').webhook")"
export STRIPE_PRICE_START_MONTH=price_start_month STRIPE_PRICE_START_YEAR=price_start_year STRIPE_PRICE_PRO_MONTH=price_pro_month STRIPE_PRICE_PRO_YEAR=price_pro_year
export STRIPE_PRICE_COURIER_START_MONTH=price_c_start_month STRIPE_PRICE_COURIER_START_YEAR=price_c_start_year STRIPE_PRICE_COURIER_PRO_MONTH=price_c_pro_month STRIPE_PRICE_COURIER_PRO_YEAR=price_c_pro_year
fi
export STRIPE_TAX_RATE_ID="${STRIPE_TAX_RATE_ID:-txr_local}" APP_WEB_URL=http://127.0.0.1:8081 CRON_SECRET=local-cron ORDER_ACCEPT_TIMEOUT_MINUTES=10
: > "$W/functions.pids"
for spec in create-order:8101 billing:8102 stripe-webhook:8103 order-decision:8104 notify-order-update:8105; do
  name=${spec%%:*}; port=${spec##*:}
  DENO_SERVE_ADDRESS="tcp:127.0.0.1:$port" nohup "$DENO" run -A --no-lock --node-modules-dir=none "supabase/functions/$name/index.ts" > "$W/fn-$name.log" 2>&1 &
  echo $! >> "$W/functions.pids"
done
for i in $(seq 1 60); do ok=0; for p in 8101 8102 8103 8104 8105; do curl -s -m 2 -o /dev/null -X OPTIONS "http://127.0.0.1:$p/" && ok=$((ok+1)); done; [ $ok = 5 ] && break; sleep 2; done
# Ancienne version de create-order (branche précédente) sur le port 8111, pour tester la bascule : OLD_FUNCTIONS_DIR=<dossier contenant supabase/functions>
if [ -n "${OLD_FUNCTIONS_DIR:-}" ]; then
  DENO_SERVE_ADDRESS="tcp:127.0.0.1:8111" nohup "$DENO" run -A --no-lock --node-modules-dir=none "$OLD_FUNCTIONS_DIR/supabase/functions/create-order/index.ts" > "$W/fn-create-order-old.log" 2>&1 &
  echo $! >> "$W/functions.pids"; sleep 4
fi
echo "fonctions prêtes ($ok/5)"
