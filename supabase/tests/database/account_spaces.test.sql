begin;
select plan(16);
insert into auth.users(id,email,email_confirmed_at) values
('abababab-0000-0000-0000-000000000001','space-client@example.test',now()),
('abababab-0000-0000-0000-000000000002','space-merchant@example.test',now()),
('abababab-0000-0000-0000-000000000003','space-courier@example.test',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"abababab-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(public.get_my_account_space(),null::text,'aucun rôle local implicite');
select is(public.claim_account_space('client'),'client','choix client enregistré');
select is(public.claim_account_space('client'),'client','choix identique idempotent');
select throws_ok($$select public.claim_account_space('courier')$$,'42501','account_space_locked','client ne devient pas livreur');
select throws_ok($$select public.claim_account_space('merchant')$$,'42501','account_space_locked','client ne devient pas restaurant');
select throws_ok($$update public.profiles set account_space='courier' where id=auth.uid()$$,'42501',null,'colonne non modifiable par API');
select throws_ok($$select public.claim_account_space('admin')$$,'22023','invalid_account_space','rôle invalide refusé');
select set_config('request.jwt.claims','{"sub":"abababab-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.get_my_account_space(),null::text,'nouveau compte ne récupère pas le rôle du précédent');
select is(public.claim_account_space('merchant'),'merchant','choix restaurant enregistré');
select throws_ok($$select public.create_courier('Interdit','0611223344','auto_entrepreneur','73282932000074','bike')$$,'42501','account_space_locked','RPC livreur refusée au restaurant');
select throws_ok($$select public.claim_account_space('courier')$$,'42501','account_space_locked','restaurant ne devient pas livreur');
select set_config('request.jwt.claims','{"sub":"abababab-0000-0000-0000-000000000003","role":"authenticated"}',true);
select is(public.claim_account_space('courier'),'courier','choix livreur enregistré');
select throws_ok($$select public.create_merchant('Interdit','snack','1 rue Test','75001','Paris',48.86,2.34)$$,'42501','account_space_locked','RPC restaurant refusée au livreur');
select throws_ok($$select public.claim_account_space('client')$$,'42501','account_space_locked','livreur ne devient pas client');
reset role;
set local role anon;
select throws_ok($$select public.claim_account_space('client')$$,'42501',null,'choix interdit aux anonymes');
select throws_ok($$select public.get_my_account_space()$$,'42501',null,'lecture interdite aux anonymes');
reset role;
select * from finish();
rollback;
