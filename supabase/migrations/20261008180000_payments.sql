-- Étape (d) : paiements Stripe.
--   • Stripe Connect : le client paie directement le commerçant (charge directe,
--     aucune commission plateforme). Le paiement est autorisé à la commande et
--     capturé seulement quand le commerçant accepte.
--   • Stripe Billing : abonnement commerçant 9,99 €/mois, 30 jours d'essai.
-- Toutes les écritures de cette migration passent par les Edge Functions (service role).

-- =============================================================================
-- Comptes Stripe Connect des commerçants
-- =============================================================================

create table public.merchant_stripe_accounts (
  merchant_id       uuid primary key references public.merchants (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  updated_at        timestamptz not null default now()
);

create trigger merchant_stripe_accounts_set_updated_at
  before update on public.merchant_stripe_accounts
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Abonnements
-- =============================================================================

create type public.subscription_status as enum (
  'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
);

create table public.subscriptions (
  merchant_id            uuid primary key references public.merchants (id) on delete cascade,
  stripe_customer_id     text not null unique,
  stripe_subscription_id text unique,
  status                 public.subscription_status not null default 'incomplete',
  trial_end              timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_used             boolean not null default false,  -- un seul essai gratuit par commerce
  updated_at             timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Le commerçant lit l'état de ses paiements et de son abonnement ; personne n'écrit côté client.
alter table public.merchant_stripe_accounts enable row level security;
alter table public.subscriptions enable row level security;
revoke all on public.merchant_stripe_accounts, public.subscriptions from anon, authenticated;
grant select on public.merchant_stripe_accounts, public.subscriptions to authenticated;

create policy "merchant_stripe_accounts: lecture par le propriétaire"
  on public.merchant_stripe_accounts for select
  to authenticated
  using (public.is_merchant_owner(merchant_id));

create policy "subscriptions: lecture par le propriétaire"
  on public.subscriptions for select
  to authenticated
  using (public.is_merchant_owner(merchant_id));

-- Idempotence du webhook Stripe : chaque événement n'est traité qu'une fois.
create table public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- =============================================================================
-- Conditions pour recevoir des commandes
-- =============================================================================

create or replace function public.is_payments_ready(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant_stripe_accounts a
    where a.merchant_id = m.id and a.charges_enabled
  );
$$;

-- « past_due » (prélèvement en échec, Stripe relance) bloque aussi : la règle métier
-- exige un abonnement en règle pour encaisser.
create or replace function public.is_subscription_active(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.merchant_id = m.id and s.status in ('trialing', 'active')
  );
$$;

create or replace function public.is_accepting_orders(m public.merchants)
returns boolean
language sql
stable
set search_path = ''
as $$
  select m.is_published
     and not public.is_paused_now(m)
     and public.is_open_now(m)
     and public.is_payments_ready(m)
     and public.is_subscription_active(m);
$$;

-- =============================================================================
-- Commandes payées
-- =============================================================================

alter table public.orders
  add column stripe_account_id          text,
  add column stripe_payment_intent_id   text unique,
  add column stripe_checkout_session_id text unique,
  add column paid_at                    timestamptz;  -- paiement capturé (acceptation)

-- La création de commande n'est plus accessible directement aux clients :
-- l'Edge Function create-order l'appelle avec le service role, puis crée le paiement.
drop function public.create_order(uuid, jsonb, text);

create or replace function public.create_order(
  p_customer_id uuid,
  p_merchant_id uuid,
  p_items jsonb,
  p_customer_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_order public.orders;
  v_line jsonb;
  v_item public.menu_items;
  v_quantity int;
  v_option_ids uuid[];
  v_valid_count int;
  v_options jsonb;
  v_unit int;
  v_subtotal int := 0;
  v_group record;
begin
  if p_customer_id is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchants where id = p_merchant_id;
  if v_merchant.id is null or not public.is_accepting_orders(v_merchant) then
    raise exception 'merchant_not_accepting' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;
  if char_length(p_customer_note) > 300 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  insert into public.orders (merchant_id, customer_id, customer_name, status, subtotal_cents, total_cents,
                             customer_note, stripe_account_id)
  values (
    p_merchant_id, p_customer_id,
    (select display_name from public.profiles where id = p_customer_id),
    'pending_payment', 0, 0, nullif(trim(p_customer_note), ''),
    (select stripe_account_id from public.merchant_stripe_accounts where merchant_id = p_merchant_id)
  )
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(p_items) loop
    -- Produit disponible, dans une catégorie visible de ce commerce.
    select i.* into v_item
    from public.menu_items i
    join public.menu_categories c on c.id = i.category_id
    where i.id = (v_line ->> 'item_id')::uuid
      and i.merchant_id = p_merchant_id
      and i.is_available
      and c.is_active;
    if v_item.id is null then
      raise exception 'item_unavailable' using errcode = '22023';
    end if;

    v_quantity := coalesce((v_line ->> 'quantity')::int, 0);
    if v_quantity not between 1 and 50 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    v_option_ids := coalesce(
      (select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]')) x),
      '{}'
    );

    -- Chaque option doit exister, être disponible et appartenir à un groupe de ce produit.
    select count(*) into v_valid_count
    from public.menu_options o
    join public.menu_option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids) and o.is_available and g.item_id = v_item.id;
    if v_valid_count <> coalesce(array_length(v_option_ids, 1), 0) then
      raise exception 'invalid_options' using errcode = '22023';
    end if;

    -- Respect du minimum et du maximum de chaque groupe.
    for v_group in
      select g.id, g.min_select, g.max_select,
             (select count(*) from public.menu_options o where o.group_id = g.id and o.id = any (v_option_ids)) as chosen
      from public.menu_option_groups g
      where g.item_id = v_item.id
    loop
      if v_group.chosen < v_group.min_select or v_group.chosen > v_group.max_select then
        raise exception 'invalid_options' using errcode = '22023';
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'name', o.name, 'price_delta_cents', o.price_delta_cents)
                              order by g.position, o.position), '[]'),
           v_item.price_cents + coalesce(sum(o.price_delta_cents), 0)
    into v_options, v_unit
    from public.menu_options o
    join public.menu_option_groups g on g.id = o.group_id
    where o.id = any (v_option_ids);

    insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options, line_total_cents)
    values (v_order.id, v_item.id, v_item.name, v_unit, v_quantity, v_options, v_unit * v_quantity);

    v_subtotal := v_subtotal + v_unit * v_quantity;
  end loop;

  update public.orders
  set subtotal_cents = v_subtotal, total_cents = v_subtotal
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, text) to service_role;

