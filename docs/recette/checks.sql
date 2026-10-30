-- Contrôles d'état (lecture seule) à lancer dans l'éditeur SQL à chaque étape du déroulé.
-- Une seule ligne de résultat ; les booléens indiquent l'état, pas un verdict : voir la colonne attendue
-- dans docs/RECETTE-MERCHANTS.md (colonnes « avant migration » / « après migration » / « après retour arrière »).
select
  to_regclass('public.merchant_private') is not null                                    as table_privee_existe,
  to_regclass('public.public_merchants') is not null                                    as vue_publique_existe,
  (select count(*) from public.merchants)                                               as commerces,
  (select count(*) from public.merchants where is_published)                            as commerces_publies,
  (select count(*) from public.merchants where coalesce(legal_name,siret,vat_number,contact_email,phone,payment_link) is not null) as commerces_avec_colonnes_brutes,
  case when to_regclass('public.merchant_private') is not null
       then (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.merchant_private', false, true, '')))[1]::text::int
       else 0 end                                                                         as lignes_privees,
  has_table_privilege('anon','public.merchants','SELECT')                                as anon_lit_merchants,
  case when to_regclass('public.merchant_private') is not null
       then (xpath('/row/c/text()', query_to_xml('select count(siret) + count(phone) + count(payment_link) + count(legal_name) + count(vat_number) + count(contact_email) as c from public.merchant_private', false, true, '')))[1]::text::int
       else 0 end                                                                         as valeurs_privees_non_nulles,
  (select count(*) from pg_trigger where tgrelid='public.merchants'::regclass and tgname like 'a00_merchants_private_%') as declencheurs_ecriture,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('merchant_siret','merchant_vat_number','merchant_legal_name','merchant_contact_email','merchant_phone','merchant_public_phone','merchant_payment_link','has_payment_link')) as colonnes_calculees,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('search_pro_directory','pro_directory_cities','request_directory_claim')) as anciennes_fonctions_annuaire,
  (select reloptions @> array['security_invoker=true'] from pg_class where oid = to_regclass('public.public_merchants')) as vue_security_invoker,
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261029120000') as migration_enregistree;
