#!/usr/bin/env bash
# TEST STRIPE RÉEL EN MODE TEST (webhook réel) contre la pile LOCALE — à lancer par le propriétaire, pas par l'assistant.
#
# Ce que c'est : de VRAIS événements Stripe (mode test, signés par Stripe) livrés par `stripe listen` à la VRAIE Edge Function
# stripe-webhook locale, qui met à jour la base LOCALE (Postgres Supabase en Docker, 127.0.0.1).
# Garanties vérifiées PAR LE SCRIPT (il s'arrête sinon) :
#   1. Clés : uniquement dans l'environnement (STRIPE_TEST_SECRET_KEY ; jamais en argument de commande, donc absentes de la liste
#      des processus) ; tout l'affichage et les journaux archivés sont filtrés (clés sk_/rk_/pk_, secrets whsec_, jetons).
#   2. Mode test exclusivement : clé sk_test_/rk_test_ exigée ET compte vérifié (livemode=false) AVANT toute écriture ; chaque objet
#      créé (produit, prix, client, abonnement) est contrôlé livemode=false.
#   3. Événements réellement reçus et vérifiés : le secret de signature est celui de `stripe listen` ; un événement à signature
#      invalide est refusé (400) ; chaque événement enregistré en base existe réellement chez Stripe (stripe events list) ; aucun
#      code d'erreur HTTP dans le journal de livraison.
#   4. Résiliation → dépublication de la fiche vérifiée.
#   5. Aucune donnée de production : base et API uniquement locales ; refus si l'environnement référence une URL Supabase distante.
#      Côté Stripe, seuls des objets de TEST sont créés (puis désactivés / supprimés).
# Prérequis : Docker démarré, Deno, Node, psql, Stripe CLI. Usage :
#   export STRIPE_TEST_SECRET_KEY=sk_test_...     # dans votre terminal / secret Codespaces, JAMAIS dans une conversation
#   scripts/localdb/recette_stripe_cli.sh --check            # prérequis seulement, rien n'est créé
#   scripts/localdb/recette_stripe_cli.sh --check-key        # + vérifie auprès de Stripe que la clé est une clé de TEST (lecture seule)
#   scripts/localdb/recette_stripe_cli.sh --yes [dossier]    # exécute le test (écrit des objets de TEST chez Stripe)
set -uo pipefail
umask 077
redact() { sed -u -E 's/(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/[CLÉ-STRIPE-MASQUÉE]/g; s/whsec_[A-Za-z0-9]+/[SECRET-WEBHOOK-MASQUÉ]/g; s/Bearer [A-Za-z0-9._-]+/Bearer [MASQUÉ]/g; s/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/[JETON-MASQUÉ]/g'; }
[ "${1:-}" = "--redact-selftest" ] && { redact; exit 0; }
cd "$(dirname "$0")/../.."
MODE=""; case "${1:-}" in --check|--check-key|--yes) MODE="$1"; shift;; esac
[ -z "$MODE" ] && { echo "usage: $0 --check | --check-key | --yes [dossier-de-preuves]"; exit 64; }
OUT="${1:-/tmp/zeeroo-stripe-proofs}"; W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"; mkdir -p "$OUT" "$W"; chmod 700 "$OUT" "$W" 2>/dev/null
exec > >(redact) 2>&1          # filtre TOUT l'affichage
fail=0; ok() { echo "OK    $1"; }; ko() { echo "ÉCHEC $1"; fail=1; }; die() { echo "ARRÊT $1"; exit 2; }

