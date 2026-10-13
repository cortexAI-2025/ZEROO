-- Données de démonstration, chargées par `npm run db:reset` (jamais en production).
--
-- Comptes (mot de passe : motdepasse1)
--   commercant@zeroo.test : propriétaire du snack « Chez Samir »
--   client@zeroo.test     : client
--   livreur@zeroo.test    : livreur indépendant rattaché à « Chez Samir »
-- Le commerçant et le livreur ont un téléphone vérifié (obligatoire pour les professionnels).

-- -----------------------------------------------------------------------------
-- Comptes
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone, phone_confirmed_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'commercant@zeroo.test', extensions.crypt('motdepasse1', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Samir"}', now(), now(), '', '', '', '', '33612345601', now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'client@zeroo.test', extensions.crypt('motdepasse1', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Nadia"}', now(), now(), '', '', '', '', null, null),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'livreur@zeroo.test', extensions.crypt('motdepasse1', extensions.gen_salt('bf')), now(),
   '{"provider": "email", "providers": ["email"]}', '{"full_name": "Karim"}', now(), now(), '', '', '', '', '33612345603', now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users
where email in ('commercant@zeroo.test', 'client@zeroo.test', 'livreur@zeroo.test');

-- -----------------------------------------------------------------------------
-- Commerce de démonstration
-- -----------------------------------------------------------------------------
insert into public.merchants (
  id, owner_id, slug, name, description, category, phone,
  address_line, postal_code, city, latitude, longitude, default_prep_minutes, is_published
)
values (
  '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'chez-samir',
  'Chez Samir', 'Tacos, sandwichs et assiettes maison.', 'snack', '01 23 45 67 89',
  '12 rue de la Paix', '75002', 'Paris', 48.8686, 2.3314, 12, true
);

-- Paiements et abonnement simulés : en local, le commerce de démo peut encaisser
-- sans passer par l'inscription Stripe (les vrais comptes arrivent par webhook).
insert into public.merchant_stripe_accounts (merchant_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
values ('30000000-0000-0000-0000-000000000001', 'acct_demo_chez_samir', true, true, true);

insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, trial_end, trial_used, plan)
values ('30000000-0000-0000-0000-000000000001', 'cus_demo_chez_samir', 'sub_demo_chez_samir', 'trialing',
        now() + interval '30 days', true, 'pro');

-- Ouvert tous les jours de 6 h à 2 h du matin, pour pouvoir tester à toute heure.
insert into public.merchant_opening_hours (merchant_id, weekday, opens_at, closes_at)
select '30000000-0000-0000-0000-000000000001', d, '06:00', '02:00'
from generate_series(1, 7) as d;

insert into public.menu_categories (id, merchant_id, name, position) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Menus', 0),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Sandwichs', 1),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Boissons', 2);

insert into public.menu_items (id, merchant_id, category_id, name, description, price_cents, is_loyalty_menu, position) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Menu Tacos', 'Tacos 2 viandes, frites et boisson', 1050, true, 0),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'Menu Américain', 'Américain, frites et boisson', 950, true, 1),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002',
   'Kebab', 'Pain maison, salade, tomates, oignons', 750, false, 0),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003',
   'Canette 33 cl', null, 150, false, 0);

insert into public.menu_option_groups (id, merchant_id, item_id, name, min_select, max_select, position) values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Sauce', 1, 2, 0),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   'Suppléments', 0, 3, 1),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003',
   'Sauce', 1, 1, 0);

insert into public.menu_options (merchant_id, group_id, name, price_delta_cents, position) values
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Algérienne', 0, 0),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Samouraï', 0, 1),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Blanche', 0, 2),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Cheddar', 100, 0),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'Viande en plus', 250, 1),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'Blanche', 0, 0),
  ('30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'Harissa', 0, 1);

-- Carte de fidélité de Nadia : 7 menus sur 9, et un menu offert déjà disponible.
insert into public.loyalty_cards (user_id, merchant_id, paid_menus_count, rewards_available)
values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 7, 1);

