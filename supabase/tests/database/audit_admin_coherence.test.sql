begin;
select plan(12);
insert into auth.users(id,email,email_confirmed_at) values
('a9100000-0000-4000-8000-000000000001','audit-client@example.invalid',now()),
('a9100000-0000-4000-8000-000000000002','audit-admin@example.invalid',now());
insert into public.platform_admins(user_id) values('a9100000-0000-4000-8000-000000000002');
update public.profiles set account_space='client',first_name='Léa',last_name='Martin',address_line='8 avenue de la Gare',postal_code='78190',city='Trappes',phone='+33711223344' where id='a9100000-0000-4000-8000-000000000001';
insert into public.directory_businesses(siret,display_name,legal_name,naf_code,administrative_status,address_line,postal_code,city,department,source_url,source_checked_on,source_sha256)
values('99900000000001','Audit resto','Audit resto','56.10C','A','8 avenue de la Gare','78190','Trappes','78','https://annuaire-entreprises.data.gouv.fr/etablissement/99900000000001',current_date,'fixture');
create temp table audit_claim(id uuid);grant all on audit_claim to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000001',true);
select throws_ok($q$select public.admin_profile_identity('a9100000-0000-4000-8000-000000000002')$q$,'42501','admin_required','a client cannot read another identity through the admin API');
select throws_ok($q$select public.admin_directory_claims()$q$,'42501','admin_required','a client cannot list other claimants');
select is((select count(*)::integer from public.platform_admins),0,'ordinary client sees no administrator memberships');
insert into audit_claim select public.request_directory_claim('99900000000001','Gérant','Demande de test pour contrôle transactionnel');
select set_config('request.jwt.claim.sub','a9100000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.platform_admins),1,'administrator sees only their own membership');
select is(public.admin_profile_identity('a9100000-0000-4000-8000-000000000001')->>'address_line','8 avenue de la Gare','administrator reads current profile address');
select is(public.admin_profile_identity('a9100000-0000-4000-8000-000000000001')->>'last_name','Martin','administrator reads current last name');
select ok(not(public.admin_profile_identity('a9100000-0000-4000-8000-000000000001') ? 'encrypted_password'),'no Auth secrets in identity response');
select ok(exists(select 1 from jsonb_array_elements(public.admin_directory_claims()->'rows') r where r->>'siret'='99900000000001'),'pending public claim reaches administrator queue');
select throws_ok($q$select public.review_directory_claim((select id from audit_claim),'accepted','Justification de contrôle',null)$q$,'22023','Le compte professionnel et le SIRET doivent correspondre','acceptance cannot bypass owner and SIRET matching');
select lives_ok($q$select public.review_directory_claim((select id from audit_claim),'rejected','Justificatifs insuffisants pour ce contrôle',null)$q$,'review decision is supported');
select is((select status from public.directory_claims where id=(select id from audit_claim)),'rejected','decision persists');
reset role;
select ok(not has_table_privilege('anon','public.admin_profiles','SELECT') and not has_table_privilege('anon','public.admin_profiles','INSERT') and not has_table_privilege('anon','public.admin_profiles','UPDATE'),'anonymous administrator profile grants removed');
select * from finish();
rollback;
