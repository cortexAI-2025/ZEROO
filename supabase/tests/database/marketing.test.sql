begin;
select plan(26);

-- Contexte (seed) : « Chez Samir » (Pro). Un second établissement (Start) et un administrateur.
delete from public.orders;
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'autre@test.fr'),
  ('ad000000-0000-0000-0000-000000000001', 'admin@test.fr');
insert into public.merchants (id, owner_id, slug, name, category, address_line, postal_code, city, latitude, longitude, is_published)
values ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'autre-resto', 'Autre Resto',
        'restaurant', '8 rue Cachée', '75003', 'Paris', 48.8600, 2.3600, true);
insert into public.subscriptions (merchant_id, stripe_customer_id, stripe_subscription_id, status, plan)
values ('d0000000-0000-0000-0000-000000000001', 'cus_o', 'sub_o', 'active', 'pro');
insert into public.platform_admins (user_id) values ('ad000000-0000-0000-0000-000000000001');

create function pg_temp.as_user(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
-- Chez Samir : abonnement créé il y a 5 jours.
update public.subscriptions set plan = 'pro', status = 'active', created_at = now() - interval '5 days'
where merchant_id = '30000000-0000-0000-0000-000000000001';
update public.merchants set is_published = true where id = '30000000-0000-0000-0000-000000000001';

select is(public.enqueue_due_marketing_campaigns(), 0, 'sans consentement : aucune campagne');

-- Consentement donné par le propriétaire
select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
update public.merchants set marketing_consent = true where id = '30000000-0000-0000-0000-000000000001';
select ok((select marketing_consent_at is not null from public.merchants where id = '30000000-0000-0000-0000-000000000001'),
          'le consentement est daté');
reset role;

select is(public.enqueue_due_marketing_campaigns(), 1, 'Pro + consentement : une campagne');
select is((select status::text from public.marketing_campaigns where merchant_id = '30000000-0000-0000-0000-000000000001'),
          'pending_review', 'en attente de validation');
select ok((select caption like '%chez-samir%' from public.marketing_campaigns where merchant_id = '30000000-0000-0000-0000-000000000001'),
          'texte proposé avec le lien de la fiche');
select is(public.enqueue_due_marketing_campaigns(), 0, 'idempotent : pas de doublon dans la même échéance');

-- Échéance suivante (abonnement vieux de 70 jours)
update public.subscriptions set created_at = now() - interval '70 days' where merchant_id = '30000000-0000-0000-0000-000000000001';
select is(public.enqueue_due_marketing_campaigns(), 1, 'échéance mensuelle suivante : nouvelle campagne');
select is((select count(*)::int from public.marketing_campaigns where merchant_id = '30000000-0000-0000-0000-000000000001'), 2,
          'une campagne par échéance');

-- Retour à Start : les campagnes en attente sont annulées
update public.subscriptions set plan = 'start' where merchant_id = '30000000-0000-0000-0000-000000000001';
select public.enqueue_due_marketing_campaigns();
select is((select count(*)::int from public.marketing_campaigns
           where merchant_id = '30000000-0000-0000-0000-000000000001' and status = 'cancelled'), 2,
          'Start : plus éligible, campagnes annulées');
update public.subscriptions set plan = 'pro' where merchant_id = '30000000-0000-0000-0000-000000000001';

update public.merchants set marketing_consent = true where id = 'd0000000-0000-0000-0000-000000000001';
-- Campagne de travail pour les tests suivants
insert into public.marketing_campaigns (id, merchant_id, cycle_start, caption)
values ('c0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date + 400, 'Texte de test une'),
       ('c0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', current_date + 431, 'Texte de test deux'),
       ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', current_date + 400, 'Texte de test autre');

-- Isolation et droits
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select count(*)::int from public.marketing_campaigns), 1, 'un autre établissement ne voit que sa campagne');
select throws_ok($$ select * from public.admin_list_campaigns() $$, '42501', 'admin_required', 'un propriétaire n''est pas administrateur');
select throws_ok($$ select public.admin_review_campaign('c0000000-0000-0000-0000-000000000003', true, current_date + 1) $$,
                 '42501', 'admin_required', 'un propriétaire ne valide pas sa propre campagne');
select throws_ok($$ select * from public.platform_admins $$, '42501', null, 'la liste des administrateurs est fermée');
select throws_ok($$ select public.update_campaign_caption('c0000000-0000-0000-0000-000000000001', 'Un texte assez long') $$,
                 'P0002', 'campaign_not_found', 'on ne modifie pas la campagne d''un autre');
reset role;

select pg_temp.as_user('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select caption from public.update_campaign_caption('c0000000-0000-0000-0000-000000000001', 'Nouveau texte validé par moi')),
          'Nouveau texte validé par moi', 'le propriétaire corrige son texte avant validation');
select throws_ok($$ select public.update_campaign_caption('c0000000-0000-0000-0000-000000000001', 'court') $$,
                 '22023', 'invalid_caption', 'texte trop court refusé');
reset role;

-- Administration
select pg_temp.as_user('ad000000-0000-0000-0000-000000000001');
set local role authenticated;
select ok((select count(*) from public.admin_list_campaigns('pending_review')) >= 3, 'l''administrateur voit la file d''attente');
select throws_ok($$ select public.admin_review_campaign('c0000000-0000-0000-0000-000000000001', true, current_date - 1) $$,
                 '22023', 'invalid_schedule', 'date passée refusée');
select is((select status::text from public.admin_review_campaign('c0000000-0000-0000-0000-000000000001', true, current_date + 2)),
          'scheduled', 'validation et programmation');
reset role;
-- Jour complet : 3 établissements au plus
insert into public.marketing_campaigns (merchant_id, cycle_start, caption, status, scheduled_for)
select 'd0000000-0000-0000-0000-000000000001', current_date + 500 + g, 'Texte de remplissage ' || g, 'scheduled', current_date + 2
from generate_series(1, 2) g;
select pg_temp.as_user('ad000000-0000-0000-0000-000000000001');
set local role authenticated;
select throws_ok($$ select public.admin_review_campaign('c0000000-0000-0000-0000-000000000003', true, current_date + 2) $$,
                 '22023', 'campaign_day_full', 'plus de trois établissements par jour');
select is((select status::text from public.admin_review_campaign('c0000000-0000-0000-0000-000000000002', false)), 'rejected', 'refus d''une campagne');
-- Publication : succès, échec puis nouvelle tentative
select is((select status::text from public.admin_record_publication('c0000000-0000-0000-0000-000000000001', 'instagram', true, 'https://example.test/p/1')),
          'published', 'publication enregistrée');
reset role;
insert into public.marketing_campaigns (id, merchant_id, cycle_start, caption, status, scheduled_for)
values ('c0000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000001', current_date + 700, 'Texte pour échec', 'scheduled', current_date + 3);
select pg_temp.as_user('ad000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select status::text || ':' || attempts from public.admin_record_publication('c0000000-0000-0000-0000-000000000009', 'facebook', false, null, 'jeton expiré')),
          'failed:1', 'échec de publication enregistré avec son compteur');
select is((select status::text from public.admin_requeue_campaign('c0000000-0000-0000-0000-000000000009', current_date + 4)),
          'scheduled', 'nouvelle tentative programmée');
reset role;
select is((select count(*)::int from public.marketing_publications where campaign_id in
           ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000009')), 2, 'historique des publications');
select is((select count(*)::int from cron.job where jobname = 'marketing-campaigns'), 1, 'une seule tâche planifiée');

select * from finish();
rollback;
