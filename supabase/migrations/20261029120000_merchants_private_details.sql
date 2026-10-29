-- Données administratives des commerces : fermées à l'API publique (merchants = présentation publique).
--
-- Avant : `merchants.legal_name / siret / vat_number / contact_email / phone / payment_link` étaient
-- lisibles par `anon` et `authenticated` pour tout commerce publié (colonnes de la ligne, RLS par ligne
-- seulement). Un masquage par privilèges de colonnes est impossible ici : les colonnes calculées
-- (`is_open_now`, `merchant_address_line`, ...) prennent la ligne entière en argument et exigent
-- le droit de lecture sur toutes les colonnes.
--
-- Après : ces six valeurs vivent dans `merchant_private`, table fermée (aucun droit pour
-- `anon` / `authenticated`, RLS sans politique), comme `merchant_locations`. Elles ne sont rendues que
-- par des colonnes calculées `security definer` (`merchant_siret`, ...), selon qui demande :
--   * propriétaire du commerce et administrateurs : tout ;
--   * client ayant commandé, livreur rattaché : téléphone et lien de paiement ;
--   * tous les autres, anonymes compris : `null`.
-- Les colonnes de `merchants` restent écrivables (création, modification par le propriétaire,
-- console admin) : des déclencheurs envoient la valeur vers `merchant_private` et laissent `null`
-- dans `merchants`. Aucune donnée n'est supprimée : elles sont recopiées avant d'être vidées.
-- Retour arrière : docs/production/merchants_private_ROLLBACK.sql.

-- Numéro professionnel public : distinct du téléphone de contact privé, publié seulement si le
-- restaurateur l'autorise (`public_phone_authorized`, faux par défaut). Le numéro lui-même vit dans
-- merchant_private ; l'autorisation est un simple booléen non sensible.
alter table public.merchants
  add column public_phone text,
  add column public_phone_authorized boolean not null default false;

create table public.merchant_private (
  merchant_id   uuid primary key references public.merchants (id) on delete cascade
                     deferrable initially deferred,
  legal_name    text check (char_length(legal_name) between 2 and 120),
  siret         text check (siret is null or public.is_valid_siret(siret)),
  vat_number    text check (vat_number ~ '^FR[0-9A-Z]{2}[0-9]{9}$'),
  contact_email text check (contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 120),
  phone         text check (char_length(phone) <= 20),
  public_phone  text check (char_length(public_phone) <= 20),
  payment_link  text check (payment_link ~ '^https://[^[:space:]]{4,}$' and char_length(payment_link) <= 500)
);
alter table public.merchant_private enable row level security;
revoke all on public.merchant_private from anon, authenticated;

insert into public.merchant_private (merchant_id, legal_name, siret, vat_number, contact_email, phone, payment_link)
select id, legal_name, siret, vat_number, contact_email, phone, payment_link
from public.merchants
where coalesce(legal_name, siret, vat_number, contact_email, phone, payment_link) is not null;

-- « Encaissement configuré » lit désormais la table fermée (avant le vidage des colonnes).
create or replace function public.is_payments_ready(m public.merchants)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchant_private p where p.merchant_id = m.id and p.payment_link is not null)
         or m.accepts_cash_pickup;
$$;

-- Écriture : la valeur part vers merchant_private, la colonne de merchants reste null.
-- Un déclencheur par colonne : « UPDATE OF » permet de distinguer « effacé » de « non modifié ».
-- Noms en « a00_ » : ils passent avant les contrôles (mode de commande, publication, ...) qui lisent
-- merchant_private.
create function public.route_merchant_private()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  col text := tg_argv[0];
  val text := to_jsonb(new) ->> col;
begin
  if tg_op = 'INSERT' and val is null then return new; end if;
  execute format(
    'insert into public.merchant_private (merchant_id, %1$I) values ($1, $2)
       on conflict (merchant_id) do update set %1$I = excluded.%1$I', col)
    using new.id, val;
  new := jsonb_populate_record(new, jsonb_build_object(col, null));
  return new;
end;
$$;
revoke execute on function public.route_merchant_private() from public, anon, authenticated;

do $$
declare c text;
begin
  foreach c in array array['legal_name', 'siret', 'vat_number', 'contact_email', 'phone', 'public_phone', 'payment_link'] loop
    execute format(
      'create trigger %I before insert or update of %I on public.merchants
         for each row execute function public.route_merchant_private(%L)',
      'a00_merchants_private_' || c, c, c);
  end loop;
end $$;

-- Vidage des colonnes de merchants (les valeurs sont dans merchant_private).
update public.merchants
set legal_name = null, siret = null, vat_number = null, contact_email = null, phone = null, payment_link = null
where coalesce(legal_name, siret, vat_number, contact_email, phone, payment_link) is not null;

-- Colonnes calculées lues par l'app avec un alias (`siret:merchant_siret`, ...).
create function public.can_see_merchant_private(p_merchant_id uuid, p_contact boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.merchants m where m.id = p_merchant_id and m.owner_id = (select auth.uid()))
    or public.is_platform_admin()
    or (p_contact and (
      exists (select 1 from public.orders o where o.merchant_id = p_merchant_id and o.customer_id = (select auth.uid()))
      or exists (select 1 from public.merchant_couriers l
                 where l.merchant_id = p_merchant_id and l.courier_id = public.current_courier_id())
      or exists (select 1 from public.orders o
                 where o.merchant_id = p_merchant_id and o.courier_id is not null and o.courier_id = public.current_courier_id())
    ))
  );
