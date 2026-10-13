-- Étape (e) : fidélité.
-- Règle : chez un même commerçant, 9 menus formules payés et récupérés = 1 menu formule
-- offert. Seuls les produits marqués « menu formule » (menu_items.is_loyalty_menu)
-- comptent et peuvent être offerts ; les produits au détail ne comptent pas. Chaque menu
-- compte, même s'ils sont plusieurs dans une commande. Le menu offert ne compte pas ; ses
-- suppléments payants restent dus.

-- =============================================================================
-- Cartes de fidélité
-- =============================================================================

create table public.loyalty_cards (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  merchant_id       uuid not null references public.merchants (id) on delete cascade,
  paid_menus_count  int  not null default 0 check (paid_menus_count between 0 and 8),  -- progression vers le prochain menu offert
  rewards_available int  not null default 0 check (rewards_available >= 0),            -- menus offerts à utiliser
  rewards_redeemed  int  not null default 0 check (rewards_redeemed >= 0),
  updated_at        timestamptz not null default now(),
  primary key (user_id, merchant_id)
);

create trigger loyalty_cards_set_updated_at
  before update on public.loyalty_cards
  for each row execute function public.set_updated_at();

-- Lecture seule : le client voit ses cartes, le commerçant celles de ses clients.
-- Toutes les écritures passent par les triggers ci-dessous.
alter table public.loyalty_cards enable row level security;
revoke all on public.loyalty_cards from anon, authenticated;
grant select on public.loyalty_cards to authenticated;

create policy "loyalty_cards: le client voit ses cartes"
  on public.loyalty_cards for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "loyalty_cards: le commerçant voit les cartes de son commerce"
  on public.loyalty_cards for select
  to authenticated
  using (public.is_merchant_owner(merchant_id));

alter publication supabase_realtime add table public.loyalty_cards;

-- =============================================================================
-- Commandes : menu offert et décompte
-- =============================================================================

alter table public.order_items
  -- Instantané : le commerçant peut changer la case « menu formule » après coup.
  add column is_loyalty_menu   boolean not null default false,
  add column is_loyalty_reward boolean not null default false,  -- ligne du menu offert (quantité 1)
  add constraint order_items_reward_is_single_menu
    check (not is_loyalty_reward or (is_loyalty_menu and quantity = 1));

alter table public.orders
  add column is_loyalty_reward boolean not null default false,  -- un menu offert est utilisé
  add column loyalty_counted   boolean not null default false;  -- menus déjà ajoutés à la carte

-- Création de commande : p_items accepte « use_reward »: true sur une ligne de menu
-- formule. Une unité de cette ligne devient le menu offert (son prix de base est déduit,
-- ses suppléments restent dus). Le menu offert est réservé dès la création.
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
  v_discount int := 0;
  v_group record;
  v_use_reward boolean;
  v_reward_used boolean := false;
  v_card public.loyalty_cards;
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

    v_use_reward := coalesce((v_line ->> 'use_reward')::boolean, false);
    if v_use_reward then
      if v_reward_used then
        raise exception 'invalid_reward' using errcode = '22023';  -- un seul menu offert par commande
      end if;
      if not v_item.is_loyalty_menu then
        raise exception 'invalid_reward' using errcode = '22023';  -- produit au détail : non éligible
      end if;
      -- Verrou sur la carte : deux commandes simultanées ne peuvent pas utiliser le même menu offert.
      select * into v_card from public.loyalty_cards
      where user_id = p_customer_id and merchant_id = p_merchant_id
      for update;
      if v_card.user_id is null or v_card.rewards_available < 1 then
        raise exception 'no_reward_available' using errcode = '22023';
      end if;
      update public.loyalty_cards
      set rewards_available = rewards_available - 1
      where user_id = p_customer_id and merchant_id = p_merchant_id;

      insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                      line_total_cents, is_loyalty_menu, is_loyalty_reward)
      values (v_order.id, v_item.id, v_item.name, v_unit, 1, v_options, v_unit, true, true);
      v_subtotal := v_subtotal + v_unit;
      v_discount := v_item.price_cents;  -- le menu est offert, pas ses suppléments
      v_reward_used := true;
      v_quantity := v_quantity - 1;
    end if;

    if v_quantity > 0 then
      insert into public.order_items (order_id, menu_item_id, name, unit_price_cents, quantity, options,
                                      line_total_cents, is_loyalty_menu)
      values (v_order.id, v_item.id, v_item.name, v_unit, v_quantity, v_options, v_unit * v_quantity,
              v_item.is_loyalty_menu);
      v_subtotal := v_subtotal + v_unit * v_quantity;
    end if;
  end loop;

  -- Stripe n'accepte pas moins de 0,50 € : un reste inférieur est offert avec le menu.
  if v_reward_used and v_subtotal - v_discount < 50 then
    v_discount := v_subtotal;
  end if;

  update public.orders
  set subtotal_cents = v_subtotal,
      discount_cents = v_discount,
      total_cents = v_subtotal - v_discount,
      is_loyalty_reward = v_reward_used
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid, jsonb, text) to service_role;

-- Évolution de la carte selon le statut de la commande (même transaction que le changement
-- de statut, donc impossible de compter sans remettre la commande, ou l'inverse) :
--   • récupérée : les menus formules payés s'ajoutent à la carte, tous les 9 → 1 menu offert ;
--   • refusée, annulée, expirée : le menu offert réservé est rendu.
create or replace function public.apply_loyalty_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_menus int;
  v_total int;
begin
  if new.customer_id is null or new.status = old.status then
    return new;
  end if;

  if new.status = 'collected' and not new.loyalty_counted then
    select coalesce(sum(quantity), 0) into v_menus
    from public.order_items
    where order_id = new.id and is_loyalty_menu and not is_loyalty_reward;

    insert into public.loyalty_cards (user_id, merchant_id)
    values (new.customer_id, new.merchant_id)
    on conflict do nothing;

    select paid_menus_count + v_menus into v_total
    from public.loyalty_cards
    where user_id = new.customer_id and merchant_id = new.merchant_id
    for update;

    update public.loyalty_cards
    set paid_menus_count = v_total % 9,
        rewards_available = rewards_available + v_total / 9,
        rewards_redeemed = rewards_redeemed + case when new.is_loyalty_reward then 1 else 0 end
    where user_id = new.customer_id and merchant_id = new.merchant_id;

    new.loyalty_counted := true;
  elsif new.status in ('refused', 'cancelled', 'expired') and new.is_loyalty_reward
        and old.status in ('pending_payment', 'placed') then
    update public.loyalty_cards
    set rewards_available = rewards_available + 1
    where user_id = new.customer_id and merchant_id = new.merchant_id;
  end if;

  return new;
end;
$$;

create trigger orders_apply_loyalty
  before update of status on public.orders
  for each row execute function public.apply_loyalty_on_status_change();
