-- Reproduce the membership lookup already used by the production admin login.
-- No role can grant itself membership or list the other administrators.
revoke all on public.platform_admins from anon,authenticated;
grant select on public.platform_admins to authenticated;
drop policy if exists "platform admin own membership" on public.platform_admins;
create policy "platform admin own membership" on public.platform_admins for select to authenticated
using(user_id=(select auth.uid()));
