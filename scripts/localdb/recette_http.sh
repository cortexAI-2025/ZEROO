#!/usr/bin/env bash
# Recette HTTP + Edge Functions de la PR #60 sur la pile locale (voir http_stack.sh). Tout est local : aucune
# production, aucun Stripe réel. Produit les preuves dans <dossier>.
#   DENO=/chemin/deno scripts/localdb/recette_http.sh <dossier-de-preuves>
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:?dossier de preuves}"; mkdir -p "$OUT"; W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres
export DENO="${DENO:-deno}"
# Mot de passe des comptes fictifs : lu dans supabase/seed.sql (aucune valeur en dur dans les scripts)
export RECETTE_PASSWORD="$(grep -o 'mot de passe : [A-Za-z0-9]*' supabase/seed.sql | head -1 | awk '{print $NF}')"
fail=0; step() { echo; echo "######## $*"; }
run() { local name="$1"; shift; "$@" > "$OUT/$name.txt" 2>&1; local rc=$?; tail -1 "$OUT/$name.txt"; [ $rc -ne 0 ] && { echo "  -> code de sortie $rc"; fail=1; }; return 0; }
fp_raw() { psql -X -At -c "select md5(string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by id)) from public.merchants"; }
fp_priv() { psql -X -At -c "select md5(string_agg(merchant_id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by merchant_id)) from public.merchant_private"; }
build_web() { # <sourcedir> <outdir> : export web avec la pile locale comme backend
  ( cd "$1" && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" npx expo export --platform web --clear --output-dir "$2" >/dev/null 2>&1 ) || { echo "ÉCHEC build web $1"; fail=1; }
}
export CHROMIUM_PATH="${CHROMIUM_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
restart_functions() { docs/recette/functions_serve.sh stop >/dev/null; kill "$(cat "$W/gateway.pid" 2>/dev/null)" 2>/dev/null; OLD_FUNCTIONS_DIR="$W/old" docs/recette/functions_serve.sh start >/dev/null; nohup node docs/recette/gateway.mjs > "$W/gateway.log" 2>&1 & echo $! > "$W/gateway.pid"; sleep 2; }

step "0. Pile locale (état AVANT : migrations jusqu'à 20261029110000, seed, données fictives)"
scripts/localdb/http_stack.sh up 20261029110000 > "$OUT/00-pile.txt" 2>&1 || { tail -5 "$OUT/00-pile.txt"; exit 1; }; tail -1 "$OUT/00-pile.txt"
export PGPASSWORD="$(node -p "require('$W/keys.json').dbpw")"
rm -rf "$W/old"; mkdir -p "$W/old"; git archive origin/ccr-cbee9612-jsmce8-private-prospects supabase/functions | tar -x -C "$W/old"
restart_functions
export SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY=$(node -p "require('$W/keys.json').anon")
git worktree prune; rm -rf "$W/oldsrc" "$W/web-old" "$W/web"; git worktree add -f "$W/oldsrc" origin/ccr-cbee9612-jsmce8-private-prospects >/dev/null 2>&1 && ln -sfn "$PWD/node_modules" "$W/oldsrc/node_modules"
build_web "$W/oldsrc" "$W/web-old"; build_web "$PWD" "$W/web"
USER_JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"client@zeroo.test\",\"password\":\"$RECETTE_PASSWORD\"}" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).access_token"); export USER_JWT
psql -X -At -F, -f docs/recette/checks.sql > "$OUT/checks-1-avant.csv"; F_BEFORE=$(fp_raw); echo "empreinte valeurs avant : $F_BEFORE" | tee "$OUT/empreinte-avant.txt"

step "1. AVANT migration — ancienne application + ancienne fonction create-order"
run 10-avant-http docs/production/http_checks.sh avant
run 11-avant-fonctions node docs/recette/functions_http.mjs --phase avant --create-order-url http://127.0.0.1:8111/
run 12-avant-nouvelle-fonction node docs/recette/functions_http.mjs --phase avant   # NOUVELLE create-order AVANT la migration (déployable en avance)