-- -----------------------------------------------------------------------------
-- Livraison : Chez Samir livre à 3 km pour 3,50 €, avec le livreur de démo Karim
-- (compte Stripe et abonnement simulés, rattachement accepté, disponible).
-- -----------------------------------------------------------------------------
update public.merchants
set delivery_enabled = true, delivery_fee_cents = 350, delivery_radius_m = 3000,
    legal_name = 'Samir Food SAS', siret = '73282932000074', vat_number = 'FR32732829320',
    contact_email = 'contact@chezsamir.test', payment_link = 'https://pay.sumup.com/b2c/chez-samir-demo'
where id = '30000000-0000-0000-0000-000000000001';

insert into public.couriers (id, user_id, display_name, phone, legal_status, siret, vehicle, is_available)
values ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Karim L.',
        '06 12 34 56 78', 'auto_entrepreneur', '88212345600015', 'scooter', true);
update public.couriers set work_zone = 'Paris centre', payment_link = 'https://paypal.me/karim-demo'
where id = '80000000-0000-0000-0000-000000000001';

insert into public.courier_stripe_accounts (courier_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
values ('80000000-0000-0000-0000-000000000001', 'acct_demo_karim', true, true, true);

insert into public.courier_subscriptions (courier_id, stripe_customer_id, stripe_subscription_id, status, trial_end, trial_used)
values ('80000000-0000-0000-0000-000000000001', 'cus_demo_karim', 'sub_demo_karim', 'trialing',
        now() + interval '30 days', true);

insert into public.merchant_couriers (merchant_id, courier_id, status, decided_at)
values ('30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'approved', now());

-- -----------------------------------------------------------------------------
-- Générateur de commandes de test : `npm run dev:order`
-- Simule une commande payée par le client de démo, en attendant le parcours
-- client (étape c) et le paiement (étape d).
-- -----------------------------------------------------------------------------
create or replace function public.dev_place_test_order(p_slug text default 'chez-samir')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_item record;
  v_options jsonb;
  v_unit int;
  v_qty int;
  v_subtotal int := 0;
  v_code text;
begin
  select id into v_merchant_id from public.merchants where slug = p_slug;
  if v_merchant_id is null then
    raise exception 'commerce introuvable : %', p_slug;
  end if;

  insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents, placed_at,
                             customer_note)
  values (v_order_id, v_merchant_id, '20000000-0000-0000-0000-000000000001', 'Nadia', 'placed', 0, 0, now(),
          (array[null, null, 'Sans oignons svp', 'Bien cuit'])[1 + floor(random() * 4)::int])
  returning pickup_code into v_code;

  for v_item in
    select * from public.menu_items
    where merchant_id = v_merchant_id and is_available
    order by random()
    limit 1 + floor(random() * 3)::int
  loop
    -- Une option au hasard dans chaque groupe obligatoire.
    select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'name', o.name, 'price_delta_cents', o.price_delta_cents)), '[]')
    into v_options
    from public.menu_option_groups g
    cross join lateral (
      select * from public.menu_options o where o.group_id = g.id and o.is_available order by random() limit 1
    ) o
    where g.item_id = v_item.id and g.min_select > 0;

    v_unit := v_item.price_cents + coalesce((select sum((x ->> 'price_delta_cents')::int) from jsonb_array_elements(v_options) x), 0);
    v_qty := 1 + floor(random() * 2)::int;
    v_subtotal := v_subtotal + v_unit * v_qty;

    insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options, line_total_cents,
                                    is_loyalty_menu)
    values (v_order_id, v_item.id, v_item.name, v_unit, v_qty, v_options, v_unit * v_qty, v_item.is_loyalty_menu);
  end loop;

  update public.orders set subtotal_cents = v_subtotal, total_cents = v_subtotal where id = v_order_id;
  return format('Commande %s (%s €) envoyée à %s', v_code, to_char(v_subtotal / 100.0, 'FM990D00'), p_slug);
end;
$$;

revoke execute on function public.dev_place_test_order from public, anon, authenticated;
