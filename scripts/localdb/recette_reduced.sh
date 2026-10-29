#!/usr/bin/env bash
# Recette du retour arrière À EXPOSITION RÉDUITE (merchants_private_ROLLBACK_REDUCED.sql) et de sa réapplication, sur la pile
# locale (voir http_stack.sh) : 7 profils, conservation des données, commandes, ancienne application dans un navigateur, 2 cycles.
#   DENO=/chemin/deno scripts/localdb/recette_reduced.sh <dossier-de-preuves>
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:?dossier de preuves}"; mkdir -p "$OUT"; W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres DENO="${DENO:-deno}"
export RECETTE_PASSWORD="$(grep -o 'mot de passe : [A-Za-z0-9]*' supabase/seed.sql | head -1 | awk '{print $NF}')"
export CHROMIUM_PATH="${CHROMIUM_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1)}"
fail=0; ok() { echo "OK    $1"; }; ko() { echo "ÉCHEC $1"; fail=1; }; step() { echo; echo "######## $*"; }
run() { local n="$1"; shift; "$@" > "$OUT/$n.txt" 2>&1; local rc=$?; tail -1 "$OUT/$n.txt"; [ $rc -ne 0 ] && { echo "  -> code de sortie $rc"; fail=1; }; return 0; }
psqlf() { psql -X -q -v ON_ERROR_STOP=1 -f "$1" > "$OUT/$2.log" 2>&1; }
sqlv() { psql -X -At -c "$1"; }
checks() { psql -X -At -F, -f docs/recette/checks.sql; }
ADMIN_FP="select md5(coalesce(string_agg(merchant_id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,''),';' order by merchant_id),'')) from public.merchant_private"
OPS_FP_RAW="select md5(coalesce(string_agg(id::text||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by id),'')) from public.merchants where phone is not null or payment_link is not null"
OPS_FP_PRIV="select md5(coalesce(string_agg(merchant_id::text||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by merchant_id),'')) from public.merchant_private where phone is not null or payment_link is not null"
restart_functions() { docs/recette/functions_serve.sh stop >/dev/null 2>&1; kill "$(cat "$W/gateway.pid" 2>/dev/null)" 2>/dev/null; OLD_FUNCTIONS_DIR="$W/old" docs/recette/functions_serve.sh start >/dev/null; nohup node docs/recette/gateway.mjs > "$W/gateway.log" 2>&1 & echo $! > "$W/gateway.pid"; sleep 2; }
build_web() { ( cd "$1" && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" npx expo export --platform web --clear --output-dir "$2" >/dev/null 2>&1 ) || { echo "ÉCHEC build web $1"; fail=1; }; }

step "0. Pile locale (état AVANT) puis migration complète"
scripts/localdb/http_stack.sh up 20261029110000 > "$OUT/00-pile.txt" 2>&1 || { tail -5 "$OUT/00-pile.txt"; exit 1; }; tail -1 "$OUT/00-pile.txt"
export PGPASSWORD="$(node -p "require('$W/keys.json').dbpw")"
export SUPABASE_URL=http://127.0.0.1:54321 ANON_KEY="$(node -p "require('$W/keys.json').anon")"
git worktree prune; rm -rf "$W/oldsrc" "$W/web-old" "$W/old"; mkdir -p "$W/old"
git worktree add -f "$W/oldsrc" origin/ccr-cbee9612-jsmce8-private-prospects >/dev/null 2>&1 && ln -sfn "$PWD/node_modules" "$W/oldsrc/node_modules"
git archive origin/ccr-cbee9612-jsmce8-private-prospects supabase/functions | tar -x -C "$W/old"
build_web "$W/oldsrc" "$W/web-old"; restart_functions
psqlf docs/production/merchants_private_production.sql 00-migration && ok "migration complète appliquée" || { ko "migration"; exit 1; }
sqlv "update public.merchants set public_phone='0144556677', public_phone_authorized=false where slug='chez-samir'" >/dev/null
A0=$(sqlv "$ADMIN_FP"); OPS0=$(sqlv "$OPS_FP_PRIV"); echo "empreinte administrative : $A0 ; téléphones/liens : $OPS0" | tee "$OUT/empreintes-depart.txt"
MP_CLIENT_JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' -d "{\"email\":\"commercant@zeroo.test\",\"password\":\"$RECETTE_PASSWORD\"}" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).access_token")

for cycle in 1 2; do
  step "CYCLE $cycle — A. Retour arrière RÉDUIT"
  psqlf docs/production/merchants_private_ROLLBACK_REDUCED.sql c$cycle-a-reduit && ok "retour arrière réduit appliqué (contrôles internes passés)" || { ko "retour arrière réduit : $(tail -2 "$OUT/c$cycle-a-reduit.log" | tr '\n' ' ')"; break; }
  checks > "$OUT/c$cycle-checks-reduit.csv"; echo "checks : $(cat "$OUT/c$cycle-checks-reduit.csv")"
  [ "$(sqlv "$ADMIN_FP")" = "$A0" ] && ok "champs administratifs privés INCHANGÉS (empreinte identique)" || ko "champs administratifs modifiés"
  [ "$(sqlv "select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email) is not null")" = 0 ] && ok "aucun champ administratif dans merchants" || ko "champ administratif dans merchants"
  [ "$(sqlv "select count(phone)+count(payment_link) from public.merchant_private")" = 0 ] && ok "copies privées du téléphone et du lien retirées (source unique : merchants)" || ko "copies privées subsistantes"
  [ "$(sqlv "$OPS_FP_RAW")" = "$OPS0" ] && ok "téléphone et lien de paiement restaurés dans merchants (valeurs identiques)" || ko "valeurs de téléphone / lien différentes"

  step "CYCLE $cycle — B. 7 profils, commerces DÉPUBLIÉS (colonnes brutes)"
  run c$cycle-b-profils-depublie node docs/recette/scenarios_reduced.mjs --unpublished

  step "CYCLE $cycle — C. Republication explicite (ancien modèle) puis 7 profils, commerces PUBLIÉS"
  psql -X -q -v ON_ERROR_STOP=1 -c "set zeeroo.accept_exposure = 'oui'" -f docs/production/merchants_private_ROLLBACK_REPUBLISH.sql > "$OUT/c$cycle-c-republier.log" 2>&1
  psql -X -q -v ON_ERROR_STOP=1 > "$OUT/c$cycle-c-republier.log" 2>&1 <<SQL
set zeeroo.accept_exposure = 'oui';
\i docs/production/merchants_private_ROLLBACK_REPUBLISH.sql
SQL
  [ "$(sqlv "select count(*) from public.merchants where is_published")" -ge 1 ] && ok "republication explicite : commerce(s) publié(s)" || ko "republication sans effet : $(tail -2 "$OUT/c$cycle-c-republier.log" | tr '\n' ' ')"
  run c$cycle-c-profils-publie node docs/recette/scenarios_reduced.mjs --published

  step "CYCLE $cycle — D. Commandes en mode réduit (ancienne fonction, puis fonction tolérante)"
  run c$cycle-d-commande-ancienne-fonction node docs/recette/functions_http.mjs --phase avant --create-order-url http://127.0.0.1:8111/
  run c$cycle-d-commande-fonction-tolerante node docs/recette/functions_http.mjs --phase avant

  step "CYCLE $cycle — E. Ancienne application dans un navigateur (mode réduit)"
  run c$cycle-e-ancienne-application node docs/recette/ui_old_app_reduced.mjs "$OUT/captures"
  A1=$(sqlv "$ADMIN_FP")
  # Le restaurateur modifie son lien de paiement dans l'ancienne application (ici par l'API avec son jeton) : la colonne fait foi.
  curl -s -o /dev/null -w "%{http_code}" -X PATCH "$SUPABASE_URL/rest/v1/merchants?id=eq.30000000-0000-0000-0000-000000000001" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $MP_CLIENT_JWT" -H 'Content-Type: application/json' -d '{"payment_link":"https://pay.example.test/recette-samir-v2"}' | grep -qE "^20" && ok "lien de paiement modifié par le restaurateur pendant le mode réduit" || ko "modification du lien refusée"
  [ "$(sqlv "select payment_link from public.merchants where slug='chez-samir'")" = "https://pay.example.test/recette-samir-v2" ] && ok "le nouveau lien est dans merchants (source de vérité)" || ko "nouveau lien absent de merchants"

  step "CYCLE $cycle — F. Réapplication (merchant_private présente)"
  psqlf docs/production/merchants_private_REAPPLY_AFTER_REDUCED.sql c$cycle-f-reapply && ok "réapplication validée (contrôles internes passés)" || { ko "réapplication : $(tail -2 "$OUT/c$cycle-f-reapply.log" | tr '\n' ' ')"; break; }
  checks > "$OUT/c$cycle-checks-reapply.csv"; echo "checks : $(cat "$OUT/c$cycle-checks-reapply.csv")"
  [ "$(sqlv "$ADMIN_FP")" = "$A1" ] && ok "champs administratifs privés identiques après réapplication" || ko "champs administratifs modifiés par la réapplication"
  [ "$(sqlv "select payment_link from public.merchant_private where merchant_id='30000000-0000-0000-0000-000000000001'")" = "https://pay.example.test/recette-samir-v2" ] && ok "le lien modifié pendant le mode réduit est CONSERVÉ en privé (rien d'écrasé)" || ko "lien modifié perdu"
  [ "$(sqlv "select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link) is not null")" = 0 ] && ok "colonnes brutes vides après réapplication" || ko "colonnes brutes non vides"
  [ "$(sqlv "select count(*) from pg_trigger where tgrelid='public.merchants'::regclass and tgname like 'a00_merchants_private_%'")" = 7 ] && ok "7 déclencheurs de routage réinstallés" || ko "déclencheurs incomplets"
  sqlv "update public.merchant_private set payment_link='https://pay.example.test/recette-samir', phone='0102030405', siret='73282932000074' where merchant_id='30000000-0000-0000-0000-000000000001'" >/dev/null
  sqlv "update public.merchants set public_phone='0144556677', public_phone_authorized=false where slug='chez-samir'" >/dev/null
  A0=$(sqlv "$ADMIN_FP"); OPS0=$(sqlv "$OPS_FP_PRIV")

  # Republication SANS exposition après la réapplication (commerces dépubliés puis republiés par le script dédié)
  sqlv "update public.merchants set is_published=false" >/dev/null
  psqlf docs/production/merchants_private_REAPPLY_REPUBLISH.sql c$cycle-f2-republier && [ "$(sqlv "select count(*) from public.merchants where is_published")" -ge 1 ] && ok "republication après réapplication (sans garde d'exposition) : commerce(s) republié(s)" || ko "republication après réapplication"

  step "CYCLE $cycle — G. Nouvelle application et nouvelles fonctions après la réapplication (modèle fermé)"
  run c$cycle-g-http docs/production/http_checks.sh apres
  run c$cycle-g-profils node docs/recette/scenarios.mjs --write
  run c$cycle-g-commande node docs/recette/functions_http.mjs --phase apres
done

step "Empreintes SHA-256 et verdict"
sha256sum docs/production/merchants_private_ROLLBACK_REDUCED.sql docs/production/merchants_private_REAPPLY_AFTER_REDUCED.sql docs/production/merchants_private_REAPPLY_REPUBLISH.sql docs/production/merchants_private_production.sql docs/production/merchants_private_ROLLBACK.sql docs/production/merchants_private_ROLLBACK_SAFE.sql docs/production/merchants_private_ROLLBACK_REPUBLISH.sql supabase/migrations/20261029120000_merchants_private_details.sql docs/recette/scenarios_reduced.mjs docs/recette/ui_old_app_reduced.mjs scripts/localdb/recette_reduced.sh | tee "$OUT/sha256-sources.txt"
echo; echo "Verdict recette du retour arrière réduit : $([ $fail = 0 ] && echo 'CONFORME (aucun échec)' || echo 'ÉCHECS — voir les fichiers de preuve')"
exit $fail