step "2. Application du script de production (Postgres Supabase officiel)"
psql -X -v ON_ERROR_STOP=1 -f docs/production/merchants_private_production.sql > "$OUT/20-migration.txt" 2>&1 && echo "script appliqué" || { echo "ÉCHEC du script"; tail -5 "$OUT/20-migration.txt"; exit 1; }
psql -X -q -c "update public.merchants set public_phone='0144556677', public_phone_authorized=false where slug='chez-samir'"
psql -X -At -F, -f docs/recette/checks.sql > "$OUT/checks-2-apres.csv"; F_AFTER=$(fp_priv)
[ "$F_BEFORE" = "$F_AFTER" ] && echo "OK valeurs privées identiques ($F_AFTER)" | tee "$OUT/empreinte-apres.txt" || { echo "ÉCHEC valeurs différentes"; fail=1; }

step "3. APRÈS migration, ANCIENNE fonction create-order (bascule non coordonnée)"
run 30-apres-ancienne-fonction node docs/recette/functions_http.mjs --phase apres --create-order-url http://127.0.0.1:8111/ --expect-create-order-error merchant_no_payment_link

step "3b. APRÈS migration, ANCIENNE application dans un navigateur (restaurateur qui n'a pas rechargé)"
run 35-apres-ancienne-application node docs/recette/ui_old_app.mjs "$OUT/captures"
grep -E "RÉSULTAT" "$OUT/35-apres-ancienne-application.txt"

step "4. APRÈS migration — NOUVELLES fonction et application"
run 40-apres-http docs/production/http_checks.sh apres
run 41-apres-scenarios node docs/recette/scenarios.mjs --write
run 42-apres-fonctions node docs/recette/functions_http.mjs --phase apres
run 43-apres-navigateur node docs/recette/ui_publicphone.mjs "$OUT/captures"

step "5. Retour arrière complet (SQL + restauration de l'ancienne fonction) puis contrôle"
psql -X -q -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261029120000','x') on conflict do nothing" >/dev/null
PGOPTIONS="-c zeeroo.confirm_rollback=merchants_private_raw" psql -X -v ON_ERROR_STOP=1 -f docs/production/merchants_private_ROLLBACK.sql > "$OUT/50-rollback.txt" 2>&1 && echo "retour arrière appliqué" || { echo "ÉCHEC retour arrière"; fail=1; }
psql -X -At -F, -f docs/recette/checks.sql > "$OUT/checks-3-rollback.csv"; F_RB=$(fp_raw)
[ "$F_BEFORE" = "$F_RB" ] && echo "OK colonnes brutes restaurées à l'identique ($F_RB)" || { echo "ÉCHEC colonnes brutes différentes"; fail=1; }
run 51-rollback-http docs/production/http_checks.sh avant
run 52-rollback-fonctions node docs/recette/functions_http.mjs --phase avant --create-order-url http://127.0.0.1:8111/
run 53-rollback-nouvelle-fonction node docs/recette/functions_http.mjs --phase avant   # la nouvelle fonction reste valable après un retour arrière

step "6. Réapplication puis nouvelle bascule complète"
psql -X -v ON_ERROR_STOP=1 -f docs/production/merchants_private_production.sql > "$OUT/60-reapply.txt" 2>&1 && echo "réapplication validée" || { echo "ÉCHEC réapplication"; fail=1; }
psql -X -q -c "update public.merchants set public_phone='0144556677', public_phone_authorized=false where slug='chez-samir'"
F_RE=$(fp_priv); [ "$F_BEFORE" = "$F_RE" ] && echo "OK valeurs privées identiques après réapplication" || { echo "ÉCHEC valeurs après réapplication"; fail=1; }
psql -X -At -F, -f docs/recette/checks.sql > "$OUT/checks-4-reapply.csv"
run 61-reapply-http docs/production/http_checks.sh apres
run 62-reapply-scenarios node docs/recette/scenarios.mjs --write
run 63-reapply-fonctions node docs/recette/functions_http.mjs --phase apres
run 64-reapply-navigateur node docs/recette/ui_publicphone.mjs "$OUT/captures"

step "7. Empreintes SHA-256 et verdict"
sha256sum docs/production/merchants_private_production.sql docs/production/merchants_private_ROLLBACK.sql supabase/migrations/20261029120000_merchants_private_details.sql docs/recette/*.sh docs/recette/*.mjs docs/recette/*.sql docs/production/http_checks.sh scripts/localdb/http_stack.sh | tee "$OUT/sha256-sources.txt"
echo; echo "Verdict recette HTTP locale : $([ $fail = 0 ] && echo 'CONFORME (aucun échec)' || echo 'ÉCHECS — voir les fichiers de preuve')"
exit $fail
