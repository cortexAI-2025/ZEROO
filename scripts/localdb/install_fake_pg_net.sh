#!/usr/bin/env bash
# pg_net n'existe pas en paquet Debian/Ubuntu : on installe une extension factice (net.http_post ne fait rien)
# pour que les migrations qui l'appellent s'exécutent en local. Nécessite root.
set -euo pipefail
EXT="$(pg_config --sharedir)/extension"
[ -f "$EXT/pg_net.control" ] && exit 0
cat > "$EXT/pg_net.control" <<'C'
comment = 'pg_net factice (tests locaux)'
default_version = '0.0'
relocatable = true
C
cat > "$EXT/pg_net--0.0.sql" <<'S'
create schema if not exists net;
create table net.http_request_queue (
  id bigserial primary key, method text, url text, headers jsonb, body bytea, timeout_milliseconds int
);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                              headers jsonb default '{}', timeout_milliseconds int default 1000)
returns bigint language sql as $$
  insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, convert_to(body::text, 'utf8'), timeout_milliseconds) returning id
$$;
S
