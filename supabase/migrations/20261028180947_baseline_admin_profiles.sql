-- This preferences table existed in production before its schema was recorded in Git.
-- Reconcile it without replacing existing rows; replaying from an empty DB also works.
create table if not exists public.admin_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(char_length(display_name)<=80),avatar_url text,
 locale text not null default 'fr' check(locale in('fr','en','ar')),
 theme text not null default 'system' check(theme in('system','light','dark')),
 updated_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
revoke all on public.admin_profiles from public,anon,authenticated;
grant select,insert,update on public.admin_profiles to authenticated;
drop policy if exists "admin profile own read" on public.admin_profiles;
drop policy if exists "admin profile own insert" on public.admin_profiles;
drop policy if exists "admin profile own update" on public.admin_profiles;
create policy "admin profile own read" on public.admin_profiles for select to authenticated
using(user_id=(select auth.uid()) and (select public.is_platform_admin()));
create policy "admin profile own insert" on public.admin_profiles for insert to authenticated
with check(user_id=(select auth.uid()) and (select public.is_platform_admin()));
create policy "admin profile own update" on public.admin_profiles for update to authenticated
using(user_id=(select auth.uid()) and (select public.is_platform_admin()))
with check(user_id=(select auth.uid()) and (select public.is_platform_admin()));
