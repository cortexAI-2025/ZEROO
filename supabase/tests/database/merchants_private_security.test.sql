begin;
select plan(34);

-- Revue des fonctions privilégiées, droits EXECUTE, search_path et écritures sur merchant_private.
-- Seed : Samir (10…01) possède « Chez Samir » (30…01), publié ; Nadia (20…01) est cliente.
create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
insert into auth.users(id,email,email_confirmed_at) values ('bb000000-0000-0000-0000-000000000003','autre-pro@example.test',now());

-- 1. Chaque fonction ajoutée est SECURITY DEFINER avec search_path vide.
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in ('route_merchant_private','can_see_merchant_private','merchant_legal_name','merchant_siret','merchant_vat_number','merchant_contact_email','merchant_phone','merchant_public_phone','merchant_payment_link','has_payment_link')
  and p.prosecdef and 'search_path=""' = any(p.proconfig)),10,'10 fonctions : SECURITY DEFINER + search_path vide');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='is_payments_ready' and p.prosecdef and 'search_path=""' = any(p.proconfig)),1,'is_payments_ready : SECURITY DEFINER + search_path vide');

-- 2. Droits EXECUTE : les fonctions internes ne sont pas appelables par l'API.
select ok(not has_function_privilege('anon','public.can_see_merchant_private(uuid,boolean)','EXECUTE') and not has_function_privilege('authenticated','public.can_see_merchant_private(uuid,boolean)','EXECUTE'),'can_see_merchant_private : pas d''EXECUTE pour l''API');
select ok(not has_function_privilege('anon','public.route_merchant_private()','EXECUTE') and not has_function_privilege('authenticated','public.route_merchant_private()','EXECUTE'),'route_merchant_private : pas d''EXECUTE pour l''API');
select ok(has_function_privilege('anon','public.merchant_siret(public.merchants)','EXECUTE') and has_function_privilege('authenticated','public.merchant_phone(public.merchants)','EXECUTE'),'colonnes calculées : appelables (rendent null sans droit)');
set local role authenticated;
select throws_ok($$select public.can_see_merchant_private('30000000-0000-0000-0000-000000000001', true)$$,'42501',null,'appel direct de can_see_merchant_private refusé');
reset role;

-- 3. merchant_private : aucune écriture ni lecture par l'API, aucune politique.
select ok(not (has_table_privilege('anon','public.merchant_private','INSERT') or has_table_privilege('anon','public.merchant_private','UPDATE') or has_table_privilege('anon','public.merchant_private','DELETE') or has_table_privilege('anon','public.merchant_private','TRUNCATE') or has_table_privilege('anon','public.merchant_private','REFERENCES')),'anon : aucun droit d''écriture sur merchant_private');
select ok(not (has_table_privilege('authenticated','public.merchant_private','INSERT') or has_table_privilege('authenticated','public.merchant_private','UPDATE') or has_table_privilege('authenticated','public.merchant_private','DELETE') or has_table_privilege('authenticated','public.merchant_private','TRUNCATE') or has_table_privilege('authenticated','public.merchant_private','REFERENCES')),'authenticated : aucun droit d''écriture sur merchant_private');
select is((select count(*)::int from pg_policies where tablename='merchant_private'),0,'merchant_private : aucune politique (refus par défaut)');
select ok((select relrowsecurity from pg_class where oid='public.merchant_private'::regclass),'merchant_private : RLS active');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select throws_ok($$insert into public.merchant_private(merchant_id,siret) values ('30000000-0000-0000-0000-000000000001','73282932000074')$$,'42501',null,'propriétaire : insertion directe dans merchant_private refusée');
select throws_ok($$update public.merchant_private set siret='73282932000074'$$,'42501',null,'propriétaire : mise à jour directe refusée');
reset role;

-- 4. Écriture croisée : un autre restaurateur ne peut ni modifier ni créer pour le compte d'autrui.
update public.merchants set siret='73282932000074' where id='30000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('bb000000-0000-0000-0000-000000000003');
select lives_ok($$update public.merchants set siret='12345678900021' where id='30000000-0000-0000-0000-000000000001'$$,'autre restaurateur : mise à jour sans effet (0 ligne, RLS)');
select throws_ok($$insert into public.merchants(id,owner_id,slug,name,category,postal_code,city,siret) values ('bd000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000003','intrus','Intrus','restaurant','75002','Paris','73282932000074')$$,'42501',null,'insertion directe dans merchants refusée');
reset role;
select is((select siret from public.merchant_private where merchant_id='30000000-0000-0000-0000-000000000001'),'73282932000074','SIRET du commerce inchangé après tentative croisée');
select is((select count(*)::int from public.merchant_private where merchant_id='bd000000-0000-0000-0000-000000000001'),0,'aucune ligne privée créée par l''insertion refusée');

