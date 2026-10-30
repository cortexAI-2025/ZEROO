-- RETOUR ARRIÈRE « SÛR » de 20261029120000_merchants_private_details : ne réexpose RIEN aux visiteurs.
-- Principe : avant de remettre les valeurs privées dans les colonnes de merchants (ancien modèle, lisibles par
-- l'API pour les commerces PUBLIÉS), on dépublie tous les commerces (liste mémorisée). Un visiteur anonyme ne voit
-- alors plus aucune ligne de merchants : les colonnes restaurées ne sont lisibles que du propriétaire et des clients
-- ayant commandé (politiques RLS d'origine). La republication est une étape séparée, explicite :
-- merchants_private_ROLLBACK_REPUBLISH.sql, à n'exécuter qu'après redéploiement de l'ancienne application.
-- Conséquence : les commerces sont hors annuaire et n'acceptent plus de commandes tant qu'ils ne sont pas republiés.
-- Préférer « corriger en avançant » (redéployer la nouvelle application) : ce retour arrière est un dernier recours.
begin;
-- GARDE ANTI-REJEU : ce script modifie la production (dépublie tous les commerces puis réexpose leurs données administratives aux clients et livreurs). Il refuse de s'exécuter sans confirmation explicite, typée
-- dans la même exécution, AVANT le script : set zeeroo.confirm_rollback = 'merchants_private_safe';
do $$ begin
  if coalesce(current_setting('zeeroo.confirm_rollback', true), '') <> 'merchants_private_safe' then
    raise exception 'Retour arrière non confirmé. Il dépublie tous les commerces puis réexpose leurs données administratives aux clients et livreurs. Si c''est voulu, taper d''abord : set zeeroo.confirm_rollback = ''merchants_private_safe'';';
  end if;
end $$;
set local lock_timeout = '5s';
create table if not exists admin_private.rollback_published_snapshot (
  merchant_id uuid primary key,
  taken_at timestamptz not null default now()
);
revoke all on admin_private.rollback_published_snapshot from public, anon, authenticated;
insert into admin_private.rollback_published_snapshot (merchant_id)
select id from public.merchants where is_published
on conflict (merchant_id) do nothing;
update public.merchants set is_published = false where is_published;
do $$ begin
  if exists (select 1 from public.merchants where is_published) then raise exception 'Dépublication incomplète : abandon'; end if;
end $$;

drop trigger if exists a00_merchants_private_legal_name on public.merchants;
drop trigger if exists a00_merchants_private_siret on public.merchants;
drop trigger if exists a00_merchants_private_vat_number on public.merchants;
drop trigger if exists a00_merchants_private_contact_email on public.merchants;
drop trigger if exists a00_merchants_private_phone on public.merchants;
drop trigger if exists a00_merchants_private_public_phone on public.merchants;
drop trigger if exists a00_merchants_private_payment_link on public.merchants;
update public.merchants m set legal_name = p.legal_name, siret = p.siret, vat_number = p.vat_number,
       contact_email = p.contact_email, phone = p.phone, payment_link = p.payment_link
from public.merchant_private p where p.merchant_id = m.id;
create or replace function public.is_payments_ready(m public.merchants)
returns boolean language sql stable security definer set search_path = '' as $$
  select m.payment_link is not null or m.accepts_cash_pickup;
$$;
CREATE OR REPLACE FUNCTION admin_private.subscriber_details(p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  account_id uuid;
  entity jsonb;
  subscription jsonb;
  payments jsonb;
  activity jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.platform_admins where user_id=auth.uid()) then
    raise exception 'Accès réservé aux administrateurs' using errcode='42501';
  end if;
  if p_kind='merchant' then
    select m.owner_id, jsonb_build_object('id', m.id, 'owner_id', m.owner_id, 'name', m.name, 'slug', m.slug, 'description', m.description, 'category', m.category, 'phone', m.phone, 'contact_email', m.contact_email, 'legal_name', m.legal_name, 'siret', m.siret, 'vat_number', m.vat_number, 'address_line', m.address_line, 'postal_code', m.postal_code, 'city', m.city, 'latitude', m.latitude, 'longitude', m.longitude, 'timezone', m.timezone, 'photo_url', m.photo_url, 'logo_url', m.logo_url, 'tagline', m.tagline, 'about', m.about, 'accent_color', m.accent_color, 'is_published', m.is_published, 'is_paused', m.is_paused, 'paused_until', m.paused_until, 'created_at', m.created_at, 'updated_at', m.updated_at, 'delivery_enabled', m.delivery_enabled, 'delivery_fee_cents', m.delivery_fee_cents, 'delivery_radius_m', m.delivery_radius_m, 'accepts_cash_pickup', m.accepts_cash_pickup, 'offers_pickup', m.offers_pickup, 'pickup_instructions', m.pickup_instructions, 'default_prep_minutes', m.default_prep_minutes, 'payment_link', m.payment_link, 'group_orders_enabled', m.group_orders_enabled, 'group_min_lead_hours', m.group_min_lead_hours, 'group_min_headcount', m.group_min_headcount, 'group_min_total_cents', m.group_min_total_cents, 'marketing_consent', m.marketing_consent, 'marketing_consent_at', m.marketing_consent_at) into account_id,entity from public.merchants m where m.id=p_id;
    select jsonb_build_object('stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id, 'status', s.status, 'plan', s.plan, 'trial_end', s.trial_end, 'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'trial_used', s.trial_used, 'updated_at', s.updated_at, 'created_at', s.created_at, 'first_paid_at', s.first_paid_at) into subscription from public.subscriptions s where s.merchant_id=p_id;
    select jsonb_build_object('orders_count',count(*),'last_order_at',max(created_at)) into activity from public.orders where merchant_id=p_id;
    select jsonb_build_object('stripe_account_id',stripe_account_id,'charges_enabled',charges_enabled,'payouts_enabled',payouts_enabled,'details_submitted',details_submitted,'updated_at',updated_at) into payments from public.merchant_stripe_accounts where merchant_id=p_id;
  elsif p_kind='courier' then
    select c.user_id, jsonb_build_object('id', c.id, 'user_id', c.user_id, 'display_name', c.display_name, 'phone', c.phone, 'legal_status', c.legal_status, 'siret', c.siret, 'vehicle', c.vehicle, 'work_zone', c.work_zone, 'is_available', c.is_available, 'available_until', c.available_until, 'last_assigned_at', c.last_assigned_at, 'photo_url', c.photo_url, 'payment_link', c.payment_link, 'created_at', c.created_at, 'updated_at', c.updated_at) into account_id,entity from public.couriers c where c.id=p_id;
    select jsonb_build_object('stripe_customer_id', s.stripe_customer_id, 'stripe_subscription_id', s.stripe_subscription_id, 'status', s.status, 'plan', s.plan, 'trial_end', s.trial_end, 'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end, 'trial_used', s.trial_used, 'updated_at', s.updated_at) into subscription from public.courier_subscriptions s where s.courier_id=p_id;
    select jsonb_build_object('orders_count',count(*),'last_order_at',max(created_at)) into activity from public.orders where courier_id=p_id;
    select jsonb_build_object('stripe_account_id',stripe_account_id,'charges_enabled',charges_enabled,'payouts_enabled',payouts_enabled,'details_submitted',details_submitted,'updated_at',updated_at) into payments from public.courier_stripe_accounts where courier_id=p_id;
  else
    raise exception 'Type d’abonné invalide' using errcode='22023';
  end if;
  if entity is null then raise exception 'Abonné introuvable' using errcode='P0002'; end if;
  return jsonb_build_object(
    'entity',entity,'subscription',subscription,'payments',payments,'activity',activity,
    'account',(select jsonb_build_object('id',id,'email',email,'phone',phone,'created_at',created_at,'email_confirmed_at',email_confirmed_at,'phone_confirmed_at',phone_confirmed_at,'last_sign_in_at',last_sign_in_at,'banned_until',banned_until) from auth.users where id=account_id),
    'profile',(select jsonb_build_object('display_name',display_name,'phone',phone,'locale',locale,'account_space',account_space,'created_at',created_at,'updated_at',updated_at) from public.profiles where id=account_id)
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION admin_private.review_directory_claim(p_claim_id uuid, p_decision text, p_note text, p_merchant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.directory_claims;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'admin_required' using errcode='42501';end if;
 if p_decision is null or p_decision not in('accepted','rejected') or p_note is null or length(btrim(p_note)) not between 10 and 2000 then raise exception 'Décision et justification requises' using errcode='22023';end if;
 select * into c from public.directory_claims where id=p_claim_id for update;
 if not found or c.status<>'pending' then raise exception 'Demande absente ou déjà traitée' using errcode='22023';end if;
 if p_decision='accepted' then
  if not exists(select 1 from public.merchants m where m.id=p_merchant_id and m.owner_id=c.claimant_user_id and m.siret=c.siret) then raise exception 'Le compte professionnel et le SIRET doivent correspondre' using errcode='22023';end if;
  update public.directory_businesses set linked_merchant_id=p_merchant_id where siret=c.siret;
 end if;
 update public.directory_claims set status=p_decision,review_note=btrim(p_note),reviewed_by=auth.uid(),updated_at=now() where id=c.id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'review_directory_claim','directory_claim',c.id::text,jsonb_build_object('decision',p_decision,'reason',p_note,'siret',c.siret));
end;$function$

;
drop view if exists public.public_merchants;
drop function if exists public.merchant_legal_name(public.merchants), public.merchant_siret(public.merchants),
  public.merchant_vat_number(public.merchants), public.merchant_contact_email(public.merchants),
  public.merchant_phone(public.merchants), public.merchant_public_phone(public.merchants), public.merchant_payment_link(public.merchants),
  public.has_payment_link(public.merchants);
drop function if exists public.can_see_merchant_private(uuid, boolean);
drop function if exists public.route_merchant_private();
drop table public.merchant_private;
alter table public.merchants drop column public_phone, drop column public_phone_authorized;
delete from supabase_migrations.schema_migrations where version = '20261029120000';

-- Contrôle : plus aucun commerce publié ; la liste des commerces à republier est conservée.
do $$ begin
  if exists (select 1 from public.merchants where is_published) then raise exception 'Un commerce est encore publié : abandon'; end if;
end $$;
select (select count(*) from admin_private.rollback_published_snapshot) as commerces_a_republier,
       (select count(*) from public.merchants where is_published) as commerces_publies_maintenant;
commit;
reset zeeroo.confirm_rollback;
