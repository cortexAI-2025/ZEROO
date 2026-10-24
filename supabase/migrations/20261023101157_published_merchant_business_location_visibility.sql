-- Reprise fidèle d'une migration appliquée directement sur le projet hébergé (version 20261023101157),
-- absente de Git jusqu'ici. Elle rend visible l'adresse de tout établissement publié, dark kitchens
-- comprises : la migration 20261024154834_restore_private_dark_kitchen_location la corrige.
create or replace function public.can_see_merchant_address(p_merchant_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id
      and (
        m.is_published
        or m.owner_id = (select auth.uid())
        or exists (
          select 1 from public.merchant_couriers mc
          where mc.merchant_id = m.id
            and mc.status = 'approved'
            and mc.courier_id = public.current_courier_id()
        )
      )
  );
$$;
revoke execute on function public.can_see_merchant_address(uuid) from public, anon, authenticated;