# --- Garde 1 : clé de test, dans l'environnement uniquement
KEY="${STRIPE_TEST_SECRET_KEY:-}"
case "$KEY" in sk_test_*|rk_test_*) ok "clé de TEST fournie par l'environnement";; "") die "STRIPE_TEST_SECRET_KEY absente";; *) die "clé refusée : seules les clés sk_test_/rk_test_ sont acceptées (jamais de clé live)";; esac
export STRIPE_API_KEY="$KEY"; unset STRIPE_TEST_SECRET_KEY   # la CLI Stripe lit STRIPE_API_KEY : aucune clé en argument
# --- Garde 5 : rien de distant côté Supabase, pas de moteur Stripe détourné
if env | grep -E '^(SUPABASE_URL|SUPABASE_[A-Z_]*|DATABASE_URL|PG[A-Z]*)=' | grep -qiE 'supabase\.(co|com)|rgxesocsvhgsqoehxhgt'; then die "l'environnement référence un projet Supabase distant : exécution refusée"; fi
[ -z "${STRIPE_API_BASE:-}" ] || die "STRIPE_API_BASE défini : refusé (ce test vise le vrai Stripe en mode test)"
for b in docker node psql stripe "${DENO:-deno}"; do command -v "$b" >/dev/null 2>&1 && ok "outil présent : $b" || ko "outil manquant : $b"; done
docker info >/dev/null 2>&1 && ok "Docker démarré" || ko "Docker non démarré"
[ $fail = 0 ] || exit 2
S() { stripe "$@"; }
J() { node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"; }
istest() { node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(j.livemode!==false){console.error('livemode='+j.livemode);process.exit(1)} console.log(JSON.stringify(j))"; }
if [ "$MODE" = "--check" ]; then echo "Prérequis satisfaits (aucune écriture, aucun appel Stripe)."; exit 0; fi

# --- Garde 2 : le compte est bien en mode test (lecture seule), AVANT toute écriture
S balance retrieve 2>/dev/null | istest >/dev/null && ok "compte Stripe vérifié : livemode=false (mode test)" || die "le compte n'est pas en mode test (ou injoignable) : arrêt avant toute écriture"
if [ "$MODE" = "--check-key" ]; then echo "Clé de test valide. Rien n'a été créé."; exit 0; fi
echo "Ce test va créer des objets de TEST chez Stripe (1 produit, 8 prix, 1 client, 1 abonnement), puis les désactiver/supprimer ; base locale uniquement."

export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres DENO="${DENO:-deno}"
export RECETTE_PASSWORD="$(grep -o 'mot de passe : [A-Za-z0-9]*' supabase/seed.sql | head -1 | awk '{print $NF}')"
M=31000000-0000-0000-0000-000000000001
cleanup() {
  kill ${LISTEN:-} 2>/dev/null
  [ -n "${SUB:-}" ] && S subscriptions cancel "$SUB" >/dev/null 2>&1
  [ -n "${CUS:-}" ] && S customers delete "$CUS" >/dev/null 2>&1
  [ -n "${PROD:-}" ] && S products update "$PROD" -d active=false >/dev/null 2>&1
  for f in "$W"/fn-*.log "$OUT"/*; do [ -f "$f" ] && sed -i -E 's/(sk|rk|pk)_(test|live)_[A-Za-z0-9]+/[CLÉ-STRIPE-MASQUÉE]/g; s/whsec_[A-Za-z0-9]+/[SECRET-WEBHOOK-MASQUÉ]/g; s/Bearer [A-Za-z0-9._-]+/Bearer [MASQUÉ]/g' "$f"; done
  docs/recette/functions_serve.sh stop >/dev/null 2>&1
}
trap cleanup EXIT

echo "== 1. Pile locale (migration complète) ====================================================="
scripts/localdb/http_stack.sh up 20261029120000 > "$OUT/00-pile.txt" 2>&1 || { tail -5 "$OUT/00-pile.txt"; exit 1; }
export PGPASSWORD="$(node -p "require('$W/keys.json').dbpw")"
ANON="$(node -p "require('$W/keys.json').anon")"; API=http://127.0.0.1:54321
[ "$(psql -X -At -c "select inet_server_addr()::text")" != "" ] && ok "base utilisée : locale (127.0.0.1:54322)"

echo "== 2. Produit et prix de TEST ================================================================"
PROD=$(S products create --name "ZeeRoo recette locale" -d "metadata[zeeroo]=recette" | istest | J .id) || die "produit non créé en mode test"
mkprice() { S prices create --currency eur --unit-amount "$1" -d "recurring[interval]=$2" --product "$PROD" | istest | J .id; }
P_START_M=$(mkprice 1999 month) && P_START_Y=$(mkprice 19999 year) && P_PRO_M=$(mkprice 2999 month) && P_PRO_Y=$(mkprice 29999 year) \
 && P_C_START_M=$(mkprice 1499 month) && P_C_START_Y=$(mkprice 14999 year) && P_C_PRO_M=$(mkprice 2499 month) && P_C_PRO_Y=$(mkprice 24999 year) \
 && ok "produit et 8 prix créés, tous livemode=false" || die "création d'un prix refusée ou hors mode test"

echo "== 3. Edge Functions réelles + Stripe CLI (webhook réel) ====================================="
WHSEC=$(S listen --print-secret 2>/dev/null | tr -d '\r\n')
case "$WHSEC" in whsec_*) ok "secret de signature obtenu de la CLI Stripe";; *) die "secret de signature non obtenu";; esac
export STRIPE_SECRET_KEY="$KEY" STRIPE_WEBHOOK_SECRET="$WHSEC" STRIPE_API_BASE=""
export STRIPE_PRICE_START_MONTH=$P_START_M STRIPE_PRICE_START_YEAR=$P_START_Y STRIPE_PRICE_PRO_MONTH=$P_PRO_M STRIPE_PRICE_PRO_YEAR=$P_PRO_Y
export STRIPE_PRICE_COURIER_START_MONTH=$P_C_START_M STRIPE_PRICE_COURIER_START_YEAR=$P_C_START_Y STRIPE_PRICE_COURIER_PRO_MONTH=$P_C_PRO_M STRIPE_PRICE_COURIER_PRO_YEAR=$P_C_PRO_Y
docs/recette/functions_serve.sh stop >/dev/null 2>&1; kill "$(cat "$W/gateway.pid" 2>/dev/null)" 2>/dev/null
STRIPE_REAL=1 docs/recette/functions_serve.sh start >/dev/null && ok "fonctions servies contre Stripe (mode test)"
nohup node docs/recette/gateway.mjs > "$W/gateway.log" 2>&1 & echo $! > "$W/gateway.pid"; sleep 2
S listen --forward-to "$API/functions/v1/stripe-webhook" --events 'checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted' > >(redact > "$OUT/stripe-listen.log") 2>&1 & LISTEN=$!
for i in $(seq 1 15); do grep -q "Ready" "$OUT/stripe-listen.log" 2>/dev/null && break; sleep 1; done
grep -q "Ready" "$OUT/stripe-listen.log" && ok "stripe listen prêt" || die "stripe listen non prêt"
# Contrôle négatif : une signature invalide est refusée par la vraie fonction
BAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/functions/v1/stripe-webhook" -H 'Stripe-Signature: t=1,v1=00' -H 'Content-Type: application/json' -d '{"id":"evt_forge","type":"customer.subscription.deleted","data":{"object":{}}}')
[ "$BAD" = 400 ] && ok "signature invalide refusée (HTTP 400) : la vérification de signature est active" || ko "signature invalide acceptée ou erreur (HTTP $BAD)"

echo "== 4. Session Checkout RÉELLE (mode test) créée par la fonction billing ======================="
TOK=$(curl -s -X POST "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON" -H 'Content-Type: application/json' -d "{\"email\":\"commercant2@zeroo.test\",\"password\":\"$RECETTE_PASSWORD\"}" | J .access_token)
R=$(curl -s -X POST "$API/functions/v1/billing" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"action":"checkout","plan":"start","interval":"month"}')
echo "$R" | grep -q 'checkout.stripe.com' && ok "URL de paiement Stripe (test) renvoyée" || ko "billing : $(echo "$R" | cut -c1-120)"
CUS=$(psql -X -At -c "select stripe_customer_id from public.subscriptions where merchant_id='$M'")
[ -n "$CUS" ] && S customers retrieve "$CUS" | istest >/dev/null && ok "client Stripe $CUS : livemode=false, lié au commerce" || ko "client Stripe absent ou hors mode test"

echo "== 5. Abonnement RÉEL de test (carte de test 4242) : événements émis par Stripe ================="
S payment_methods attach pm_card_visa -d "customer=$CUS" >/dev/null 2>&1
SUBJ=$(S subscriptions create -d "customer=$CUS" -d "items[0][price]=$P_START_M" -d "default_payment_method=pm_card_visa" -d trial_period_days=30 | istest) && SUB=$(echo "$SUBJ" | J .id) && ok "abonnement $SUB créé, livemode=false" || die "abonnement non créé en mode test"
st=""; for i in $(seq 1 30); do st=$(psql -X -At -c "select status from public.subscriptions where merchant_id='$M'"); [ "$st" = trialing ] || [ "$st" = active ] && break; sleep 2; done
{ [ "$st" = trialing ] || [ "$st" = active ]; } && ok "webhook RÉEL traité : statut « $st » en base" || ko "statut en base : « $st »"

echo "== 6. Publication autorisée par l'abonnement réel ============================================="
curl -s -o /dev/null -X PATCH "$API/rest/v1/merchants?id=eq.$M" -H "apikey: $ANON" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"is_published":true}'
[ "$(psql -X -At -c "select is_published from public.merchants where id='$M'")" = t ] && ok "publication acceptée (abonnement réel + encaissement)" || ko "publication refusée"

echo "== 7. Résiliation RÉELLE : customer.subscription.deleted ======================================"
S subscriptions cancel "$SUB" >/dev/null 2>&1
for i in $(seq 1 30); do st=$(psql -X -At -c "select status from public.subscriptions where merchant_id='$M'"); [ "$st" = canceled ] && break; sleep 2; done
[ "$st" = canceled ] && ok "résiliation traitée par le webhook réel : « canceled »" || ko "résiliation non traitée : « $st »"
[ "$(psql -X -At -c "select is_published from public.merchants where id='$M'")" = f ] && ok "fiche DÉPUBLIÉE automatiquement à la résiliation" || ko "fiche encore publiée après résiliation"
SUB=""   # déjà résilié

echo "== 8. Les événements reçus viennent bien de Stripe, sans erreur de livraison ================="
IDS=$(psql -X -At -c "select id from public.stripe_events order by id")
STRIPE_IDS=$(S events list --limit 100 2>/dev/null | J ".data.map(e=>e.id).join('\n')")
n=0; bad=0; for id in $IDS; do n=$((n+1)); echo "$STRIPE_IDS" | grep -qx "$id" || bad=$((bad+1)); done
[ "$n" -ge 2 ] && [ "$bad" = 0 ] && ok "$n événement(s) en base, tous retrouvés chez Stripe (ids evt_ réels)" || ko "événements en base : $n, absents chez Stripe : $bad"
psql -X -At -c "select type from public.stripe_events" | grep -q "customer.subscription.created" && psql -X -At -c "select type from public.stripe_events" | grep -q "customer.subscription.deleted" && ok "types reçus : création et suppression d'abonnement" || ko "types d'événements attendus absents"
grep -qE "\[(4|5)[0-9]{2}\]" "$OUT/stripe-listen.log" && ko "erreur HTTP dans le journal de livraison de stripe listen" || ok "aucune erreur HTTP dans le journal de livraison (toutes les livraisons en 2xx)"
EVT=$(echo "$IDS" | head -1); [ -n "$EVT" ] && S events resend "$EVT" >/dev/null 2>&1 && sleep 4 && ok "événement $EVT rejoué : doublon ignoré par déduplication (le nombre de lignes reste $(psql -X -At -c 'select count(*) from public.stripe_events'))"

echo; echo "Verdict test Stripe réel (mode test) : $([ $fail = 0 ] && echo CONFORME || echo 'ÉCHECS — voir ci-dessus')"; exit $fail
