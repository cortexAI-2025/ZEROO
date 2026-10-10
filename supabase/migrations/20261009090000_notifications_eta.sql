-- Étape (f) : notifications push et « Je pars maintenant ».

-- =============================================================================
-- Appareils (jetons Expo Push)
-- =============================================================================

create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  expo_token   text not null unique check (expo_token ~ '^(Exponent|Expo)PushToken\[.+\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

create policy "push_tokens: chacun voit ses appareils"
  on public.push_tokens for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "push_tokens: chacun supprime ses appareils"
  on public.push_tokens for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Enregistre l'appareil pour l'utilisateur connecté. Un téléphone qui change de compte
-- est réattribué : les notifications suivent la personne connectée.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.push_tokens (user_id, expo_token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (expo_token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end;
$$;

revoke execute on function public.register_push_token from public, anon;
grant execute on function public.register_push_token to authenticated;

-- =============================================================================
-- « Je pars maintenant » : heure d'arrivée estimée du client
-- =============================================================================
-- La position du client sert uniquement au calcul du trajet dans l'Edge Function
-- customer-departure : elle n'est jamais enregistrée (RGPD), seule l'heure d'arrivée l'est.

create type public.travel_mode as enum ('walk', 'bike', 'drive');

alter table public.orders
  add column customer_departed_at timestamptz,          -- « Je pars maintenant »
  add column customer_eta_at      timestamptz,          -- arrivée estimée chez le commerçant
  add column customer_travel_mode public.travel_mode;

create or replace function public.set_customer_departure(
  p_order_id uuid,
  p_customer_id uuid,
  p_travel_seconds int,
  p_mode public.travel_mode
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set customer_departed_at = now(),
      customer_eta_at = now() + make_interval(secs => greatest(p_travel_seconds, 0)),
      customer_travel_mode = p_mode
  where id = p_order_id
    and customer_id = p_customer_id
    and status in ('placed', 'accepted', 'preparing', 'ready')
  returning * into v_order;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return v_order;
end;
$$;

revoke execute on function public.set_customer_departure from public, anon, authenticated;
grant execute on function public.set_customer_departure to service_role;

-- =============================================================================
-- Notifications sur changement de statut
-- =============================================================================
-- Chaque changement de statut utile appelle l'Edge Function notify-order-update
-- (pg_net, asynchrone : n'allonge ni ne bloque la transaction). URL et secret partagé
-- sont lus dans Vault, comme pour l'expiration (functions_url, cron_secret).

-- Appel interne d'une Edge Function depuis la base. Sans secrets Vault : ne fait rien.
create or replace function public.call_internal_function(p_name text, p_body jsonb)
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
    url := v_url || '/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := p_body
  );
end;
$$;

revoke execute on function public.call_internal_function from public, anon, authenticated;

create or replace function public.call_expire_orders()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.call_internal_function('expire-orders', '{}'::jsonb);
$$;

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  -- pending_payment n'intéresse personne ; preparing et collected sont visibles dans l'app.
  if new.status in ('placed', 'accepted', 'ready', 'refused', 'expired', 'cancelled') then
    perform public.call_internal_function(
      'notify-order-update',
      jsonb_build_object(
        'order_id', new.id,
        'status', new.status,
        'previous_status', case when tg_op = 'UPDATE' then old.status end
      )
    );
  end if;
  return null;
end;
$$;

create trigger orders_notify_status_change
  after insert or update of status on public.orders
  for each row execute function public.notify_order_status_change();
