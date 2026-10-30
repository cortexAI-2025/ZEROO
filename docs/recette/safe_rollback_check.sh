#!/usr/bin/env bash
# Vérifie le retour arrière « sûr » sur une base locale : après lui, un visiteur anonyme ne voit AUCUNE ligne de
# merchants (donc aucune donnée privée restaurée), les valeurs sont restaurées à l'identique, la republication exige
# un ordre explicite. Prérequis : PGUSER=postgres ; recrée la base zeeroo_test (migrations + seed + données fictives).
set -uo pipefail
cd "$(dirname "$0")/../.."
export PGDATABASE="${PGDATABASE:-zeeroo_test}"; fail=0
ok() { echo "OK    $1"; }; ko() { echo "ÉCHEC $1"; fail=1; }
PGUSER=${PGUSER:-postgres} scripts/localdb/run.sh supabase/tests/database/profiles.test.sql >/dev/null 2>&1
psql -X -q -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" 
psql -X -q -v ON_ERROR_STOP=1 -f docs/recette/merchants_recette_extra.sql
psql -X -q -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261029120000','x') on conflict do nothing"
FP="select md5(string_agg(merchant_id::text||coalesce(legal_name,'')||coalesce(siret,'')||coalesce(vat_number,'')||coalesce(contact_email,'')||coalesce(phone,'')||coalesce(payment_link,''),';' order by merchant_id)) from public.merchant_private"
# --- Matrice de visibilité par profil : état d'ORIGINE (modèle d'avant la migration) puis après le retour arrière SÛR
matrix() { # -> une ligne par profil : nom|lignes visibles|lignes avec champ administratif|lignes avec téléphone/lien
  while IFS='~' read -r name uid; do
    if [ -z "$uid" ]; then role=anon; claims='{"role":"anon"}'; else role=authenticated; claims="{\"sub\":\"$uid\",\"role\":\"authenticated\"}"; fi
    r=$(psql -X -At -F'|' -q -c "begin; set local role $role; select set_config('request.jwt.claims','$claims',true); select count(*), count(*) filter (where coalesce(legal_name,siret,vat_number,contact_email) is not null), count(*) filter (where coalesce(phone,payment_link) is not null) from public.merchants; rollback;" | tail -1)
    echo "$name|$r"
  done <<'P'
anonyme~
client_sans_commande~21000000-0000-0000-0000-000000000001
autre_restaurateur~11000000-0000-0000-0000-000000000001
client_ayant_commande~20000000-0000-0000-0000-000000000001
livreur_rattache~70000000-0000-0000-0000-000000000001
proprietaire~10000000-0000-0000-0000-000000000001
administrateur~91000000-0000-0000-0000-000000000001
P
}
psql -X -q -c "insert into supabase_migrations.schema_migrations(version,name) values ('20261029120000','x') on conflict do nothing" >/dev/null 2>&1
PGOPTIONS="-c zeeroo.confirm_rollback=merchants_private_raw" psql -X -q -v ON_ERROR_STOP=1 -f docs/production/merchants_private_ROLLBACK.sql >/dev/null 2>&1 && ok "état d'origine reconstitué (retour arrière brut) pour la comparaison" || ko "retour arrière brut en échec"
M0=$(matrix); echo "$M0" | sed 's/^/  origine  : /'
psql -X -q -v ON_ERROR_STOP=1 -f docs/production/merchants_private_production.sql >/dev/null 2>&1 && ok "migration réappliquée" || ko "réapplication en échec"
BEFORE=$(psql -X -At -c "$FP"); PUB_BEFORE=$(psql -X -At -c "select count(*) from public.merchants where is_published")
[ "$PUB_BEFORE" -ge 1 ] && ok "départ : $PUB_BEFORE commerce(s) publié(s)" || ko "aucun commerce publié au départ"
PGOPTIONS="-c zeeroo.confirm_rollback=merchants_private_safe" psql -X -q -v ON_ERROR_STOP=1 -f docs/production/merchants_private_ROLLBACK_SAFE.sql >/tmp/safe-rb.log 2>&1 && ok "retour arrière sûr appliqué" || { ko "retour arrière sûr en échec"; tail -3 /tmp/safe-rb.log; }
RAW=$(psql -X -At -c "select md5(string_agg(id::text||coalesce(legal_name,'')||coalesce(siret,'')||coalesce(vat_number,'')||coalesce(contact_email,'')||coalesce(phone,'')||coalesce(payment_link,''),';' order by id)) from public.merchants")
[ "$BEFORE" = "$RAW" ] && ok "valeurs restaurées dans merchants à l'identique" || ko "valeurs différentes après retour arrière"
Q() { psql -X -At -q -c "begin; set local role $1; select set_config('request.jwt.claims','$2',true); $3; rollback;" | tail -1; }
[ "$(Q anon '{"role":"anon"}' 'select count(*) from public.merchants')" = 0 ] && ok "anonyme : 0 ligne de merchants (aucune donnée restaurée n'est visible)" || ko "anonyme voit des lignes de merchants"
[ "$(Q anon '{"role":"anon"}' 'select count(*) from public.merchants where siret is not null or phone is not null or payment_link is not null')" = 0 ] && ok "anonyme : aucun SIRET / téléphone / lien lisible" || ko "fuite pour l'anonyme"
[ "$(Q authenticated '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}' 'select count(*) from public.merchants')" = 0 ] && ok "client sans commande : 0 ligne" || ko "client sans commande voit des lignes"
[ "$(Q authenticated '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}' "select siret from public.merchants where slug='chez-samir'")" = 73282932000074 ] && ok "propriétaire : retrouve ses données" || ko "propriétaire ne retrouve pas ses données"
M1=$(matrix); echo "$M1" | sed 's/^/  après retour arrière sûr : /'
while IFS='|' read -r name rows adm ops; do
  o=$(echo "$M0" | grep "^$name|"); orows=$(echo "$o" | cut -d'|' -f2); oadm=$(echo "$o" | cut -d'|' -f3); oops=$(echo "$o" | cut -d'|' -f4)
  case "$name" in
    anonyme|client_sans_commande) [ "$rows" = 0 ] && [ "$adm" = 0 ] && [ "$ops" = 0 ] && ok "$name : 0 ligne après le retour arrière sûr (avant : $orows)" || ko "$name : $rows ligne(s) visible(s)";;
    *) # profils légitimes : jamais PLUS que dans le modèle d'origine ; ils conservent l'accès à LEURS commerces
       [ "$rows" -le "$orows" ] && [ "$adm" -le "$oadm" ] && [ "$ops" -le "$oops" ] && ok "$name : visibilité ≤ modèle d'origine ($rows ligne(s), champs administratifs : $adm ; origine : $orows / $oadm)" || ko "$name : voit PLUS que le modèle d'origine";;
  esac
done <<< "$M1"
psql -X -q -f docs/production/merchants_private_ROLLBACK_REPUBLISH.sql >/tmp/rep1.log 2>&1; grep -q "Republication refusée" /tmp/rep1.log && ok "republication refusée sans ordre explicite" || ko "republication non protégée"
[ "$(psql -X -At -c "select count(*) from public.merchants where is_published")" = 0 ] && ok "toujours 0 commerce publié après la tentative refusée" || ko "commerce publié sans ordre"
psql -X -q -c "set zeeroo.accept_exposure = 'oui'" -f docs/production/merchants_private_ROLLBACK_REPUBLISH.sql >/tmp/rep2.log 2>&1
psql -X -q <<'SQL' >/tmp/rep3.log 2>&1
set zeeroo.accept_exposure = 'oui';
\i docs/production/merchants_private_ROLLBACK_REPUBLISH.sql
SQL
N=$(psql -X -At -c "select count(*) from public.merchants where is_published"); [ "$N" -ge 1 ] && ok "republication explicite : $N commerce(s) republié(s) (éligibles uniquement)" || ko "republication explicite sans effet ($(tail -2 /tmp/rep3.log | tr '\n' ' '))"
exit $fail
