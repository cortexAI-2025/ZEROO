begin;
select plan(12);
insert into auth.users (id,email) values
('91020000-0000-4000-8000-000000000001','profile-owner@example.invalid'),
('91020000-0000-4000-8000-000000000002','profile-other@example.invalid'),
('91020000-0000-4000-8000-000000000003','profile-courier@example.invalid');
update public.profiles set account_space='client' where id in ('91020000-0000-4000-8000-000000000001','91020000-0000-4000-8000-000000000002');
update public.profiles set account_space='courier' where id='91020000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','91020000-0000-4000-8000-000000000001',true);
select lives_ok($test$select public.update_client_profile('{"first_name":"Léa","last_name":"Dupont","address_line":"12 rue des Lilas","postal_code":"78190","city":"Trappes","phone":"+33612345678"}')$test$,'owner can complete and edit private identity');
select is((select concat_ws('|',first_name,last_name,address_line,postal_code,city,phone) from public.profiles where id='91020000-0000-4000-8000-000000000001'),'Léa|Dupont|12 rue des Lilas|78190|Trappes|+33612345678','all fields are saved');
select is((select display_name from public.profiles where id='91020000-0000-4000-8000-000000000001'),'Léa Dupont','display name follows first and last name');
select throws_ok($test$select public.update_client_profile('{}')$test$,'23514','invalid_client_profile','required fields cannot be cleared');
select throws_ok($test$select public.update_client_profile('{"id":"91020000-0000-4000-8000-000000000002","first_name":"Léa","last_name":"Dupont","address_line":"12 rue des Lilas","postal_code":"78190","city":"Trappes","phone":"+33612345678"}')$test$,'23514','invalid_client_profile','a target user id is not accepted');
select ok(not has_function_privilege('anon','public.update_client_profile(jsonb)','EXECUTE'),'anonymous callers denied');
select ok(not has_column_privilege('authenticated','public.profiles','first_name','UPDATE'),'no new direct update privileges');
select set_config('request.jwt.claim.sub','91020000-0000-4000-8000-000000000003',true);
select throws_ok($test$select public.update_client_profile('{}')$test$,'42501','client_profile_required','a courier cannot invoke client profile editing');
select is((select count(*)::integer from public.profiles where id='91020000-0000-4000-8000-000000000001'),0,'another user cannot read the changed identity');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($test$select public.update_client_profile('{}')$test$,'42501','not_authenticated','missing authenticated uid denied');
reset role;
select is((select first_name from public.profiles where id='91020000-0000-4000-8000-000000000002'),null::text,'another profile is unchanged');
select is((select email::text from auth.users where id='91020000-0000-4000-8000-000000000001'),'profile-owner@example.invalid','profile editing does not change Auth email');
select * from finish();
rollback;