-- Paiement autorisé (webhook ou vérification après la feuille de paiement) : la
-- commande part chez le commerçant. Idempotent : sans effet si déjà traitée.
create or replace function public.mark_order_authorized(p_order_id uuid, p_payment_intent_id text)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set status = 'placed',
      placed_at = now(),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_payment_intent_id)
  where id = p_order_id and status = 'pending_payment'
  returning *;
$$;

-- Paiement échoué ou abandonné.
create or replace function public.mark_order_payment_failed(p_order_id uuid)
returns public.orders
language sql
security definer
set search_path = ''
as $$
  update public.orders
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_id and status = 'pending_payment'
  returning *;
$$;

-- =============================================================================
-- Transitions de statut
-- =============================================================================

-- Moteur commun des transitions. p_actor est le commerçant (ou le client pour une
-- annulation), vérifié ici ; l'appelant (Edge Function ou wrapper SQL) a déjà
-- authentifié l'utilisateur.
create or replace function public.apply_order_transition(
  p_order_id uuid,
  p_actor uuid,
  p_status public.order_status,
  p_prep_minutes int default null,
  p_refusal_reason text default null,
  p_pickup_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
  is_owner boolean;
  updated public.orders;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  select exists (
    select 1 from public.merchants where id = current_order.merchant_id and owner_id = p_actor
  ) into is_owner;

  if current_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if p_status = 'cancelled' then
    -- Annulation par le client, tant que le commerçant n'a pas accepté.
    if current_order.customer_id is distinct from p_actor then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if current_order.status not in ('pending_payment', 'placed') then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
  elsif p_status = 'expired' then
    if current_order.status not in ('pending_payment', 'placed') then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
  else
    if not is_owner then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if not (
      (current_order.status = 'placed' and p_status in ('accepted', 'refused'))
      or (current_order.status = 'accepted' and p_status in ('preparing', 'ready'))
      or (current_order.status = 'preparing' and p_status = 'ready')
      or (current_order.status = 'ready' and p_status = 'collected')
    ) then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
  end if;

  if p_status = 'accepted' and (p_prep_minutes is null or p_prep_minutes not between 1 and 180) then
    raise exception 'prep_minutes_required' using errcode = '22023';
  end if;

  if p_status = 'collected'
     and upper(trim(coalesce(p_pickup_code, ''))) <> current_order.pickup_code then
    raise exception 'invalid_pickup_code' using errcode = '22023';
  end if;

  update public.orders
  set status             = p_status,
      prep_minutes       = case when p_status = 'accepted' then p_prep_minutes else prep_minutes end,
      accepted_at        = case when p_status = 'accepted' then now() else accepted_at end,
      paid_at            = case when p_status = 'accepted' and stripe_payment_intent_id is not null then now()
                                else paid_at end,
      estimated_ready_at = case when p_status = 'accepted' then now() + make_interval(mins => p_prep_minutes)
                                else estimated_ready_at end,
      refusal_reason     = case when p_status = 'refused' then nullif(trim(p_refusal_reason), '') else refusal_reason end,
      cancelled_at       = case when p_status in ('refused', 'cancelled', 'expired') then now() else cancelled_at end,
      ready_at           = case when p_status = 'ready' then now() else ready_at end,
      collected_at       = case when p_status = 'collected' then now() else collected_at end
  where id = p_order_id
  returning * into updated;

  return updated;
end;
$$;

revoke execute on function public.apply_order_transition from public, anon, authenticated;
grant execute on function public.apply_order_transition to service_role;

-- Transitions directes du commerçant (préparation, prête, remise).
-- Accepter ou refuser passe par l'Edge Function order-decision : il faut d'abord
-- capturer ou annuler le paiement chez Stripe.
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_prep_minutes int default null,
  p_refusal_reason text default null,
  p_pickup_code text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('preparing', 'ready', 'collected') then
    raise exception 'payment_action_required' using errcode = '22023';
  end if;
  return public.apply_order_transition(p_order_id, auth.uid(), p_status, p_prep_minutes, p_refusal_reason, p_pickup_code);
end;
$$;

-- Commandes sans réponse à expirer : en attente du commerçant depuis p_placed_minutes,
-- ou paiement jamais finalisé depuis p_pending_minutes. Renvoie de quoi annuler chez Stripe.
create or replace function public.expire_stale_orders(p_placed_minutes int default 10, p_pending_minutes int default 30)
returns table (order_id uuid, stripe_account_id text, stripe_payment_intent_id text, stripe_checkout_session_id text)
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set status = case when o.status = 'placed' then 'expired'::public.order_status else 'cancelled'::public.order_status end,
      cancelled_at = now()
  where (o.status = 'placed' and o.placed_at < now() - make_interval(mins => p_placed_minutes))
     or (o.status = 'pending_payment' and o.created_at < now() - make_interval(mins => p_pending_minutes))
  returning o.id, o.stripe_account_id, o.stripe_payment_intent_id, o.stripe_checkout_session_id;
$$;

revoke execute on function public.mark_order_authorized, public.mark_order_payment_failed, public.expire_stale_orders
  from public, anon, authenticated;
grant execute on function public.mark_order_authorized, public.mark_order_payment_failed, public.expire_stale_orders
  to service_role;

-- =============================================================================
-- Planification : expiration des commandes chaque minute (pg_cron + pg_net)
-- =============================================================================
-- L'URL des fonctions et le secret partagé sont lus dans Supabase Vault :
--   select vault.create_secret('https://<projet>.supabase.co/functions/v1', 'functions_url');
--   select vault.create_secret('<secret aléatoire>', 'cron_secret');   -- = secret CRON_SECRET des fonctions
-- Sans ces secrets, la tâche ne fait rien.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.call_expire_orders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/expire-orders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$$;

revoke execute on function public.call_expire_orders from public, anon, authenticated;

select cron.schedule('expire-orders', '* * * * *', 'select public.call_expire_orders()');
