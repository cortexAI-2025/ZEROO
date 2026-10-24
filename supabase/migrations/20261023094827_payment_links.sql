-- Paiements directs par le lien de paiement de chaque professionnel.
--
-- ZeeRoo n'encaisse rien et n'utilise plus Stripe pour les commandes (Stripe ne sert qu'aux
-- abonnements, encaissés par AiWorkPay). Chaque restaurant et chaque livreur renseigne son
-- propre lien de paiement (SumUp, PayPal, Stripe Payment Link, Lydia Pro…), dont la page
-- accepte la carte, Apple Pay et Google Pay ; l'argent arrive sur son compte bancaire.
--
--  * La commande part au restaurant sans paiement préalable.
--  * Repas par carte : une fois la commande acceptée, le client paie via le lien du restaurant,
--    indique « J'ai payé », et le restaurant confirme la réception. Espèces au comptoir :
--    payé au retrait.
--  * Livraison par carte : quand un livreur prend la mission, le client paie via le lien du
--    livreur, puis le livreur confirme. Espèces : payées à la livraison.
--  * Plus de délai de paiement de 5 minutes : le restaurant et le livreur voient l'état du
--    paiement et décident de la remise.

alter table public.merchants
  add column payment_link text check (payment_link ~ '^https://[^[:space:]]{4,}$' and char_length(payment_link) <= 500);
alter table public.couriers
  add column payment_link text check (payment_link ~ '^https://[^[:space:]]{4,}$' and char_length(payment_link) <= 500);

grant update (payment_link) on public.merchants to authenticated;
grant update (payment_link) on public.couriers to authenticated;

alter table public.orders
  add column meal_payment_declared_at     timestamptz,  -- le client indique avoir payé le repas
  add column delivery_payment_declared_at timestamptz;  -- le client indique avoir payé la livraison

-- Le restaurant peut encaisser : un lien de paiement, ou les espèces au comptoir.
create or replace function public.is_payments_ready(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.payment_link is not null or m.accepts_cash_pickup;
$$;

-- Livreur actif : abonnement en cours et lien de paiement renseigné.
create or replace function public.is_courier_active(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.couriers c where c.id = p_courier_id and c.payment_link is not null)
     and exists (select 1 from public.courier_subscriptions s
                 where s.courier_id = p_courier_id and s.status in ('trialing', 'active'));
$$;

create or replace function public.set_courier_availability(p_available boolean)
returns public.couriers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := public.current_courier_id();
  v_courier public.couriers;
begin
  if v_id is null then
    raise exception 'courier_profile_required' using errcode = '42501';
  end if;
  if p_available then
    if not exists (select 1 from public.couriers where id = v_id and payment_link is not null) then
      raise exception 'courier_payment_link_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.courier_subscriptions
                   where courier_id = v_id and status in ('trialing', 'active')) then
      raise exception 'courier_subscription_inactive' using errcode = '22023';
    end if;
    if not exists (select 1 from public.merchant_couriers where courier_id = v_id and status = 'approved') then
      raise exception 'courier_no_merchant' using errcode = '22023';
    end if;
  end if;
  update public.couriers set is_available = p_available where id = v_id returning * into v_courier;
  return v_courier;
end;
$$;

