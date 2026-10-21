#!/usr/bin/env bash
# Stock d'un panier anti-gaspi sous concurrence réelle (deux sessions SQL simultanées) :
# il reste un seul panier, deux clients le réservent en même temps.
# Résultat attendu : une seule réservation aboutit, l'autre reçoit « basket_sold_out » ; le stock n'est
# jamais dépassé. Prérequis : base migrée et amorcée (scripts/localdb/run.sh), base jetable.
set -euo pipefail
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A"
SAMIR=30000000-0000-0000-0000-000000000001
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

$PSQL <<SQL >/dev/null
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-0000000000b1', 'conc-b1@test.fr'),
  ('20000000-0000-0000-0000-0000000000b2', 'conc-b2@test.fr') on conflict do nothing;
delete from public.surprise_baskets where title = 'Dernier panier';
insert into public.surprise_baskets (id, merchant_id, title, price_cents, quantity_total, allergens, allergens_confirmed,
                                     pickup_starts_at, pickup_ends_at)
values ('f1000000-0000-0000-0000-000000000001', '$SAMIR', 'Dernier panier', 399, 1, '{}', true,
        now() + interval '1 hour', now() + interval '3 hours');
SQL

reserve() { # <client> <pause> <fichier-résultat>
  $PSQL > "$3" 2>&1 <<SQL || true
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true);
select 'RESERVED' from public.reserve_basket('f1000000-0000-0000-0000-000000000001', 1);
select pg_sleep($2);
commit;
SQL
}

fail=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (attendu : $2 ; obtenu : $3)"; fail=1; fi; }

echo "Concurrence : dernier panier anti-gaspi"
reserve 20000000-0000-0000-0000-0000000000b1 2 "$tmp/a" &
sleep 0.7
reserve 20000000-0000-0000-0000-0000000000b2 0 "$tmp/b" &
wait
outcomes="$(cat "$tmp/a" "$tmp/b" | grep -oE 'RESERVED|basket_sold_out' | sort | tr '\n' ' ' || true)"
check "une seule réservation aboutit, l'autre trouve le panier épuisé" "RESERVED basket_sold_out " "$outcomes"
check "le stock n'est pas dépassé" "1" "$($PSQL -c "select quantity_reserved from public.surprise_baskets where title = 'Dernier panier'")"
check "une seule réservation active" "1" "$($PSQL -c "select count(*) from public.basket_reservations where basket_id = 'f1000000-0000-0000-0000-000000000001' and status = 'reserved'")"
exit $fail
