-- Identité privée : les comptes existants restent inchangés et les politiques RLS sont conservées.
alter table public.profiles
  add column first_name text check (char_length(first_name) between 1 and 80),
  add column last_name text check (char_length(last_name) between 1 and 80),
  add column address_line text check (char_length(address_line) between 5 and 240),
  add column postal_code text check (postal_code ~ '^[0-9]{5}$'),
  add column city text check (char_length(city) between 2 and 100);

comment on table public.profiles is 'Profil privé. Nom, prénom, adresse et téléphone requis pour les nouvelles inscriptions par e-mail ; anciennes données conservées.';

-- Auth exécute ce trigger dans la transaction de création : aucun profil incomplet
-- n'est créé par la nouvelle inscription. raw_app_meta_data est fourni par Auth,
-- contrairement aux métadonnées utilisateur, et ne décide ici d'aucun privilège.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  required boolean := new.raw_app_meta_data->>'provider' = 'email'
                   or m->>'signup_profile_version' = '1';
  first_name text := nullif(btrim(m->>'first_name'), '');
  last_name text := nullif(btrim(m->>'last_name'), '');
  address_line text := nullif(btrim(m->>'address_line'), '');
  postal_code text := nullif(btrim(m->>'postal_code'), '');
  city text := nullif(btrim(m->>'city'), '');
  phone text := nullif(btrim(m->>'contact_phone'), '');
begin
  if required and (
    first_name is null or char_length(first_name) > 80 or
    last_name is null or char_length(last_name) > 80 or
    address_line is null or char_length(address_line) not between 5 and 240 or
    postal_code is null or postal_code !~ '^[0-9]{5}$' or
    city is null or char_length(city) not between 2 and 100 or
    phone is null or phone !~ '^\+[1-9][0-9]{7,14}$' or
    nullif(btrim(new.email), '') is null
  ) then
    raise exception 'signup_profile_required' using errcode = '23514';
  end if;
  insert into public.profiles (id, display_name, first_name, last_name, address_line, postal_code, city, phone)
  values (new.id,
    left(coalesce(nullif(concat_ws(' ',first_name,last_name),''),
      nullif(btrim(coalesce(m->>'full_name',m->>'name')),'')),80),
    first_name, last_name, address_line, postal_code, city, phone);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- Aucun nouveau droit de lecture ni d'écriture : données personnelles de son propre compte uniquement.
