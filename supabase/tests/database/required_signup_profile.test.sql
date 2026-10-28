begin;
select plan(8);
select lives_ok($test$
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
values('91000000-0000-4000-8000-000000000001','signup-test@example.invalid','{"provider":"email"}',
'{"signup_profile_version":1,"first_name":"Léa","last_name":"Dupont","address_line":"12 rue des Lilas","postal_code":"78190","city":"Trappes","contact_phone":"+33612345678","avatar_url":"https://example.invalid/photo.jpg"}');
$test$, 'complete email registration succeeds');
select is((select first_name from public.profiles where id='91000000-0000-4000-8000-000000000001'),'Léa','first name is persisted');
select is((select last_name from public.profiles where id='91000000-0000-4000-8000-000000000001'),'Dupont','last name is persisted');
select is((select concat_ws('|',address_line,postal_code,city,phone) from public.profiles where id='91000000-0000-4000-8000-000000000001'),'12 rue des Lilas|78190|Trappes|+33612345678','address and contact telephone persist before confirmation');
select throws_ok($test$
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
values('91000000-0000-4000-8000-000000000002','missing-signup@example.invalid','{"provider":"email"}','{}');
$test$,'23514','signup_profile_required','missing registration fields are rejected on the server');
select is((select count(*)::integer from public.profiles where id='91000000-0000-4000-8000-000000000002'),0,'failed registration leaves no profile');
select ok(not has_function_privilege('anon','public.handle_new_user()','EXECUTE'),'anonymous users cannot call the trigger function');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select is((select count(*)::integer from public.profiles where id='91000000-0000-4000-8000-000000000001'),0,'another user cannot read the private registration identity');
reset role;
select * from finish();
rollback;
