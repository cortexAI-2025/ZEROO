-- Inscription des professionnels : e-mail confirmé ET téléphone vérifié par SMS.
--
-- Les clients s'inscrivent avec Google, Apple ou un e-mail, sans autre contrôle. Un commerçant
-- ou un livreur peut aussi passer par Google ou Apple, mais il doit avoir confirmé son e-mail
-- (automatique avec Google / Apple) et vérifié son numéro de téléphone (code SMS de Supabase
-- Auth : auth.users.phone_confirmed_at) avant de créer son commerce ou son profil livreur.

-- Le compte connecté est-il vérifié (e-mail + téléphone) ? -----------------------------------
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
      and u.phone_confirmed_at is not null
      and coalesce(u.phone, '') <> ''
  );
$$;

revoke execute on function public.is_pro_verified() from public, anon;
grant execute on function public.is_pro_verified() to authenticated;

-- Garde à la création : couvre create_merchant, create_courier et tout autre chemin futur.
-- Les écritures sans utilisateur (données de démo, service_role) ne sont pas concernées.
create or replace function public.require_verified_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_pro_verified() then
    raise exception 'pro_verification_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.require_verified_pro() from public, anon, authenticated;

create trigger merchants_require_verified_pro
  before insert on public.merchants
  for each row execute function public.require_verified_pro();

create trigger couriers_require_verified_pro
  before insert on public.couriers
  for each row execute function public.require_verified_pro();

-- Le numéro vérifié devient le téléphone du profil (format international +33…). -----------
create or replace function public.sync_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone_confirmed_at is not null and coalesce(new.phone, '') <> ''
     and (old.phone_confirmed_at is distinct from new.phone_confirmed_at
          or old.phone is distinct from new.phone) then
    update public.profiles
    set phone = left('+' || ltrim(new.phone, '+'), 20)
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_verified_phone() from public, anon, authenticated;

create trigger on_auth_user_phone_verified
  after update of phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_verified_phone();
