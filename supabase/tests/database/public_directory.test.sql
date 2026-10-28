begin;
select plan(1);
insert into auth.users(id,email,email_confirmed_at) values
 ('d1000000-0000-0000-0000-000000000001','directory-owner-fixture@example.test',now()),
 ('d1000000-0000-0000-0000-000000000002','directory-other-fixture@example.test',now()),
 ('d1000000-0000-0000-0000-000000000003','directory-admin-fixture@example.test',now()),
 ('d1000000-0000-0000-0000-000000000004','directory-unconfirmed-fixture@example.test',null);
insert into public.platform_admins(user_id) values('d1000000-0000-0000-0000-000000000003');
insert into public.directory_businesses(siret,display_name,legal_name,naf_code,administrative_status,address_line,postal_code,city,department,source_url,source_checked_on,source_sha256)
select case when n=1 then '73282932000074' else '9990000000000'||n end,'Fixture revendication '||n,'Entreprise fixture','56.10C','A','1 rue de test','78190','TRAPPES','78','https://annuaire-entreprises.data.gouv.fr/etablissement/9990000000000'||n,current_date,repeat('0',64) from generate_series(1,6)n;
create temp table claim_test(id uuid);grant all on claim_test to authenticated;
set local role anon;
do $$begin
 if (public.search_pro_directory('Fixture revendication')->>'total')::int<>6 then raise exception 'public_listing_failed';end if;
 if public.search_pro_directory('Fixture revendication')->'rows'->0 ? 'claimant_user_id' then raise exception 'claim_identity_leaked';end if;
 begin perform * from public.directory_claims;raise exception 'anonymous_claims_exposed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
insert into claim_test select public.request_directory_claim('73282932000074','Gérant','Je représente ce commerce et peux fournir des justificatifs.');
do $$begin
 if public.request_directory_claim('73282932000074','Gérant','Je représente ce commerce et peux fournir des justificatifs.')<>(select id from claim_test) then raise exception 'pending_not_idempotent';end if;
 if (select count(*) from public.directory_claims where id=(select id from claim_test))<>1 then raise exception 'own_claim_not_visible';end if;
 if not exists(select 1 from public.directory_claims where id=(select id from claim_test) and status='pending' and contact_email='directory-owner-fixture@example.test') then raise exception 'email_or_pending_state_failed';end if;
end;$$;
reset role;
-- The review cannot assign a different merchant or create one implicitly.
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
do $$begin
 begin perform public.review_directory_claim((select id from claim_test),'accepted','Justificatifs de test vérifiés',null);raise exception 'approval_without_matching_business';exception when invalid_parameter_value then null;end;
end;$$;
reset role;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
do $$begin
 if exists(select 1 from public.directory_claims where id=(select id from claim_test)) then raise exception 'other_claimant_data_leaked';end if;
 begin perform public.review_directory_claim((select id from claim_test),'rejected','Je ne suis pas administrateur',null);raise exception 'nonadmin_review_allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
do $$begin
 begin perform public.request_directory_claim('99900000000002','Gérant','Justificatifs professionnels disponibles sur demande.');raise exception 'unconfirmed_claim_allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local request.jwt.claims='{"sub":"d1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$declare n int;begin
 for n in 2..5 loop perform public.request_directory_claim('9990000000000'||n,'Gérant','Justificatifs professionnels disponibles sur demande.');end loop;
 begin perform public.request_directory_claim('99900000000006','Gérant','Justificatifs professionnels disponibles sur demande.');raise exception 'claim_rate_limit_failed';exception when invalid_parameter_value then null;end;
end;$$;
reset role;
-- An approved claim links an existing matching professional, never a subscription.
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
select pass('Public references, confirmed claims, claimant isolation, throttling and verified business linkage');
select * from finish();
rollback;
