#!/usr/bin/env bash
# Recette LOCALE de la PR #60 sur une base PEUPLÉE (aucun projet distant, aucune production).
#   PGUSER=postgres scripts/localdb/recette_merchants.sh <dossier-de-preuves>
# Étapes : base + migrations jusqu'à 20261029110000 + seed + données fictives -> empreinte AVANT ->
# script de production -> conservation valeur par valeur -> matrice RLS par persona -> compatibilité
# commandes -> retour arrière -> réapplication (2 cycles) -> empreintes SHA-256.
set -uo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:?dossier de preuves}"; mkdir -p "$OUT"; : > "$OUT/resume.txt"
DB="${PGDATABASE:-zeeroo_test}"; export PGDATABASE="$DB"
LAST=20261029120000
fail=0
say() { echo "$*" | tee -a "$OUT/resume.txt"; }
ok()  { say "OK    $1"; }
ko()  { say "ÉCHEC $1"; fail=1; }
sql() { psql -X -At -F'|' -v ON_ERROR_STOP=1 -q "$@"; }
runfile() { psql -X -q -v ON_ERROR_STOP=1 -f "$1" > "$OUT/$2.log" 2>&1; }
checks() { psql -X -At -F, -f docs/recette/checks.sql; }

scripts/localdb/install_fake_pg_net.sh >/dev/null
psql -X -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
psql -X -v ON_ERROR_STOP=1 -q -f scripts/localdb/supabase_shim.sql >/dev/null 2>&1
psql -X -q -d postgres -c "alter database $DB set search_path to \"\$user\", public, extensions"
for f in supabase/migrations/*.sql; do
  [ "$(basename "$f" | cut -c1-14)" \> "$LAST" ] && continue
  case "$f" in *"${LAST}_"*) continue;; esac
  psql -X -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "ÉCHEC migration $f" >&2; exit 1; }
done
psql -X -q -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" >/dev/null
runfile supabase/seed.sql seed || { ko "seed.sql"; exit 1; }
runfile docs/recette/merchants_recette_extra.sql seed-extra || { ko "données fictives complémentaires"; exit 1; }

FP_B="select string_agg(id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''), E'\n' order by id) from public.merchants"
FP_A="select string_agg(merchant_id::text||'|'||coalesce(legal_name,'')||'|'||coalesce(siret,'')||'|'||coalesce(vat_number,'')||'|'||coalesce(contact_email,'')||'|'||coalesce(phone,'')||'|'||coalesce(payment_link,''), E'\n' order by merchant_id) from public.merchant_private"

say "== 1. État AVANT (base peuplée)"
checks > "$OUT/checks-avant.csv"; say "checks: $(cat "$OUT/checks-avant.csv")"
sql -c "$FP_B" > "$OUT/valeurs-avant.txt"
[ "$(wc -l < "$OUT/valeurs-avant.txt")" -ge 2 ] && ok "base peuplée : $(wc -l < "$OUT/valeurs-avant.txt") commerces avec valeurs administratives" || ko "base non peuplée"
ORD_BEFORE=$(sql -c "select count(*) from public.orders")

say "== 2. Application du script de production (docs/production/merchants_private_production.sql)"
if runfile docs/production/merchants_private_production.sql migration; then ok "script appliqué (transaction validée, contrôles internes passés)"; else ko "script en échec : voir $OUT/migration.log"; tail -3 "$OUT/migration.log" | tee -a "$OUT/resume.txt"; exit 1; fi
checks > "$OUT/checks-apres.csv"; say "checks: $(cat "$OUT/checks-apres.csv")"
sql -c "$FP_A" > "$OUT/valeurs-apres.txt"
if diff -q "$OUT/valeurs-avant.txt" "$OUT/valeurs-apres.txt" >/dev/null; then ok "valeurs privées IDENTIQUES avant/après, valeur par valeur ($(sha256sum "$OUT/valeurs-apres.txt" | cut -c1-16)…)"; else ko "valeurs différentes"; diff "$OUT/valeurs-avant.txt" "$OUT/valeurs-apres.txt" | head -5 | tee -a "$OUT/resume.txt"; fi
[ "$(sql -c "select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link) is not null")" = 0 ] && ok "colonnes brutes de merchants vidées" || ko "colonnes brutes non vidées"
sql -c "update public.merchants set public_phone='0144556677', public_phone_authorized=false where slug='chez-samir'" >/dev/null

say "== 3. Matrice RLS par persona (commerce publié « Chez Samir », commerce non publié, public_merchants)"
S="concat_ws('|',coalesce(merchant_legal_name(m),'-'),coalesce(merchant_siret(m),'-'),coalesce(merchant_vat_number(m),'-'),coalesce(merchant_contact_email(m),'-'),coalesce(merchant_phone(m),'-'),coalesce(merchant_payment_link(m),'-'),coalesce(merchant_public_phone(m),'-'))"
N='-|-|-|-|-|-|-'
ALL='Samir Food Recette SAS|73282932000074|FR32732829320|contact-recette@example.test|0102030405|https://pay.example.test/recette-samir|0144556677'
CONTACT='-|-|-|-|0102030405|https://pay.example.test/recette-samir|-'
# persona~uuid~attendu_samir~merch_np~pub_np
declare_personas() { cat <<P
anon~~$N~0~0
client2~21000000-0000-0000-0000-000000000001~$N~0~0
commercant2~11000000-0000-0000-0000-000000000001~$N~1~0
client~20000000-0000-0000-0000-000000000001~$CONTACT~0~0
livreur~70000000-0000-0000-0000-000000000001~$CONTACT~0~0
commercant~10000000-0000-0000-0000-000000000001~$ALL~0~0
admin~91000000-0000-0000-0000-000000000001~$ALL~1~0
P
}
while IFS='~' read -r name uid want np pn; do
  [ -z "$name" ] && continue
  if [ -z "$uid" ]; then role=anon; claims='{"role":"anon"}'; else role=authenticated; claims="{\"sub\":\"$uid\",\"role\":\"authenticated\"}"; fi
  q="begin; set local role $role; select set_config('request.jwt.claims','$claims',true); select (select $S from public.merchants m where slug='chez-samir') || ':' || (select count(*) from public.merchants where slug='recette-non-publie') || ':' || (select count(*) from public.public_merchants where slug='recette-non-publie') || ':' || (select count(*) from public.public_merchants where slug='chez-samir'); rollback;"
  got=$(psql -X -At -F'|' -q -c "$q" | tail -1)
  # got = valeurs:np:pn:pub_samir ; pub_samir doit valoir 1 (lecture autorisée qui fonctionne)
  [ "$got" = "$want:$np:$pn:1" ] && ok "persona $name : valeurs, commerce non publié ($np), public_merchants lisible (1 ligne)" || ko "persona $name : obtenu « $got » attendu « $want:$np:$pn:1 »"
done < <(declare_personas)
# colonnes brutes : jamais de valeur, pour aucun rôle
for r in anon authenticated; do
  q="begin; set local role $r; select set_config('request.jwt.claims','{\"sub\":\"10000000-0000-0000-0000-000000000001\",\"role\":\"$r\"}',true); select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link,public_phone) is not null; rollback;"
  n=$(psql -X -At -q -c "$q" | tail -1)
  [ "$n" = 0 ] && ok "rôle $r : colonnes brutes sans valeur" || ko "rôle $r : $n ligne(s) avec valeur brute"
  for t in merchant_private directory_businesses directory_claims; do
    e=$(psql -X -At -q -c "begin; set local role $r; select count(*) from public.$t; rollback;" 2>&1 | grep -c "permission denied")
    [ "$e" -ge 1 ] && ok "rôle $r : $t refusée" || ko "rôle $r : $t lisible"
  done
done

say "== 4. Commandes (couche base de données)"
sql -c "select public.dev_place_test_order('chez-samir')" >/dev/null 2>"$OUT/commande.err" && ok "création d'une commande de test sur le commerce publié" || { ko "création de commande"; head -2 "$OUT/commande.err" | tee -a "$OUT/resume.txt"; }
q="begin; set local role authenticated; select set_config('request.jwt.claims','{\"sub\":\"20000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}',true); select coalesce(merchant_phone(m),'-')||'|'||coalesce(merchant_payment_link(m),'-')||'|'||has_payment_link(m)||'|'||is_payments_ready(m) from public.orders o join public.merchants m on m.id=o.merchant_id where o.customer_id='20000000-0000-0000-0000-000000000001' limit 1; rollback;"
got=$(psql -X -At -q -c "$q" | tail -1)
[ "$got" = "0102030405|https://pay.example.test/recette-samir|true|true" ] && ok "page commande du client : téléphone + lien de paiement via le commerce lié à sa commande" || ko "page commande : « $got »"
[ "$(sql -c "select count(*) from public.orders")" -gt "$ORD_BEFORE" ] && ok "commandes avant $ORD_BEFORE -> après $(sql -c "select count(*) from public.orders") (aucune perdue)" || ko "décompte des commandes"
# order_modes compte les commerces du seed (fixture) : il tourne dans la suite complète sur base propre.
for t in dashboards merchants_private merchants_private_security client_ordering plans delivery publication_guard; do
  r=$(psql -X -At -q -f supabase/tests/database/$t.test.sql 2>&1)
  if echo "$r" | grep -qE "^not ok|Looks like|ERROR:"; then ko "pgTAP $t"; echo "$r" > "$OUT/pgtap-$t.log"; echo "$r" | grep -E "^not ok|ERROR|#" | head -6 | tee -a "$OUT/resume.txt"; else ok "pgTAP $t ($(echo "$r" | grep -c '^ok') contrôles)"; fi
done

cycle() { # n
  say "== $1. Retour arrière puis réapplication (cycle $2)"
  psql -X -q -c "insert into supabase_migrations.schema_migrations(version,name) values ('$LAST','x') on conflict do nothing" >/dev/null 2>&1
  runfile docs/production/merchants_private_ROLLBACK.sql rollback-$2 && ok "retour arrière appliqué" || { ko "retour arrière en échec"; return; }
  checks > "$OUT/checks-rollback-$2.csv"; say "checks: $(cat "$OUT/checks-rollback-$2.csv")"
  sql -c "$FP_B" > "$OUT/valeurs-rollback-$2.txt"
  diff -q "$OUT/valeurs-avant.txt" "$OUT/valeurs-rollback-$2.txt" >/dev/null && ok "après retour arrière : colonnes brutes IDENTIQUES à l'état d'origine" || ko "retour arrière : valeurs différentes"
  [ "$(sql -c "select to_regclass('public.merchant_private') is null")" = t ] && ok "merchant_private supprimée" || ko "merchant_private encore présente"
  runfile docs/production/merchants_private_production.sql reapply-$2 && ok "réapplication validée" || { ko "réapplication en échec"; return; }
  sql -c "$FP_A" > "$OUT/valeurs-reapply-$2.txt"
  diff -q "$OUT/valeurs-avant.txt" "$OUT/valeurs-reapply-$2.txt" >/dev/null && ok "après réapplication : valeurs privées IDENTIQUES" || ko "réapplication : valeurs différentes"
  checks > "$OUT/checks-reapply-$2.csv"
  [ "$(cut -d, -f1-6,8- "$OUT/checks-apres.csv")" = "$(cut -d, -f1-6,8- "$OUT/checks-reapply-$2.csv")" ] && ok "état structurel identique à celui de la première application" || ko "état structurel différent"
}
cycle 5 1; cycle 6 2

say "== 7. Empreintes SHA-256"
sha256sum docs/production/merchants_private_production.sql docs/production/merchants_private_ROLLBACK.sql supabase/migrations/${LAST}_merchants_private_details.sql docs/recette/merchants_recette_extra.sql docs/recette/checks.sql scripts/localdb/recette_merchants.sh | tee -a "$OUT/resume.txt"
say "== Verdict recette locale : $([ $fail = 0 ] && echo 'CONFORME (aucun échec)' || echo 'ÉCHECS — voir ci-dessus')"
exit $fail