-- Le premier livreur qui accepte obtient la course (plus de délai de paiement).
create or replace function public.courier_accept_mission(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.couriers;
  v_order public.orders;
begin
  select * into v_courier from public.couriers where user_id = auth.uid() for update;
  if v_courier.id is null then
    raise exception 'courier_not_found' using errcode = 'P0002';
  end if;
  if not v_courier.is_available or not public.is_courier_active(v_courier.id) then
    raise exception 'courier_unavailable' using errcode = '22023';
  end if;
  if public.courier_at_capacity(v_courier.id) then
    raise exception 'courier_at_capacity' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = p_order_id and o.fulfillment = 'delivery' and o.courier_id is null
    and o.status in ('accepted', 'preparing', 'ready')
    and exists (select 1 from public.merchant_couriers l
                where l.merchant_id = o.merchant_id and l.courier_id = v_courier.id and l.status = 'approved')
    and not exists (select 1 from public.order_courier_skips s where s.order_id = o.id and s.courier_id = v_courier.id)
  for update skip locked;
  if v_order.id is null then
    raise exception 'mission_unavailable' using errcode = 'P0002';
  end if;

  update public.orders
  set courier_id = v_courier.id,
      courier_name = split_part(v_courier.display_name, ' ', 1),
      courier_accepted_at = now(),
      delivery_payment_due_at = null,
      delivery_payment_declared_at = null
  where id = p_order_id
  returning * into v_order;
  update public.couriers set last_assigned_at = now() where id = v_courier.id;
  return v_order;
end;
$$;

-- Le livreur renonce à une course qu'il a prise, tant qu'il n'a pas confirmé le paiement ni
-- récupéré la commande. Le paiement déclaré par le client est remis à zéro (nouveau livreur).
create or replace function public.courier_release_mission(p_order_id uuid, p_actor uuid)
returns table (delivery_payment_intent_id text, courier_stripe_account_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select o.* into v_order
  from public.orders o
  join public.couriers c on c.id = o.courier_id and c.user_id = p_actor
  where o.id = p_order_id
  for update of o;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'preparing', 'ready') or v_order.delivery_paid_at is not null then
    raise exception 'mission_locked' using errcode = '22023';
  end if;
  update public.orders set delivery_payment_declared_at = null where id = p_order_id;
  return query select * from public.release_mission_core(p_order_id, 'released');
end;
$$;

-- Plus de délai de paiement : rien à libérer (la fonction reste appelée par expire-orders).
create or replace function public.expire_unpaid_missions()
returns table (order_id uuid, delivery_payment_intent_id text, courier_stripe_account_id text)
language sql
security definer
set search_path = ''
as $$
  select null::uuid, null::text, null::text where false;
$$;

-- =============================================================================
-- Déclaration et confirmation des paiements
-- =============================================================================

-- Le client indique avoir payé le repas (après acceptation) ou la livraison (livreur assigné).
create or replace function public.customer_declare_payment(p_order_id uuid, p_kind text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
  where id = p_order_id and customer_id = (select auth.uid())
  for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_kind = 'meal' then
    if v_order.meal_payment_method <> 'card' or v_order.paid_at is not null
       or v_order.status not in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'collected', 'delivered') then
      raise exception 'payment_not_expected' using errcode = '22023';
    end if;
    update public.orders set meal_payment_declared_at = coalesce(meal_payment_declared_at, now())
    where id = p_order_id returning * into v_order;
  elsif p_kind = 'delivery' then
    if v_order.fulfillment <> 'delivery' or v_order.courier_id is null
       or v_order.delivery_payment_method <> 'card' or v_order.delivery_paid_at is not null
       or v_order.status not in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered') then
      raise exception 'payment_not_expected' using errcode = '22023';
    end if;
    update public.orders set delivery_payment_declared_at = coalesce(delivery_payment_declared_at, now())
    where id = p_order_id returning * into v_order;
  else
    raise exception 'invalid_payment_kind' using errcode = '22023';
  end if;
  return v_order;
end;
$$;

-- Le restaurant confirme avoir reçu le paiement du repas (carte via son lien, ou espèces).
create or replace function public.merchant_confirm_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not public.is_merchant_owner(v_order.merchant_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'collected', 'delivered') then
    raise exception 'payment_not_expected' using errcode = '22023';
  end if;
  update public.orders set paid_at = coalesce(paid_at, now())
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

-- Le livreur confirme avoir reçu le paiement de la livraison.
create or replace function public.courier_confirm_delivery_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders
  where id = p_order_id and courier_id is not null and courier_id = public.current_courier_id()
  for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered') then
    raise exception 'payment_not_expected' using errcode = '22023';
  end if;
  update public.orders
  set delivery_paid_at = coalesce(delivery_paid_at, now()),
      delivery_authorized_at = coalesce(delivery_authorized_at, now())
  where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.customer_declare_payment, public.merchant_confirm_payment,
  public.courier_confirm_delivery_payment from public, anon;
grant execute on function public.customer_declare_payment, public.merchant_confirm_payment,
  public.courier_confirm_delivery_payment to authenticated;

-- Le client voit son livreur : prénom, photo, véhicule, note et lien de paiement.
drop function public.order_courier_profile(uuid);
create function public.order_courier_profile(p_order_id uuid)
returns table (display_name text, photo_url text, vehicle public.courier_vehicle,
               average numeric, reviews_count int, payment_link text)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(c.display_name, ' ', 1), c.photo_url, c.vehicle,
         (select round(avg(r.courier_stars), 1) from public.order_reviews r
          where r.courier_id = c.id and r.courier_stars is not null),
         (select count(*)::int from public.order_reviews r
          where r.courier_id = c.id and r.courier_stars is not null),
         c.payment_link
  from public.orders o
  join public.couriers c on c.id = o.courier_id
  where o.id = p_order_id
    and o.customer_id = (select auth.uid());
$$;

revoke execute on function public.order_courier_profile from public, anon;
grant execute on function public.order_courier_profile to authenticated;

-- =============================================================================
-- Transitions de statut : plus de blocage « livraison non payée » à la remise ; espèces
-- encaissées au retrait ou à la livraison.
-- =============================================================================

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
  is_courier boolean;
  v_cancelled_by text;
  updated public.orders;
begin
  select * into current_order from public.orders where id = p_order_id for update;
  if current_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select exists (
    select 1 from public.merchants where id = current_order.merchant_id and owner_id = p_actor
  ) into is_owner;
  select exists (
    select 1 from public.couriers where id = current_order.courier_id and user_id = p_actor
  ) into is_courier;

  if p_status = 'cancelled' then
    if current_order.customer_id is not distinct from p_actor and p_actor is not null then
      -- Annulation par le client, tant que le commerçant n'a pas accepté.
      if current_order.status not in ('pending_payment', 'placed') then
        raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
      end if;
      v_cancelled_by := 'customer';
    else
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
  elsif p_status = 'expired' then
    if current_order.status not in ('pending_payment', 'placed') then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    v_cancelled_by := 'system';
  elsif p_status = 'delivered' then
    if not is_courier then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if current_order.status <> 'out_for_delivery' then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    if trim(coalesce(p_pickup_code, '')) <> current_order.delivery_code then
      raise exception 'invalid_delivery_code' using errcode = '22023';
    end if;
  else
    if not is_owner then
      raise exception 'order_not_found' using errcode = 'P0002';
    end if;
    if not (
      (current_order.status = 'placed' and p_status in ('accepted', 'refused'))
      or (current_order.status = 'accepted' and p_status in ('preparing', 'ready'))
      or (current_order.status = 'preparing' and p_status = 'ready')
      or (current_order.status = 'ready' and current_order.fulfillment = 'pickup' and p_status = 'collected')
      or (current_order.status = 'ready' and current_order.fulfillment = 'delivery' and p_status = 'out_for_delivery')
    ) then
      raise exception 'invalid_transition: % -> %', current_order.status, p_status using errcode = '22023';
    end if;
    if p_status = 'refused' then
      v_cancelled_by := 'merchant';
    end if;
  end if;

  if p_status = 'accepted' and (p_prep_minutes is null or p_prep_minutes not between 1 and 180) then
    raise exception 'prep_minutes_required' using errcode = '22023';
  end if;

  -- Remise au livreur : un livreur doit avoir pris la course.
  if p_status = 'out_for_delivery' and current_order.courier_id is null then
    raise exception 'courier_not_assigned' using errcode = '22023';
  end if;

  -- Retrait par le client ou remise au livreur : code de retrait de la commande.
  if p_status in ('collected', 'out_for_delivery')
     and upper(trim(coalesce(p_pickup_code, ''))) <> current_order.pickup_code then
    raise exception 'invalid_pickup_code' using errcode = '22023';
  end if;

  update public.orders
  set status              = p_status,
      prep_minutes        = case when p_status = 'accepted' then p_prep_minutes else prep_minutes end,
      accepted_at         = case when p_status = 'accepted' then now() else accepted_at end,
      -- Espèces : encaissé au comptoir (retrait) ou à la porte (livraison). Carte : confirmé
      -- par le professionnel (merchant_confirm_payment, courier_confirm_delivery_payment).
      paid_at             = case when p_status = 'collected' and meal_payment_method = 'cash' then coalesce(paid_at, now())
                                 else paid_at end,
      delivery_paid_at    = case when p_status = 'delivered' and delivery_payment_method = 'cash'
                                 then coalesce(delivery_paid_at, now())
                                 else delivery_paid_at end,
      estimated_ready_at  = case when p_status = 'accepted' then now() + make_interval(mins => p_prep_minutes)
                                 else estimated_ready_at end,
      refusal_reason      = case when p_status = 'refused' then nullif(trim(p_refusal_reason), '') else refusal_reason end,
      cancelled_at        = case when p_status in ('refused', 'cancelled', 'expired') then now() else cancelled_at end,
      cancelled_by        = coalesce(v_cancelled_by, cancelled_by),
      ready_at            = case when p_status = 'ready' then now() else ready_at end,
      collected_at        = case when p_status = 'collected' then now() else collected_at end,
      out_for_delivery_at = case when p_status = 'out_for_delivery' then now() else out_for_delivery_at end,
      delivered_at        = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_order_id
  returning * into updated;

  return updated;
end;
$$;

revoke execute on function public.apply_order_transition from public, anon, authenticated;
grant execute on function public.apply_order_transition to service_role;
