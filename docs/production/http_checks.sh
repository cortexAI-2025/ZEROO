#!/usr/bin/env bash
# Contrôles HTTP réels de l'API Supabase (lecture seule, aucune écriture).
#
#   SUPABASE_URL=https://<ref>.supabase.co ANON_KEY=<clé publishable> [USER_JWT=<jeton d'un client>] \
#     ./http_checks.sh avant|apres [fichier-de-preuve]
#
# Modes
#   avant : état de production AVANT les migrations 20261029110000 / 20261029120000. Une exposition
#           connue est « ATTENDU-AVANT » (elle documente l'état initial, ce n'est pas une erreur).
#   apres : état cible. Toute exposition est un « ÉCHEC ».
# Dans les deux modes, une réponse inattendue (HTTP 000/5xx/429, code non prévu) est une « ERREUR-TECHNIQUE »
# distincte d'un échec de sécurité : elle ne prouve rien et le contrôle est à refaire.
#
# Codes de sortie : 0 conforme · 1 échec de sécurité (mode apres) · 2 erreur technique · 3 contrôle non probant
# (aucune ligne publiée à examiner). Les jetons ne sont jamais écrits : ils transitent par stdin de curl
# (pas dans la liste des processus), aucun en-tête n'est affiché, et toute chaîne ressemblant à un jeton
# est masquée avant affichage ou enregistrement dans le fichier de preuve.
set -u
set +x
mode="${1:-}"; proof="${2:-}"
case "$mode" in avant|apres) ;; *) echo "usage: $0 avant|apres [fichier-de-preuve]" >&2; exit 64;; esac
: "${SUPABASE_URL:?SUPABASE_URL manquant}" "${ANON_KEY:?ANON_KEY manquant}"

redact() { sed -E 's/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/[JETON-MASQUÉ]/g; s/sb_(publishable|secret)_[A-Za-z0-9_-]+/[CLÉ-MASQUÉE]/g'; }
if [ -n "$proof" ]; then umask 077; exec > >(redact | tee "$proof") 2>&1; else exec > >(redact) 2>&1; fi

ok=0; expected_before=0; fail=0; tech=0; inconclusive=0
BODY=""; CODE=""
req() { # méthode chemin jeton [corps] -> BODY, CODE (le jeton passe par stdin de curl)
  local method="$1" path="$2" token="$3" body="${4:-}" out
  out=$(printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\nheader = "Content-Type: application/json"\n' "$ANON_KEY" "$token" |
    curl -sS -K - --max-time 20 -w '\n%{http_code}' -X "$method" "$SUPABASE_URL$path" ${body:+--data "$body"} 2>/dev/null) || out=$'\n000'
  CODE=${out##*$'\n'}; BODY=${out%$'\n'*}
}
verdict() { # nom, résultat (ok|attendu-avant|echec|tech|non-probant), détail
  case "$2" in
    ok) ok=$((ok+1)); echo "OK                $1 $3";;
    attendu-avant) expected_before=$((expected_before+1)); echo "ATTENDU-AVANT     $1 $3";;
    echec) fail=$((fail+1)); echo "ÉCHEC             $1 $3";;
    tech) tech=$((tech+1)); echo "ERREUR-TECHNIQUE  $1 $3";;
    non-probant) inconclusive=$((inconclusive+1)); echo "NON-PROBANT       $1 $3";;
  esac
}
# code_check nom méthode chemin jeton corps want_apres want_avant
code_check() {
  local name="$1" method="$2" path="$3" token="$4" body="$5" want_after="$6" want_before="$7"
  req "$method" "$path" "$token" "$body"
  if [ "$CODE" = 000 ] || [[ "$CODE" =~ ^5 ]] || [ "$CODE" = 429 ]; then verdict "$name" tech "(HTTP $CODE)"; return; fi
  if [[ "$CODE" =~ $want_after ]]; then verdict "$name" ok "(HTTP $CODE)"
  elif [ "$mode" = avant ] && [[ "$CODE" =~ $want_before ]]; then verdict "$name" attendu-avant "(HTTP $CODE : exposition actuelle)"
  elif [[ "$CODE" =~ $want_before ]]; then verdict "$name" echec "(HTTP $CODE : exposition)"
  else verdict "$name" tech "(HTTP $CODE inattendu, attendu $want_after)"; fi
}
# leak_check nom chemin motif-interdit [jeton]
leak_check() {
  local name="$1" path="$2" pattern="$3" token="${4:-$ANON_KEY}" rows
  req GET "$path" "$token"
  if [ "$CODE" != 200 ]; then verdict "$name" tech "(HTTP $CODE, 200 attendu pour lire la réponse)"; return; fi
  rows=$(printf '%s' "$BODY" | grep -o '"id"' | wc -l | tr -d ' ')
  if printf '%s' "$BODY" | grep -Eq "$pattern"; then
    if [ "$mode" = avant ]; then verdict "$name" attendu-avant "(motif sensible présent : exposition actuelle, $rows ligne(s))"; else verdict "$name" echec "(motif sensible présent, $rows ligne(s))"; fi
  elif [ "$rows" = 0 ]; then verdict "$name" non-probant "(0 ligne : aucun commerce publié à examiner)"
  else verdict "$name" ok "($rows ligne(s) examinée(s), aucun motif sensible)"; fi
}

