-- Données FICTIVES complémentaires pour la recette de la PR #60 (migration 20261029120000).
-- À exécuter UNIQUEMENT sur le projet Supabase de recette, après supabase/seed.sql (comptes Samir / Nadia / Karim).
-- Ne jamais exécuter en production. Mot de passe de tous les comptes : motdepasse1.
--
-- Personas
--   commercant@zeroo.test   propriétaire de « Chez Samir » (publié)           [seed.sql]
--   client@zeroo.test       a commandé chez Chez Samir                         [seed.sql]
--   livreur@zeroo.test      livreur rattaché à Chez Samir                      [seed.sql]
--   client2@zeroo.test      client SANS commande
--   commercant2@zeroo.test  autre restaurateur, propriétaire d'un commerce NON publié
--   admin@zeroo.test        administrateur de la plateforme
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, phone, phone_confirmed_at)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
  extensions.crypt('motdepasse1', extensions.gen_salt('bf')), now(),
  '{"provider": "email", "providers": ["email"]}',
  jsonb_build_object('full_name', v.nom, 'signup_profile_version', 1, 'first_name', v.nom, 'last_name', 'Recette',
    'address_line', '1 rue de la Recette', 'postal_code', '75002', 'city', 'Paris', 'contact_phone', v.tel),
  now(), now(), '', '', '', '', v.tel, now()
from (values
  ('21000000-0000-0000-0000-000000000001'::uuid, 'client2@zeroo.test', 'Client2', '+33600000021'),
  ('11000000-0000-0000-0000-000000000001'::uuid, 'commercant2@zeroo.test', 'Pro2', '+33600000011'),
  ('91000000-0000-0000-0000-000000000001'::uuid, 'admin@zeroo.test', 'Admin', '+33600000091')
) as v(id, email, nom, tel);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where email in ('client2@zeroo.test', 'commercant2@zeroo.test', 'admin@zeroo.test');

insert into public.platform_admins (user_id) values ('91000000-0000-0000-0000-000000000001');

-- Données administratives et de contact de « Chez Samir » (fictives), numéro public NON autorisé au départ.
update public.merchants set
  legal_name = 'Samir Food Recette SAS', siret = '73282932000074', vat_number = 'FR32732829320',
  contact_email = 'contact-recette@example.test', phone = '0102030405',
  payment_link = 'https://pay.example.test/recette-samir'
where id = '30000000-0000-0000-0000-000000000001';
-- Numéro professionnel public (colonnes ajoutées par la migration) : posé seulement si elles existent,
-- pour que ce seed serve aussi bien AVANT qu'APRÈS la migration. Non autorisé au départ.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'merchants' and column_name = 'public_phone') then
    execute $q$update public.merchants set public_phone = '0144556677', public_phone_authorized = false where id = '30000000-0000-0000-0000-000000000001'$q$;
  end if;
end $$;

-- Un second commerce, NON publié, avec ses propres données privées (ne doit être visible de personne d'autre).
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude,
                              is_published, legal_name, siret, vat_number, contact_email, phone, payment_link)
values ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'recette-non-publie',
        'Recette Non Publié', 'restaurant', '2 rue de la Recette', '75002', 'Paris', 48.866, 2.346, false,
        'Recette Brouillon SARL', '12345678200010', 'FR12123456782', 'brouillon-recette@example.test',
        '0199887766', 'https://pay.example.test/recette-brouillon');

-- Une commande de Nadia chez Chez Samir (si le seed n'en a pas), pour le persona « client ayant commandé ».
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents)
select 'a1000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000001', 'Nadia', 'placed', 500, 500
where not exists (select 1 from public.orders where customer_id = '20000000-0000-0000-0000-000000000001'
                  and merchant_id = '30000000-0000-0000-0000-000000000001');
commit;
