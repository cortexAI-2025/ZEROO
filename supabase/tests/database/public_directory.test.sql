begin;
select plan(1);
-- Revue administrateur d'une demande de revendication historique (la soumission publique est retirée) :
-- seuls les administrateurs la voient et la traitent ; une acceptation exige un commerce existant et concordant.
insert into auth.users(id,email,email_confirmed_at) values
 ('d1000000-0000-0000-0000-000000000001','directory-owner-fixture@example.test',now()),
 ('d1000000-0000-0000-0000-000000000002','directory-other-fixture@example.test',now()),
 ('d1000000-0000-0000-0000-000000000003','directory-admin-fixture@example.test',now());
insert into public.platform_admins(user_id) values('d1000000-0000-0000-0000-000000000003');
insert into public.directory_businesses(siret,display_name,legal_name,naf_code,administrative_status,address_line,postal_code,city,department,source_url,source_checked_on,source_sha256)
values('73282932000074','Fixture revendication','Entreprise fixture','56.10C','A','1 rue de test','78190','TRAPPES','78','https://annuaire-entreprises.data.gouv.fr/etablissement/73282932000074',current_date,repeat('0',64));
create temp table claim_test as select id from (select gen_random_uuid() id) x;grant all on claim_test to authenticated;
insert into public.directory_claims(id,siret,claimant_user_id,contact_email,capacity,evidence_note)
select id,'73282932000074','d1000000-0000-0000-0000-000000000001','directory-owner-fixture@example.test','Gérant','Je représente ce commerce et peux fournir des justificatifs.' from claim_test;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
do $$begin
 begin perform public.review_directory_claim((select id from claim_test),'accepted','Justificatifs de test vérifiés',null);raise exception 'approval_without_matching_business';exception when invalid_parameter_value then null;end;
end;$$;
reset role;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
do $$begin
 begin perform public.review_directory_claim((select id from claim_test),'rejected','Je ne suis pas administrateur',null);raise exception 'nonadmin_review_allowed';exception when insufficient_privilege then null;end;
 begin perform * from public.directory_claims;raise exception 'claims_readable_by_client';exception when insufficient_privilege then null;end;
end;$$;
reset role;
insert into public.merchants(id,owner_id,siret,slug,name,category,address_line,postal_code,city,latitude,longitude) values('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','73282932000074','directory-claim-fixture','Fixture revendication','restaurant','1 rue de test','78190','Trappes',48.77,2.0);
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select public.review_directory_claim((select id from claim_test),'accepted','Concordance et mandat professionnel vérifiés','d2000000-0000-0000-0000-000000000001');
reset role;
do $$begin
 if not exists(select 1 from public.directory_claims where id=(select id from claim_test) and status='accepted') then raise exception 'claim_approval_failed';end if;
 if not exists(select 1 from public.directory_businesses where siret='73282932000074' and linked_merchant_id='d2000000-0000-0000-0000-000000000001') then raise exception 'existing_merchant_not_linked';end if;
 if exists(select 1 from public.subscriptions where merchant_id='d2000000-0000-0000-0000-000000000001') then raise exception 'claim_created_subscription';end if;
end;$$;
select pass('Revue admin des demandes historiques, isolation des clients, rattachement vérifié sans abonnement');
select * from finish();
rollback;