echo "# Contrôles HTTP — mode $mode — $(date -u +%FT%TZ) — $SUPABASE_URL"
SENS='"(siret|vat_number|contact_email|legal_name|phone|payment_link)": *"[^"]'
# Annuaire Sirene
code_check "anon directory_businesses"           GET  "/rest/v1/directory_businesses?select=siret&limit=1" "$ANON_KEY" "" '^(401|403)$' '^200$'
code_check "anon directory_claims"               GET  "/rest/v1/directory_claims?select=*&limit=1"         "$ANON_KEY" "" '^(401|403)$' '^200$'
code_check "anon rpc search_pro_directory"       POST "/rest/v1/rpc/search_pro_directory"                  "$ANON_KEY" '{"p_query":"","p_city":"","p_offset":0}' '^404$' '^200$'
code_check "anon rpc pro_directory_cities"       POST "/rest/v1/rpc/pro_directory_cities"                  "$ANON_KEY" '{}' '^404$' '^200$'
code_check "anon rpc request_directory_claim"    POST "/rest/v1/rpc/request_directory_claim"               "$ANON_KEY" '{"p_siret":"0","p_capacity":"x","p_note":"x"}' '^404$' '^(401|403|400)$'
# Données administratives des commerces
code_check "anon merchant_private"               GET  "/rest/v1/merchant_private?select=*&limit=1"         "$ANON_KEY" "" '^(401|403|404)$' '^(401|403|404)$'
leak_check "anon merchants (colonnes brutes)"    "/rest/v1/merchants?select=id,siret,vat_number,contact_email,legal_name,phone,payment_link&limit=200" "$SENS"
if [ "$mode" = apres ]; then
  leak_check "anon merchants (colonnes calculées)" "/rest/v1/merchants?select=id,siret:merchant_siret,vat_number:merchant_vat_number,contact_email:merchant_contact_email,legal_name:merchant_legal_name,phone:merchant_phone,payment_link:merchant_payment_link&limit=200" "$SENS"
  leak_check "anon public_merchants"             "/rest/v1/public_merchants?select=*&limit=200" '"(siret|vat_number|contact_email|legal_name|payment_link|owner_id|admin_status|marketing_consent|phone)"'
fi
if [ -n "${USER_JWT:-}" ]; then
  code_check "client directory_businesses"       GET  "/rest/v1/directory_businesses?select=siret&limit=1" "$USER_JWT" "" '^(401|403)$' '^200$'
  code_check "client merchant_private"           GET  "/rest/v1/merchant_private?select=*&limit=1"         "$USER_JWT" "" '^(401|403|404)$' '^(401|403|404)$'
  leak_check "client merchants (colonnes brutes)" "/rest/v1/merchants?select=id,siret,vat_number,contact_email,legal_name,payment_link&limit=200" "$SENS" "$USER_JWT"
  code_check "client admin_directory_claims"     POST "/rest/v1/rpc/admin_directory_claims"                "$USER_JWT" '{}' '^(400|401|403)$' '^(400|401|403)$'
else
  echo "(USER_JWT absent : contrôles « compte connecté » non exécutés)"
fi
echo "# Bilan : $ok conforme(s), $expected_before attendu(s) avant migration, $fail échec(s), $tech erreur(s) technique(s), $inconclusive non probant(s)"
[ "$tech" -gt 0 ] && exit 2
[ "$fail" -gt 0 ] && exit 1
[ "$inconclusive" -gt 0 ] && exit 3
exit 0