$$;
revoke execute on function public.can_see_merchant_private(uuid, boolean) from public, anon, authenticated;

create function public.merchant_legal_name(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.legal_name from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, false);
$$;
create function public.merchant_siret(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.siret from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, false);
$$;
create function public.merchant_vat_number(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.vat_number from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, false);
$$;
create function public.merchant_contact_email(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.contact_email from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, false);
$$;
create function public.merchant_phone(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.phone from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, true);
$$;
create function public.merchant_payment_link(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.payment_link from public.merchant_private p where p.merchant_id = m.id and public.can_see_merchant_private(m.id, true);
$$;
-- Numéro professionnel : public seulement si le restaurateur l'a autorisé ; sinon propriétaire et administrateurs.
create function public.merchant_public_phone(m public.merchants) returns text language sql stable security definer set search_path = '' as $$
  select p.public_phone from public.merchant_private p
  where p.merchant_id = m.id and (m.public_phone_authorized or public.can_see_merchant_private(m.id, false));
$$;
-- Information non sensible : le restaurant accepte-t-il le paiement par carte (lien configuré) ?
create function public.has_payment_link(m public.merchants) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchant_private p where p.merchant_id = m.id and p.payment_link is not null);
$$;
grant execute on function public.merchant_legal_name, public.merchant_siret, public.merchant_vat_number,
  public.merchant_contact_email, public.merchant_phone, public.merchant_public_phone, public.merchant_payment_link,
  public.has_payment_link
  to anon, authenticated;

-- Lectures internes qui lisaient les colonnes vidées.
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
    select m.owner_id, jsonb_build_object('id', m.id, 'owner_id', m.owner_id, 'name', m.name, 'slug', m.slug, 'description', m.description, 'category', m.category, 'phone', mp.phone, 'contact_email', mp.contact_email, 'legal_name', mp.legal_name, 'siret', mp.siret, 'vat_number', mp.vat_number, 'address_line', m.address_line, 'postal_code', m.postal_code, 'city', m.city, 'latitude', m.latitude, 'longitude', m.longitude, 'timezone', m.timezone, 'photo_url', m.photo_url, 'logo_url', m.logo_url, 'tagline', m.tagline, 'about', m.about, 'accent_color', m.accent_color, 'is_published', m.is_published, 'is_paused', m.is_paused, 'paused_until', m.paused_until, 'created_at', m.created_at, 'updated_at', m.updated_at, 'delivery_enabled', m.delivery_enabled, 'delivery_fee_cents', m.delivery_fee_cents, 'delivery_radius_m', m.delivery_radius_m, 'accepts_cash_pickup', m.accepts_cash_pickup, 'offers_pickup', m.offers_pickup, 'pickup_instructions', m.pickup_instructions, 'default_prep_minutes', m.default_prep_minutes, 'payment_link', mp.payment_link, 'group_orders_enabled', m.group_orders_enabled, 'group_min_lead_hours', m.group_min_lead_hours, 'group_min_headcount', m.group_min_headcount, 'group_min_total_cents', m.group_min_total_cents, 'marketing_consent', m.marketing_consent, 'marketing_consent_at', m.marketing_consent_at) into account_id,entity from public.merchants m left join public.merchant_private mp on mp.merchant_id=m.id where m.id=p_id;
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
$function$;

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
  if not exists(select 1 from public.merchants m join public.merchant_private mp on mp.merchant_id=m.id where m.id=p_merchant_id and m.owner_id=c.claimant_user_id and mp.siret=c.siret) then raise exception 'Le compte professionnel et le SIRET doivent correspondre' using errcode='22023';end if;
  update public.directory_businesses set linked_merchant_id=p_merchant_id where siret=c.siret;
 end if;
 update public.directory_claims set status=p_decision,review_note=btrim(p_note),reviewed_by=auth.uid(),updated_at=now() where id=c.id;
 insert into public.admin_audit_logs(actor_user_id,action,target_type,target_id,details) values(auth.uid(),'review_directory_claim','directory_claim',c.id::text,jsonb_build_object('decision',p_decision,'reason',p_note,'siret',c.siret));
end;$function$;

-- Projection publique : seulement ce qui présente un restaurant affilié à ses clients. Pour les
-- consommateurs externes de l'API (site, QR codes) ; aucune donnée administrative ni de contact.
create view public.public_merchants with (security_invoker = false) as
select m.id, m.slug, m.name, m.description, m.category, m.postal_code, m.city,
       m.photo_url, m.logo_url, m.tagline, m.about, m.accent_color,
       m.offers_pickup, m.delivery_enabled,
       public.merchant_address_line(m) as address_line,
       public.has_minisite(m) as has_minisite,
       public.merchant_public_phone(m) as public_phone
from public.merchants m
where m.is_published and m.admin_status = 'active';
revoke all on public.public_merchants from public, anon, authenticated;
grant select on public.public_merchants to anon, authenticated;
