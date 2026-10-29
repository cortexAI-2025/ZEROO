-- Rétabli depuis la base de production : cette migration y a été appliquée (version 20261028090600)
-- sans être versionnée dans Git. Contenu repris à l'identique de supabase_migrations.schema_migrations.
create table if not exists public.admin_profiles (
 user_id uuid primary key references public.platform_admins(user_id) on delete cascade,
 display_name text check (char_length(display_name)<=80),
 avatar_url text,
 locale text not null default 'fr' check (locale in ('fr','en','ar')),
 theme text not null default 'system' check (theme in ('system','light','dark')),
 updated_at timestamptz not null default now()
);
create table if not exists public.admin_roles (
 role_key text primary key,
 description text not null
);
insert into public.admin_roles(role_key,description) values
 ('super_admin','Administration générale'),('admin','Administration opérationnelle'),('support','Assistance'),('finance','Finances'),('moderation','Modération')
on conflict (role_key) do nothing;
create table if not exists public.admin_user_roles (
 user_id uuid not null references public.platform_admins(user_id) on delete cascade,
 role_key text not null references public.admin_roles(role_key),
 assigned_at timestamptz not null default now(),
 primary key(user_id,role_key)
);
create table if not exists public.admin_audit_logs (
 id bigint generated always as identity primary key,
 actor_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 target_type text,
 target_id text,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.admin_profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_roles,public.admin_user_roles,public.admin_audit_logs from anon,authenticated;
grant select,insert,update on public.admin_profiles to authenticated;
create policy "admin profile own read" on public.admin_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "admin profile own insert" on public.admin_profiles for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.platform_admins p where p.user_id=(select auth.uid())));
create policy "admin profile own update" on public.admin_profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
