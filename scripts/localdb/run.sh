#!/usr/bin/env bash
# Rejoue les migrations puis les tests pgTAP sur un Postgres local (PostGIS + pgTAP + pg_cron requis).
# Variables : PGDATABASE (défaut zeeroo_test), PGUSER, PGHOST. La base est recréée à chaque lancement.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${PGDATABASE:-zeeroo_test}"
scripts/localdb/install_fake_pg_net.sh
ADMIN="psql -v ON_ERROR_STOP=1 -q -d postgres"
$ADMIN -c "drop database if exists $DB with (force)" -c "create database $DB"
export PGDATABASE="$DB"
psql -v ON_ERROR_STOP=1 -q -f scripts/localdb/supabase_shim.sql >/dev/null 2>&1
psql -q -d postgres -c "alter database $DB set search_path to \"\$user\", public, extensions"
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2> >(grep -v "^NOTICE\|^psql:.*NOTICE" >&2) || { echo "ÉCHEC migration $f" >&2; exit 1; }
done
echo "migrations: OK"
[ -f supabase/seed.sql ] && psql -v ON_ERROR_STOP=1 -q -f supabase/seed.sql >/dev/null 2>&1 && echo "seed: OK"
fail=0
for t in ${@:-supabase/tests/database/*.test.sql}; do
  out=$(psql -v ON_ERROR_STOP=0 -q -t -A -f "$t" 2>&1) || true
  if echo "$out" | grep -qE "^not ok|Looks like you (failed|planned)|ERROR:"; then echo "ÉCHEC $t"; echo "$out" | grep -E "^not ok|ERROR|#" | head -15; fail=1
  else echo "OK    $t ($(echo "$out" | grep -c '^ok') tests)"; fi
done
for t in supabase/tests/concurrency/*.sh; do
  [ -f "$t" ] || continue
  echo "Concurrence : $t"
  bash "$t" || fail=1
done
exit $fail
