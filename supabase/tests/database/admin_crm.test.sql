begin;
select plan(1);
-- Test users and all changes are rolled back. No invitations or messages are sent.
insert into auth.users(id,email,email_confirmed_at) values
 ('c1000000-0000-0000-0000-000000000001','crm-merchant-fixture@example.test',now()),
 ('c1000000-0000-0000-0000-000000000002','crm-courier-fixture@example.test',now()),
 ('c1000000-0000-0000-0000-000000000003','crm-client-fixture@example.test',now()),
 ('c1000000-0000-0000-0000-000000000004','crm-admin-fixture@example.test',now());
insert into public.platform_admins(user_id) values('c1000000-0000-0000-0000-000000000004');
create temp table crm_result(key text primary key,value jsonb);
grant all on crm_result to authenticated;
set local request.jwt.claims='{"sub":"c1000000-0000-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
insert into crm_result select 'merchant',public.admin_console('add_entity',null,'{"kind":"merchant","email":"crm-merchant-fixture@example.test","name":"Fixture CRM","slug":"fixture-crm-rollback","category":"restaurant","address_line":"1 rue de test","postal_code":"78190","city":"Trappes","latitude":48.77,"longitude":2.0,"reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000001');
insert into crm_result select 'courier',public.admin_console('add_entity',null,'{"kind":"courier","email":"crm-courier-fixture@example.test","display_name":"Livreur CRM","phone":"0600000000","legal_status":"auto_entrepreneur","siret":"73282932000074","vehicle":"bike","work_zone":"Trappes","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000002');
insert into crm_result select 'suspend',public.admin_console('set_status',(select (value->>'id')::uuid from crm_result where key='merchant'),'{"kind":"merchant","status":"suspended","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000003');
-- Retry is idempotent.
select public.admin_console('set_status',(select (value->>'id')::uuid from crm_result where key='merchant'),'{"kind":"merchant","status":"suspended","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000003');
insert into crm_result select 'case',public.admin_console('case_create',null,'{"customer_id":"c1000000-0000-0000-0000-000000000003","subject":"Test litige","description":"Description transactionnelle","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000004');
select public.admin_console('case_update',(select (value->>'id')::uuid from crm_result where key='case'),'{"status":"resolved","resolution":"Conclusion du test","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000005');
insert into crm_result select 'contact',public.admin_console('contact_create',null,'{"email":"crm-client-fixture@example.test","subject":"Test message","body":"Brouillon transactionnel uniquement","reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000006');
select public.admin_console('contact_done',(select (value->>'id')::uuid from crm_result where key='contact'),'{"reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000007');
reset role;
insert into public.loyalty_cards(user_id,merchant_id) select 'c1000000-0000-0000-0000-000000000003',(value->>'id')::uuid from crm_result where key='merchant';
insert into public.menu_categories(id,merchant_id,name) select 'c3000000-0000-0000-0000-000000000001',(value->>'id')::uuid,'Catégorie test' from crm_result where key='merchant';
insert into public.menu_items(merchant_id,category_id,name,price_cents) select (value->>'id')::uuid,'c3000000-0000-0000-0000-000000000001','Produit test',1000 from crm_result where key='merchant';
set local role authenticated;
select public.admin_console('loyalty_adjust','c1000000-0000-0000-0000-000000000003',jsonb_build_object('merchant_id',(select value->>'id' from crm_result where key='merchant'),'delta',1,'reason','test transactionnel'),0,'c2000000-0000-0000-0000-000000000008');
insert into crm_result select 'offer',public.admin_console('offer_create',null,jsonb_build_object('merchant_id',(select value->>'id' from crm_result where key='merchant'),'name','Offre test','percent_off',10,'starts_on',current_date,'ends_on',current_date+1,'reason','test transactionnel'),0,'c2000000-0000-0000-0000-000000000009');
select public.admin_console('offer_toggle',(select (value->>'id')::uuid from crm_result where key='offer'),'{"active":true,"reason":"test transactionnel"}',0,'c2000000-0000-0000-0000-000000000010');
reset role;
-- Review moderation and paginated client history.
select public.admin_console('set_status',(select (value->>'id')::uuid from crm_result where key='merchant'),'{"kind":"merchant","status":"active","reason":"test activation"}',0,'c2000000-0000-0000-0000-000000000012');
insert into public.orders(id,merchant_id,customer_id,subtotal_cents,total_cents,status) select 'c4000000-0000-0000-0000-000000000001',(value->>'id')::uuid,'c1000000-0000-0000-0000-000000000003',1000,1000,'collected' from crm_result where key='merchant';
insert into public.order_reviews(order_id,merchant_id,customer_id,merchant_stars,comment) select 'c4000000-0000-0000-0000-000000000001',(value->>'id')::uuid,'c1000000-0000-0000-0000-000000000003',5,'Avis fixture' from crm_result where key='merchant';
set local role authenticated;
select public.admin_console('review_visibility','c4000000-0000-0000-0000-000000000001','{"hidden":true,"reason":"modération de test"}',0,'c2000000-0000-0000-0000-000000000013');
do $$begin
 if (public.admin_console('client_orders','c1000000-0000-0000-0000-000000000003')->>'total')::int<>1 then raise exception 'client_history_count_failed';end if;
 if not (public.admin_console('client_orders','c1000000-0000-0000-0000-000000000003')->'rows'->0 ? 'delivery_address_line') then raise exception 'client_history_address_failed';end if;
 if (public.admin_console('client_detail','c1000000-0000-0000-0000-000000000003')->>'orders_total')::int<>1 then raise exception 'client_detail_failed';end if;
