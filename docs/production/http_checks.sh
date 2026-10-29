#!/usr/bin/env bash
# Contrôles HTTP réels de l'API Supabase (lecture seule). À lancer avant ET après chaque migration de
# sécurité, puis archiver la sortie (ex. ./http_checks.sh avant > preuves/avant-AAAA-MM-JJ.txt).
#   SUPABASE_URL=https://<ref>.supabase.co ANON_KEY=<clé publishable> [USER_JWT=<jeton d'un client>] ./http_checks.sh <étiquette>
# Aucune écriture. Les « attendu » valent pour l'état APRÈS les migrations 20261029110000 et 20261029120000.
set -u
: "${SUPABASE_URL:?}" "${ANON_KEY:?}"
label="${1:-sans-etiquette}"
echo "# Contrôles HTTP — $label — $(date -u +%FT%TZ)"
pass=0; fail=0
call() { # nom, attendu (regex sur code HTTP), méthode, chemin, [jeton], [corps]
  local name="$1" want="$2" method="$3" path="$4" token="${5:-$ANON_KEY}" body="${6:-}"
  local out code
  if [ "$method" = POST ]; then
    out=$(curl -s -w '\n%{http_code}' -X POST "$SUPABASE_URL$path" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "${body:-{\}}")
  else
    out=$(curl -s -w '\n%{http_code}' "$SUPABASE_URL$path" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token")
  fi
  code=${out##*$'\n'}
  if [[ "$code" =~ $want ]]; then pass=$((pass+1)); echo "OK   $name (HTTP $code)"; else fail=$((fail+1)); echo "ÉCHEC $name : HTTP $code, attendu $want"; echo "     ${out%$'\n'*}" | cut -c1-200; fi
}
leak() { # nom, chemin, regex interdit dans la réponse (anonyme)
  local out; out=$(curl -s "$SUPABASE_URL$2" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
  if echo "$out" | grep -Eq "$3"; then fail=$((fail+1)); echo "ÉCHEC $1 : motif interdit présent"; else pass=$((pass+1)); echo "OK   $1 (aucun motif interdit)"; fi
}
# Annuaire Sirene : fermé
call "anon directory_businesses refusé"        '^(401|403)$' GET  "/rest/v1/directory_businesses?select=siret&limit=1"
call "anon directory_claims refusé"            '^(401|403)$' GET  "/rest/v1/directory_claims?select=*&limit=1"
call "anon search_pro_directory introuvable"   '^404$'       POST "/rest/v1/rpc/search_pro_directory" "$ANON_KEY" '{"p_query":"","p_city":"","p_offset":0}'
call "anon pro_directory_cities introuvable"   '^404$'       POST "/rest/v1/rpc/pro_directory_cities"
call "anon request_directory_claim introuvable" '^404$'      POST "/rest/v1/rpc/request_directory_claim" "$ANON_KEY" '{"p_siret":"0","p_capacity":"x","p_note":"x"}'
# Données administratives des commerces : fermées
call "anon merchant_private refusé"            '^(401|403)$' GET  "/rest/v1/merchant_private?select=*&limit=1"
leak "anon merchants : aucun SIRET/TVA/e-mail"  "/rest/v1/merchants?select=*,siret:merchant_siret,vat_number:merchant_vat_number,contact_email:merchant_contact_email,legal_name:merchant_legal_name,phone:merchant_phone,payment_link:merchant_payment_link&limit=200" '"(siret|vat_number|contact_email|legal_name|phone|payment_link)": *"[^"]'
leak "anon public_merchants : aucun champ sensible" "/rest/v1/public_merchants?select=*&limit=200" '"(siret|vat_number|contact_email|legal_name|payment_link|owner_id|admin_status|marketing_consent)"'
leak "anon : aucune suite de 14 chiffres dans merchants" "/rest/v1/merchants?select=*&limit=200" '[0-9]{14}'
# Compte connecté (client) : même fermeture
if [ -n "${USER_JWT:-}" ]; then
  call "client directory_businesses refusé"    '^(401|403)$' GET  "/rest/v1/directory_businesses?select=siret&limit=1" "$USER_JWT"
  call "client merchant_private refusé"        '^(401|403)$' GET  "/rest/v1/merchant_private?select=*&limit=1" "$USER_JWT"
  call "client admin_directory_claims refusé"  '^(400|401|403)$' POST "/rest/v1/rpc/admin_directory_claims" "$USER_JWT"
else
  echo "(USER_JWT absent : contrôles « compte connecté » non exécutés)"
fi
echo "# Résultat : $pass OK, $fail échec(s)"
[ "$fail" -eq 0 ]
