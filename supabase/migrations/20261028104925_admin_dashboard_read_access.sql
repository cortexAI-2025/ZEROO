-- Read-only cross-platform visibility for authenticated platform administrators.
-- Existing owner/customer/courier policies and write permissions remain unchanged.
create policy "platform admin read merchants"
on public.merchants for select to authenticated
using ((select public.is_platform_admin()));

create policy "platform admin read couriers"
on public.couriers for select to authenticated
using ((select public.is_platform_admin()));

create policy "platform admin read orders"
on public.orders for select to authenticated
using ((select public.is_platform_admin()));

create policy "platform admin read subscriptions"
on public.subscriptions for select to authenticated
using ((select public.is_platform_admin()));

create policy "platform admin read courier_subscriptions"
on public.courier_subscriptions for select to authenticated
using ((select public.is_platform_admin()));