-- 5. Numéro professionnel public : distinct du téléphone privé, publié seulement si autorisé.
update public.merchants set phone='0611223344', public_phone='0144556677' where id='30000000-0000-0000-0000-000000000001';
select is((select public_phone from public.merchants where id='30000000-0000-0000-0000-000000000001'),null,'colonne brute public_phone vidée');
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select merchant_public_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'numéro public non autorisé : invisible pour l''anonyme');
reset role;
update public.merchants set public_phone_authorized=true where id='30000000-0000-0000-0000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select merchant_public_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'0144556677','numéro public autorisé : visible de l''anonyme');
select is((select merchant_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),null,'le téléphone privé reste invisible');
select is((select public_phone from public.public_merchants where id='30000000-0000-0000-0000-000000000001'),'0144556677','public_merchants expose le numéro public autorisé');
reset role;
update public.merchants set public_phone_authorized=false where id='30000000-0000-0000-0000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select public_phone from public.public_merchants where id='30000000-0000-0000-0000-000000000001'),null,'autorisation retirée : numéro à nouveau masqué');
reset role;
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select merchant_public_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'0144556677','le propriétaire voit son numéro public même non autorisé');
reset role;

-- 6. La projection publique n'expose rien de plus.
select is((select string_agg(column_name,',' order by column_name) from information_schema.columns where table_schema='public' and table_name='public_merchants'),
  'about,accent_color,address_line,category,city,delivery_enabled,description,has_minisite,id,logo_url,name,offers_pickup,photo_url,postal_code,public_phone,slug,tagline','public_merchants : liste exacte des colonnes');
select ok(not has_table_privilege('anon','public.public_merchants','INSERT') and not has_table_privilege('anon','public.public_merchants','UPDATE'),'public_merchants : lecture seule');

-- 7. La vue s'exécute avec les droits de l'appelant : un commerce non publié n'y figure pour personne,
-- et l'anonyme ne voit pas plus de lignes que la RLS de merchants ne l'y autorise.
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.public_merchants'::regclass),'public_merchants : security_invoker = true');
update public.merchants set is_published=false where id='30000000-0000-0000-0000-000000000001';
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select is((select count(*)::int from public.public_merchants where id='30000000-0000-0000-0000-000000000001'),0,'commerce dépublié : absent de public_merchants (anonyme)');
reset role;
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.public_merchants where id='30000000-0000-0000-0000-000000000001'),0,'commerce dépublié : absent de public_merchants même pour son propriétaire');
reset role;

-- 8. Droits de colonne : le restaurateur enregistre son numéro public avec le rôle de l'API (régression
-- trouvée en recette HTTP : sans GRANT UPDATE la requête était refusée en 403).
select ok(has_column_privilege('authenticated','public.merchants','public_phone','UPDATE') and has_column_privilege('authenticated','public.merchants','public_phone_authorized','UPDATE'),'authenticated : UPDATE sur public_phone et public_phone_authorized');
select ok(not has_column_privilege('anon','public.merchants','public_phone','UPDATE') and not has_column_privilege('anon','public.merchants','public_phone_authorized','UPDATE'),'anon : aucun UPDATE sur ces colonnes');
set local role authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
select lives_ok($$update public.merchants set public_phone='0155667788', public_phone_authorized=true where id='30000000-0000-0000-0000-000000000001'$$,'propriétaire : enregistre et autorise son numéro public (rôle authenticated)');
select is((select merchant_public_phone(m) from public.merchants m where id='30000000-0000-0000-0000-000000000001'),'0155667788','le numéro enregistré par l''API est relu');
select pg_temp.as_user('bb000000-0000-0000-0000-000000000003');
select lives_ok($$update public.merchants set public_phone='0100000000' where id='30000000-0000-0000-0000-000000000001'$$,'autre restaurateur : requête sans erreur mais sans effet (RLS)');
reset role;
select is((select public_phone from public.merchant_private where merchant_id='30000000-0000-0000-0000-000000000001'),'0155667788','autre restaurateur : numéro public inchangé');

select * from finish();
rollback;
