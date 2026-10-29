#!/usr/bin/env bash
# Vérifie la migration 20261029120000 sur une base PEUPLÉE (les tests pgTAP migrent une base vide et ne
# voient donc pas une perte de données lors de la recopie). Rejoue les migrations jusqu'à la précédente,
# charge le seed, ajoute des données administratives, applique la migration puis compare VALEUR PAR VALEUR.
# Variables : PGDATABASE (défaut zeeroo_test, imposé par pg_cron), PGUSER.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${PGDATABASE:-zeeroo_test}"; LAST=20261029120000
scripts/localdb/install_fake_pg_net.sh
ADMIN="psql -v ON_ERROR_STOP=1 -q -d postgres"
$ADMIN -c "drop database if exists $DB with (force)" -c "create database $DB"
export PGDATABASE="$DB"
psql -v ON_ERROR_STOP=1 -q -f scripts/localdb/supabase_shim.sql >/dev/null 2>&1
psql -q -d postgres -c "alter database $DB set search_path to \"\$user\", public, extensions"
for f in supabase/migrations/*.sql; do
  case "$f" in *"${LAST}_"*) continue;; esac
  [ "$(basename "$f" | cut -c1-14)" \> "$LAST" ] && continue
  psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "ÉCHEC migration $f" >&2; exit 1; }
done
psql -v ON_ERROR_STOP=1 -q -f supabase/seed.sql >/dev/null 2>&1
psql -v ON_ERROR_STOP=1 -q <<'SQL'
update public.merchants set legal_name='Samir Food Recette SAS', siret='73282932000074', vat_number='FR32732829320',
  contact_email='contact-recette@example.test', phone='0102030405', payment_link='https://pay.example.test/recette-samir'
where slug='chez-samir';
SQL
before=$(psql -At -c "select md5(string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by id)) from public.merchants")
psql -v ON_ERROR_STOP=1 -q -f supabase/migrations/${LAST}_merchants_private_details.sql >/dev/null 2>&1
after=$(psql -At -c "select md5(string_agg(merchant_id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''),';' order by merchant_id)) from public.merchant_private")
raw=$(psql -At -c "select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link) is not null")
if [ "$before" = "$after" ] && [ "$raw" = 0 ] && [ -n "$before" ]; then echo "OK    recopie sur base peuplée : valeurs identiques, colonnes brutes vidées ($before)"; else echo "ÉCHEC recopie : avant=$before après=$after colonnes brutes non vides=$raw" >&2; exit 1; fi
SQL_CHECK=$(psql -At -c "set role anon; select count(*) from public.merchant_private" 2>&1 || true)
echo "$SQL_CHECK" | grep -q "permission denied" && echo "OK    anonyme : merchant_private refusée" || { echo "ÉCHEC : merchant_private lisible ($SQL_CHECK)" >&2; exit 1; }
