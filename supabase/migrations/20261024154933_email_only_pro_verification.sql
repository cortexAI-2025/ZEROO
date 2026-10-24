-- Account verification for professional onboarding is email-only.
-- Keep contact phone fields; they no longer require SMS confirmation.
create or replace function public.is_pro_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;

revoke execute on function public.is_pro_verified() from public, anon;
grant execute on function public.is_pro_verified() to authenticated;
