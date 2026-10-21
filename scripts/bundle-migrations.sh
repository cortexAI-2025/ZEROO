#!/usr/bin/env bash
# Génère des scripts SQL à coller dans Supabase → SQL Editor quand `supabase db push` n'est pas utilisable.
# Une migration qui ajoute des valeurs à un enum doit être validée avant d'être utilisée : on coupe donc
# le lot juste après chaque fichier marqué « -- bundle:split ». Chaque script est une transaction.
# Usage : scripts/bundle-migrations.sh <dossier-de-sortie> [première-migration]
set -euo pipefail
cd "$(dirname "$0")/../supabase/migrations"
OUT="${1:?dossier de sortie}"; FROM="${2:-}"
mkdir -p "$OUT"; rm -f "$OUT"/zeeroo_migrations_*.sql
part=1; files=()
flush() {
  [ ${#files[@]} -gt 0 ] || return 0
  local f="$OUT/zeeroo_migrations_$(printf '%02d' $part).sql"
  {
    echo "-- ZeeRoo : lot $part. À coller dans Supabase → SQL Editor → Run, dans l'ordre des lots."
    echo "begin;"
    for m in "${files[@]}"; do echo; echo "-- ===== $m ====="; cat "$m"; echo; done
    echo "create schema if not exists supabase_migrations;"
    echo "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);"
    echo "insert into supabase_migrations.schema_migrations (version, name) values"
    n=${#files[@]}; i=0
    for m in "${files[@]}"; do
      i=$((i+1)); v=${m%%_*}; nm=${m#*_}; nm=${nm%.sql}; sep=","; [ $i -eq $n ] && sep=""
      echo "  ('$v', '$nm')$sep"
    done
    echo "on conflict (version) do nothing;"; echo "commit;"
  } > "$f"
  echo "$f (${#files[@]} migrations)"
  part=$((part+1)); files=()
}
for m in *.sql; do
  [[ -n "$FROM" && "$m" < "$FROM" ]] && continue
  files+=("$m")
  grep -qi "add value" "$m" && flush
done
flush
