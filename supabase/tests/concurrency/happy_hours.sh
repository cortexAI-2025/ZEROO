#!/usr/bin/env bash
# Quota d'une Happy Hour sous concurrence réelle (deux sessions SQL simultanées) :
# il reste une seule unité en promotion, deux clients commandent en même temps.
# Résultat attendu : une seule unité vendue au prix promotionnel, le quota n'est jamais dépassé.
# Prérequis : base migrée et amorcée (scripts/localdb/run.sh) ; les données créées sont validées
# (hors transaction) : à lancer sur une base jetable. Variables libpq (PGDATABASE, PGUSER, PGHOST).
set -euo pipefail
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A"
SAMIR=30000000-0000-0000-0000-000000000001
NADIA=20000000-0000-0000-0000-000000000001
KEBAB=50000000-0000-0000-0000-000000000003
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

$PSQL <<SQL >/dev/null
-- Chez Samir ouvert en permanence, une offre « -20 % » en vigueur, limitée à 3 unités dont 2 déjà vendues.
delete from public.merchant_opening_hours where merchant_id = '$SAMIR';
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '$SAMIR', d, '00:00', '23:59' from generate_series(1, 7) d;
delete from public.happy_hours where name = 'Dernière unité';
update public.happy_hours set is_active = false;
with o as (
  insert into public.happy_hours (merchant_id, name, discount_type, percent_off, quantity_limit, quantity_used)
  values ('$SAMIR', 'Dernière unité', 'percent', 20, 3, 2) returning id
), s as (
  insert into public.happy_hour_slots (happy_hour_id, merchant_id, weekday, starts_at, ends_at)
  select o.id, '$SAMIR', d, ((now() at time zone 'Europe/Paris')::time - interval '1 hour')::time,
         ((now() at time zone 'Europe/Paris')::time + interval '1 hour')::time
  from o, generate_series(1, 7) d
)
insert into public.happy_hour_items (happy_hour_id, merchant_id, item_id) select id, '$SAMIR', '$KEBAB' from o;
SQL

# Une commande d'un kebab (la fonction renvoie le prix unitaire appliqué).
$PSQL <<SQL >/dev/null
create or replace function public.__conc_hh_order() returns text language plpgsql as \$\$
declare v_id uuid;
begin
  select id into v_id from public.create_order('$NADIA', '$SAMIR',
    jsonb_build_array(jsonb_build_object('item_id', '$KEBAB', 'quantity', 1,
      'option_ids', (select jsonb_agg(id) from public.menu_options
                     where group_id = '60000000-0000-0000-0000-000000000003' and name = 'Blanche'))));
  return 'PRICE:' || (select string_agg(unit_price_cents::text, ',') from public.order_items where order_id = v_id);
end \$\$;
SQL

# La transaction reste ouverte $1 secondes avant de valider (le verrou de l'offre est tenu).
order() { # <pause> <fichier-résultat>
  $PSQL > "$2" 2>&1 <<SQL || true
begin;
select public.__conc_hh_order();
select pg_sleep($1);
commit;
SQL
}

fail=0
check() { # <description> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (attendu : $2 ; obtenu : $3)"; fail=1; fi
}

echo "Concurrence : dernière unité d'une Happy Hour"
order 2 "$tmp/a" &
sleep 0.7
order 0 "$tmp/b" &
wait
prices="$(cat "$tmp/a" "$tmp/b" | grep -o 'PRICE:[0-9]*' | sort | tr '\n' ' ' || true)"
check "une unité à 6,00 € et l'autre au tarif habituel de 7,50 €" "PRICE:600 PRICE:750 " "$prices"
check "le quota n'est pas dépassé" "3" "$($PSQL -c "select quantity_used from public.happy_hours where name = 'Dernière unité'")"
exit $fail