end;$$;
select public.admin_console('set_status',(select (value->>'id')::uuid from crm_result where key='merchant'),'{"kind":"merchant","status":"suspended","reason":"test final suspension"}',0,'c2000000-0000-0000-0000-000000000014');
reset role;
set local request.jwt.claims='{"sub":"c1000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
do $$begin if exists(select 1 from public.order_reviews where order_id='c4000000-0000-0000-0000-000000000001') then raise exception 'hidden_review_leaked';end if;end;$$;
reset role;
set local request.jwt.claims='{"sub":"c1000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ declare m uuid:=(select (value->>'id')::uuid from crm_result where key='merchant'); begin
 if not exists(select 1 from public.merchants where id=m and admin_status='suspended' and not is_published and is_paused) then raise exception 'suspension_not_enforced';end if;
 if (select count(*) from public.admin_audit_logs where details->>'request_id'='c2000000-0000-0000-0000-000000000003')<>1 then raise exception 'idempotency_failed';end if;
 if not exists(select 1 from public.admin_cases where id=(select (value->>'id')::uuid from crm_result where key='case') and status='resolved') then raise exception 'case_update_failed';end if;
 if not exists(select 1 from public.admin_contact_tasks where id=(select (value->>'id')::uuid from crm_result where key='contact') and status='done') then raise exception 'contact_tracking_failed';end if;
 if (select rewards_available from public.loyalty_cards where merchant_id=m and user_id='c1000000-0000-0000-0000-000000000003')<>1 then raise exception 'loyalty_adjust_failed';end if;
 if (select count(*) from public.happy_hour_slots where happy_hour_id=(select (value->>'id')::uuid from crm_result where key='offer'))<>7 then raise exception 'offer_slots_failed';end if;
 -- The server refuses new orders for suspended merchants.
 begin
 insert into public.orders(merchant_id,customer_id,subtotal_cents,total_cents) values(m,'c1000000-0000-0000-0000-000000000003',1000,1000);
 raise exception 'suspended_order_was_accepted';
 exception when insufficient_privilege then null;end;
end;$$;
set local request.jwt.claims='{"sub":"c1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
-- The owner cannot undo moderation.
update public.merchants set is_published=false,is_paused=false where id=(select (value->>'id')::uuid from crm_result where key='merchant');
do $$begin
 begin perform public.admin_console('clients');raise exception 'nonadmin_read_allowed';exception when insufficient_privilege then null;end;
 begin perform public.admin_console('set_status',(select (value->>'id')::uuid from crm_result where key='merchant'),'{"kind":"merchant","status":"active","reason":"unauthorized test"}',0,'c2000000-0000-0000-0000-000000000011');raise exception 'nonadmin_write_allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
do $$ begin if exists(select 1 from public.merchants where id=(select (value->>'id')::uuid from crm_result where key='merchant') and not is_paused) then raise exception 'owner_bypassed_moderation';end if;end;$$;
select pass('CRM mutations, audit, idempotency, moderation, client history, offers, loyalty and dispute checks');
select * from finish();
rollback;
