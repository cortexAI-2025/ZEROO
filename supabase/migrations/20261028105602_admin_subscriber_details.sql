-- Detail retrieval checks the administrator membership on every call.
-- No password hashes, tokens, MFA material or card/bank details are returned.
create schema admin_private;
revoke all on schema admin_private from public, anon;
grant usage on schema admin_private to authenticated;

create function admin_private.subscriber_details(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
$$;
revoke all on function admin_private.subscriber_details(text,uuid) from public,anon;
grant execute on function admin_private.subscriber_details(text,uuid) to authenticated;

create function public.admin_subscriber_details(p_kind text,p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select admin_private.subscriber_details(p_kind,p_id);
$$;
revoke all on function public.admin_subscriber_details(text,uuid) from public,anon;
grant execute on function public.admin_subscriber_details(text,uuid) to authenticated;
