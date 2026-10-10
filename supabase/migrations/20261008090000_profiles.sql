-- Étape (a) : profils utilisateurs et suppression de compte.

-- Helper générique pour les colonnes updated_at -----------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profils ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  phone        text check (char_length(phone) <= 20),
  locale       text not null default 'fr' check (locale in ('fr', 'ar')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is 'Données applicatives minimales d''un utilisateur (RGPD : rien d''obligatoire hormis l''id).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- Pas d'accès anonyme ; un utilisateur ne voit et ne modifie que son profil.
revoke all on public.profiles from anon;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, phone, locale) on public.profiles to authenticated;

create policy "profiles: lecture de son propre profil"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles: modification de son propre profil"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Création automatique du profil à l'inscription (email, Apple ou Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                              new.raw_user_meta_data ->> 'name')), ''), 80)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Suppression de compte (exigée par Apple / Google et par le RGPD) ----------
-- Supprime l'utilisateur d'auth.users ; le profil et les données personnelles
-- suivent par cascade. Les commandes (étapes suivantes) seront anonymisées
-- via `on delete set null` pour préserver la comptabilité des commerçants.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
