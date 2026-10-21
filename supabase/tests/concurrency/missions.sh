#!/usr/bin/env bash
# Concurrence réelle (deux sessions SQL simultanées) sur la prise en charge des missions.
#  1. Deux livreurs acceptent la même course au même moment : un seul l'obtient.
#  2. Un même livreur, à une course de sa capacité, en accepte deux au même moment : une seule passe.
# Prérequis : base déjà migrée et amorcée (scripts/localdb/run.sh). Les données créées sont validées
# (hors transaction) : à lancer sur une base jetable. Variables libpq (PGDATABASE, PGUSER, PGHOST).
set -euo pipefail
PSQL="psql -v ON_ERROR_STOP=1 -q -t -A"
SAMIR=30000000-0000-0000-0000-000000000001
NADIA=20000000-0000-0000-0000-000000000001
OWNER=10000000-0000-0000-0000-000000000001
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT

$PSQL <<SQL >/dev/null
-- Livreurs de test : abonnement actif, lien de paiement, rattachés à Chez Samir, en ligne.
do \$\$
declare
  v_user uuid; v_id uuid; n int := 0; siret text;
begin
  foreach siret in array array['73282932000074', '12345678000006', '99887766000006'] loop
    n := n + 1;
    v_user := ('7000000' || n || '-0000-0000-0000-00000000c00' || n)::uuid;
    v_id := ('8000000' || n || '-0000-0000-0000-00000000c00' || n)::uuid;
    insert into auth.users (id, email, email_confirmed_at, phone, phone_confirmed_at)
    values (v_user, 'conc' || n || '@test.fr', now(), '336000000' || n, now()) on conflict do nothing;
    insert into public.couriers (id, user_id, display_name, phone, legal_status, siret, vehicle, payment_link, is_available)
    values (v_id, v_user, 'Livreur ' || n, '06 00 00 00 0' || n, 'auto_entrepreneur', siret, 'scooter',
            'https://paypal.me/conc' || n, true);
    update public.couriers set available_until = now() + interval '1 day' where id = v_id;
    insert into public.courier_subscriptions (courier_id, stripe_customer_id, stripe_subscription_id, status, trial_end, trial_used, plan)
    values (v_id, 'cus_conc' || n, 'sub_conc' || n, 'trialing', now() + interval '30 days', true, 'pro');
    insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
    values ('$SAMIR', v_id, 'approved', now());
  end loop;
  -- Chez Samir ouvert en permanence.
  delete from public.merchant_opening_hours where merchant_id = '$SAMIR';
  insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
  select '$SAMIR', d, '00:00', '23:59' from generate_series(1, 7) d;
  -- Karim (seed) ne participe pas : hors ligne.
  update public.couriers set is_available = false where id = '80000000-0000-0000-0000-000000000001';
end \$\$;
SQL

# Crée une livraison acceptée par le restaurant et renvoie son identifiant.
$PSQL <<SQL >/dev/null
create or replace function public.__conc_mission() returns uuid language plpgsql as \$\$
declare v_id uuid;
begin
  select id into v_id from public.create_order('$NADIA', '$SAMIR',
    jsonb_build_array(jsonb_build_object('item_id', '50000000-0000-0000-0000-000000000003', 'quantity', 1,
      'option_ids', (select jsonb_agg(id) from public.menu_options
                     where group_id = '60000000-0000-0000-0000-000000000003' and name = 'Blanche'))),
    null,
    jsonb_build_object('address_line', '5 rue Saint-Augustin', 'postal_code', '75002', 'city', 'Paris',
                       'latitude', 48.87, 'longitude', 2.34, 'phone', '06 98 76 54 32'),
    'card', 'card');
  perform public.mark_order_authorized(v_id, 'pi_conc_' || gen_random_uuid());
  perform public.apply_order_transition(v_id, '$OWNER', 'accepted', 10);
  return v_id;
end \$\$;
SQL
new_mission() { $PSQL -c "select public.__conc_mission()"; }

# Une session « livreur » : accepte la course, garde sa transaction ouverte $3 secondes, puis valide.
accept() { # <utilisateur> <commande> <pause> <fichier-résultat>
  $PSQL > "$4" 2>&1 <<SQL || true
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true);
select 'ACCEPTED' from public.courier_accept_mission('$2');
select pg_sleep($3);
commit;
SQL
}
outcome() { grep -ohE "ACCEPTED|mission_unavailable|courier_at_capacity|courier_unavailable" "$1" | head -1; }

fail=0
check() { # <description> <attendu> <obtenu>
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FAIL $1 (attendu : $2 ; obtenu : $3)"; fail=1; fi
}

echo "Concurrence : même course, deux livreurs"
M=$(new_mission)
accept 70000001-0000-0000-0000-00000000c001 "$M" 2 "$tmp/a" &
sleep 0.7
accept 70000002-0000-0000-0000-00000000c002 "$M" 0 "$tmp/b" &
wait
results="$(printf '%s\n%s\n' "$(outcome "$tmp/a")" "$(outcome "$tmp/b")" | sort | tr '\n' ' ')"
check "un seul livreur obtient la course" "ACCEPTED mission_unavailable " "$results"
check "la course a un seul livreur" "1" "$($PSQL -c "select count(distinct courier_id) from public.orders where id = '$M' and courier_id is not null")"

echo "Concurrence : même livreur, capacité"
Z=80000003-0000-0000-0000-00000000c003
ZU=70000003-0000-0000-0000-00000000c003
FIRST=$(new_mission)
$PSQL -c "update public.orders set courier_id = '$Z', courier_name = 'Livreur 3', courier_accepted_at = now() where id = '$FIRST'" >/dev/null
M1=$(new_mission); M2=$(new_mission)
accept "$ZU" "$M1" 2 "$tmp/c" &
sleep 0.7
accept "$ZU" "$M2" 0 "$tmp/d" &
wait
results="$(printf '%s\n%s\n' "$(outcome "$tmp/c")" "$(outcome "$tmp/d")" | sort | tr '\n' ' ')"
check "une seule des deux courses passe" "ACCEPTED courier_at_capacity " "$results"
check "le livreur n'a jamais plus de 2 livraisons" "2" "$($PSQL -c "select public.courier_active_count('$Z')")"

exit $fail
