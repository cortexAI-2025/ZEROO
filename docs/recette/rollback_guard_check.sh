#!/usr/bin/env bash
# Garde anti-rejeu des scripts de retour arrière (qui modifient la production) : sans confirmation typée, chacun doit refuser,
# AVANT toute modification ; avec la bonne confirmation, la garde laisse passer (le script s'arrête ensuite sur ses propres contrôles
# ou s'applique). Sur une base locale migrée jusqu'à 20261029120000 (par ex. celle de recette_merchants.sh).
#   PGUSER=postgres PGDATABASE=zeeroo_test docs/recette/rollback_guard_check.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
fail=0; ok() { echo "OK    $*"; }; ko() { echo "ÉCHEC $*"; fail=1; }
state() { psql -X -At -c "select (select count(*) from public.merchants where is_published)||'|'||(select count(*) from pg_class where relname='merchant_private')||'|'||(select count(*) from pg_trigger where tgname like 'a00_merchants_private_%')"; }
before=$(state)
check() { # fichier confirmation
  local f="docs/production/$1" name="$2" out
  out=$(psql -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1); rc=$?
  if [ $rc -ne 0 ] && echo "$out" | grep -q "Retour arrière non confirmé"; then ok "$1 : refusé sans confirmation"; else ko "$1 : n'a pas refusé sans confirmation (rc=$rc)"; fi
  [ "$(state)" = "$before" ] && ok "$1 : aucune modification après le refus" || ko "$1 : l'état a changé après le refus"
  out=$(psql -X -q -v ON_ERROR_STOP=1 -c "set zeeroo.confirm_rollback = 'mauvaise-valeur'" -f "$f" 2>&1); rc=$?
  [ $rc -ne 0 ] && echo "$out" | grep -q "Retour arrière non confirmé" && ok "$1 : refusé avec une mauvaise confirmation" || ko "$1 : mauvaise confirmation acceptée"
  [ "$(state)" = "$before" ] || ko "$1 : l'état a changé après une mauvaise confirmation"
  grep -q "zeeroo.confirm_rollback = '$name'" "$f" && ok "$1 : la confirmation attendue est documentée dans l'en-tête de la garde" || ko "$1 : confirmation non documentée"
}
check merchants_private_ROLLBACK.sql merchants_private_raw
check merchants_private_ROLLBACK_SAFE.sql merchants_private_safe
check merchants_private_ROLLBACK_REDUCED.sql merchants_private_reduced
check private_prospects_ROLLBACK.sql private_prospects
echo; [ $fail = 0 ] && echo "# Bilan : conforme" || echo "# Bilan : ÉCHEC"; exit $fail
