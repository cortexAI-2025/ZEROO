begin;
select plan(12);

-- Contexte (seed) : Nadia (cliente) et « Chez Samir ». Bob est un second client.
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000002', 'bob@test.fr');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.customer_favorites (user_id, merchant_id)
                   values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001') $$,
                'Nadia ajoute Chez Samir à ses favoris');
select throws_ok($$ insert into public.customer_favorites (user_id, merchant_id)
                    values ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001') $$,
                 '23505', null, 'pas de doublon');
select throws_ok($$ insert into public.customer_favorites (user_id, merchant_id)
                    values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001') $$,
                 '42501', null, 'Nadia ne peut pas ajouter de favori au nom de Bob');
select is((select count(*)::int from public.customer_favorites), 1, 'Nadia voit son favori');

-- Un autre utilisateur ne voit ni ne modifie les favoris de Nadia.
select pg_temp.as_user('20000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.customer_favorites), 0, 'Bob ne voit pas les favoris de Nadia');
delete from public.customer_favorites where user_id = '20000000-0000-0000-0000-000000000001';
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.customer_favorites), 1, 'Bob ne peut pas supprimer le favori de Nadia');
select throws_ok($$ update public.customer_favorites set user_id = '20000000-0000-0000-0000-000000000002' $$,
                 '42501', null, 'un favori ne se transfère pas à un autre compte');

-- Un établissement dépublié n'est plus visible : il ne peut pas être présenté comme commandable.
reset role;
update public.merchants set is_published = false where id = '30000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.customer_favorites f join public.merchants m on m.id = f.merchant_id), 0,
          'favori d''un établissement dépublié : plus visible côté client');
reset role;
update public.merchants set is_published = true where id = '30000000-0000-0000-0000-000000000001';

-- Suppression
set local role authenticated;
select pg_temp.as_user('20000000-0000-0000-0000-000000000001');
select lives_ok($$ delete from public.customer_favorites where merchant_id = '30000000-0000-0000-0000-000000000001' $$,
                'Nadia retire son favori');
select is((select count(*)::int from public.customer_favorites), 0, 'il n''en reste plus');
reset role;
set local role anon;
select throws_ok($$ select * from public.customer_favorites $$, '42501', null, 'un visiteur n''a pas de favoris');
reset role;
insert into public.customer_favorites (user_id, merchant_id)
values ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');
delete from auth.users where id = '20000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.customer_favorites where user_id = '20000000-0000-0000-0000-000000000002'), 0,
          'la suppression du compte efface ses favoris');

select * from finish();
rollback;
