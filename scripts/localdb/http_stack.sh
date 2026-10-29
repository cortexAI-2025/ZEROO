#!/usr/bin/env bash
# Pile HTTP LOCALE équivalente à `supabase start` (sans projet distant, sans clé de production) :
#   Postgres Supabase (image officielle) + GoTrue + PostgREST + stripe-mock + passerelle /rest/v1 /auth/v1,
# puis migrations du dépôt (jusqu'à la version indiquée), seed et données fictives de recette.
#   scripts/localdb/http_stack.sh up [dernière-migration-à-appliquer]   # défaut : 20261029110000 (état « avant »)
#   scripts/localdb/http_stack.sh down
# Prérequis : Docker démarré (dockerd), node, psql, images supabase/postgres, supabase/gotrue, postgrest/postgrest,
# stripe/stripe-mock. Limites : le service Storage n'est pas lancé (colonnes de storage.buckets ajoutées à la main),
# pas de Realtime ni de Kong ; les Edge Functions sont servies par Deno (voir docs/recette/http_functions.mjs).
set -euo pipefail
cd "$(dirname "$0")/../.."
W="${HTTP_STACK_DIR:-/tmp/zeeroo-http}"; mkdir -p "$W"
PGIMG=supabase/postgres:17.6.1.054; AUTHIMG=supabase/gotrue:v2.197.0; RESTIMG=postgrest/postgrest:v12.2.3; STRIPEIMG=stripe/stripe-mock:latest
cmd="${1:-up}"; LAST="${2:-20261029110000}"
down() { docker rm -f zr-pg zr-auth zr-rest zr-stripe >/dev/null 2>&1 || true; [ -f "$W/gateway.pid" ] && kill "$(cat "$W/gateway.pid")" 2>/dev/null || true; rm -f "$W/gateway.pid"; }
[ "$cmd" = down ] && { down; echo "pile arrêtée"; exit 0; }
down
node -e "
const c=require('node:crypto');const secret=c.randomBytes(32).toString('hex');const dbpw=c.randomBytes(12).toString('hex');const webhook='whsec_'+c.randomBytes(16).toString('hex');
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const s=r=>{const h=b({alg:'HS256',typ:'JWT'}),p=b({iss:'zeeroo-local',role:r,exp:1983812996});return h+'.'+p+'.'+c.createHmac('sha256',secret).update(h+'.'+p).digest('base64url')};
console.log(JSON.stringify({secret,dbpw,webhook,anon:s('anon'),service:s('service_role')}));" > "$W/keys.json"
SECRET=$(node -p "require('$W/keys.json').secret"); DBPW=$(node -p "require('$W/keys.json').dbpw")
docker run -d --name zr-pg -p 127.0.0.1:54322:5432 -e POSTGRES_PASSWORD="$DBPW" $PGIMG >/dev/null
for i in $(seq 1 60); do docker exec zr-pg pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 3; done
sleep 5
export PGPASSWORD="$DBPW" PGHOST=127.0.0.1 PGPORT=54322
psql -X -q -U supabase_admin -d postgres -c "alter role supabase_auth_admin with password '$DBPW'" -c "alter role authenticator with password '$DBPW'" \
  -c "alter table storage.buckets add column if not exists public boolean default false, add column if not exists file_size_limit bigint, add column if not exists allowed_mime_types text[]"
docker run -d --name zr-auth --network host -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1:54321 \
 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:${DBPW}@127.0.0.1:54322/postgres" \
 -e GOTRUE_SITE_URL=http://127.0.0.1:8081 -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
 -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_EXTERNAL_PHONE_ENABLED=true -e GOTRUE_SMS_AUTOCONFIRM=true $AUTHIMG >/dev/null
for i in $(seq 1 30); do curl -sf -m 3 http://127.0.0.1:9999/health >/dev/null 2>&1 && break; sleep 2; done
export PGUSER=postgres PGDATABASE=postgres
for f in supabase/migrations/*.sql; do
  [ "$(basename "$f" | cut -c1-14)" \> "$LAST" ] && continue
  psql -X -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>"$W/mig.err" || { echo "ÉCHEC migration $f" >&2; grep -v NOTICE "$W/mig.err" | head -4 >&2; exit 1; }
done
psql -X -q -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
psql -X -v ON_ERROR_STOP=1 -q -f supabase/seed.sql >/dev/null 2>"$W/seed.err" || { echo "ÉCHEC seed" >&2; head -3 "$W/seed.err" >&2; exit 1; }
psql -X -v ON_ERROR_STOP=1 -q -f docs/recette/merchants_recette_extra.sql >/dev/null
docker run -d --name zr-rest --network host -e PGRST_DB_URI="postgres://authenticator:${DBPW}@127.0.0.1:54322/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET="$SECRET" -e PGRST_DB_EXTRA_SEARCH_PATH=public,extensions -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=3000 $RESTIMG >/dev/null
docker run -d --name zr-stripe -p 127.0.0.1:12111:12111 $STRIPEIMG >/dev/null
for i in $(seq 1 30); do curl -sf -m 3 http://127.0.0.1:3000/ >/dev/null 2>&1 && break; sleep 2; done
nohup node docs/recette/gateway.mjs > "$W/gateway.log" 2>&1 & echo $! > "$W/gateway.pid"
sleep 2
echo "pile prête : API http://127.0.0.1:54321 (clé anon dans $W/keys.json), Postgres 127.0.0.1:54322, stripe-mock 127.0.0.1:12111"
