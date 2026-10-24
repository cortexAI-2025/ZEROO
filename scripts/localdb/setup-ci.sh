#!/usr/bin/env bash
# Prépare un Postgres 16 Ubuntu pour scripts/localdb/run.sh (CI GitHub Actions ou machine de développement) :
# PostGIS, pgTAP, pg_cron, connexion locale sans mot de passe, base cron `zeeroo_test`. Nécessite root (sudo).
# Idempotent. Ne touche à aucune base distante.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! dpkg -s postgresql-16-cron postgresql-16-pgtap postgresql-16-postgis-3 >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq postgresql-16 postgresql-16-postgis-3 postgresql-16-pgtap postgresql-16-cron
fi
CONF=/etc/postgresql/16/main/postgresql.conf
HBA=/etc/postgresql/16/main/pg_hba.conf
grep -q "^shared_preload_libraries *= *'pg_cron'" "$CONF" || echo "shared_preload_libraries='pg_cron'" >> "$CONF"
grep -q "^cron.database_name" "$CONF" || echo "cron.database_name='zeeroo_test'" >> "$CONF"
# Connexion locale sans mot de passe (environnement jetable uniquement).
sed -i -E 's/^(local[[:space:]]+all[[:space:]]+all[[:space:]]+)peer/\1trust/; s/^(host[[:space:]]+all[[:space:]]+all[[:space:]]+(127\.0\.0\.1\/32|::1\/128)[[:space:]]+)scram-sha-256/\1trust/' "$HBA"
pg_ctlcluster 16 main restart 2>/dev/null || pg_ctlcluster 16 main start
for _ in $(seq 1 20); do pg_isready -q -h localhost && break; sleep 1; done
pg_isready -h localhost
"$(dirname "$0")/install_fake_pg_net.sh"
echo "Postgres prêt : lancer PGUSER=postgres PGHOST=localhost scripts/localdb/run.sh"
