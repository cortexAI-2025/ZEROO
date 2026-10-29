begin;
select plan(33);

-- Seed : Samir (10…01) possède « Chez Samir » (30…01), publié ; Nadia (20…01) est cliente ;
-- Karim (utilisateur 70…01, livreur 80…01) est rattaché au restaurant.
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
delete from public.orders;
insert into auth.users(id,email,email_confirmed_at) values
 ('bb000000-0000-0000-0000-000000000001','sans-commande@example.test',now()),
 ('bb000000-0000-0000-0000-000000000002','admin-merchants@example.test',now()),
 ('bb000000-0000-0000-0000-000000000003','autre-pro@example.test',now());
insert into public.platform_admins(user_id) values('bb000000-0000-0000-0000-000000000002');
insert into public.orders (id, merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents)
values ('bc000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Nadia','placed',500,500);

-- Données administratives du commerce (écrites comme le fait l'app : colonnes de merchants).
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.merchants set legal_name='Samir Food SAS', siret='73282932000074', vat_number='FR32732829320',
   contact_email='contact@chezsamir.fr', phone='0102030405', payment_link='https://pay.example.test/samir'
   where id='30000000-0000-0000-0000-000000000001' $$, 'le propriétaire renseigne ses données administratives');
reset role;

-- 1. Stockage : tout est dans merchant_private, plus rien dans merchants (colonnes brutes).
select is((select siret from public.merchant_private where merchant_id='30000000-0000-0000-0000-000000000001'),'73282932000074','siret stocké dans merchant_private');
select is((select payment_link from public.merchant_private where merchant_id='30000000-0000-0000-0000-000000000001'),'https://pay.example.test/samir','lien de paiement stocké dans merchant_private');
select is((select count(*)::int from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link) is not null),0,'colonnes brutes de merchants vides');
select ok(not has_table_privilege('anon','public.merchant_private','SELECT') and not has_table_privilege('authenticated','public.merchant_private','SELECT'),'merchant_private fermée (aucun SELECT)');

-- 2. Anonyme : ni lecture directe, ni colonnes calculées.
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select count(*) from public.merchant_private$$,'42501',null,'anonyme : merchant_private illisible');
select ok((select count(*) from public.merchants where id='30000000-0000-0000-0000-000000000001')=1,'anonyme : la fiche publiée reste visible');
select is((select siret from public.merchants where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : colonne brute siret = null');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : siret null');
select is((select merchant_vat_number(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : TVA null');
select is((select merchant_legal_name(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : raison sociale null');
select is((select merchant_contact_email(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : e-mail null');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : téléphone null');
select is((select merchant_payment_link(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'anonyme : lien de paiement null');
select is((select has_payment_link(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),true,'anonyme : sait seulement si le paiement par carte existe');
reset role;

-- 3. Client connecté sans commande : rien non plus.
set local role authenticated;
select pg_temp.as_user('bb000000-0000-0000-0000-000000000001');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'client sans commande : téléphone null');
select is((select merchant_payment_link(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'client sans commande : lien de paiement null');
select throws_ok($$select count(*) from public.merchant_private$$,'42501',null,'client : merchant_private illisible');

-- 4. Autre restaurateur : ne voit pas les données d'un concurrent.
select pg_temp.as_user('bb000000-0000-0000-0000-000000000003');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'autre restaurateur : siret null');

-- 5. Client ayant commandé : téléphone et lien de paiement, pas les données légales.
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'0102030405','client ayant commandé : téléphone');
select is((select merchant_payment_link(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'https://pay.example.test/samir','client ayant commandé : lien de paiement');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'client ayant commandé : pas de SIRET');

-- 6. Livreur rattaché : téléphone du restaurant, pas les données légales.
select pg_temp.as_user('70000000-0000-0000-0000-000000000001');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'0102030405','livreur rattaché : téléphone');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'livreur rattaché : pas de SIRET');

-- 7. Propriétaire : tout, y compris après effacement d'une valeur.
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'73282932000074','propriétaire : siret');
select lives_ok($$update public.merchants set phone=null where id='30000000-0000-0000-0000-000000000001'$$,'propriétaire : efface son téléphone');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'téléphone effacé');
select is((select merchant_siret(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'73282932000074','l''effacement d''une colonne ne touche pas les autres');
select throws_ok($$update public.merchants set siret='12345678901234' where id='30000000-0000-0000-0000-000000000001'$$,'23514',null,'SIRET invalide refusé');

-- 8. Administrateur.
select pg_temp.as_user('bb000000-0000-0000-0000-000000000002');
select is((select merchant_vat_number(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'FR32732829320','administrateur : TVA');
reset role;

-- 9. Le lien de paiement garde son rôle d'encaissement (publication) ; projection publique sans donnée sensible.
select ok(public.is_payments_ready((select m from public.merchants m where id='30000000-0000-0000-0000-000000000001')),'encaissement configuré lu dans merchant_private');
select is((select count(*)::int from information_schema.columns where table_schema='public' and table_name='public_merchants' and column_name in ('siret','vat_number','legal_name','contact_email','phone','payment_link','owner_id','marketing_consent','admin_status')),0,'public_merchants : aucune colonne sensible');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.public_merchants where slug=(select slug from public.merchants where id='30000000-0000-0000-0000-000000000001')),1,'anonyme : public_merchants liste le commerce publié');
reset role;

select * from finish();
rollback;
