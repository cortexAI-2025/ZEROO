-- Seul le titulaire d'un espace client modifie ses informations personnelles.
-- Aucun droit UPDATE supplémentaire sur profiles n'est accordé au client API.
create schema if not exists account_private;
revoke all on schema account_private from public, anon;
grant usage on schema account_private to authenticated;

create function account_private.update_client_profile(p_profile jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  first_name text := nullif(btrim(p_profile->>'first_name'),'');
  last_name text := nullif(btrim(p_profile->>'last_name'),'');
  address_line text := nullif(btrim(p_profile->>'address_line'),'');
  postal_code text := nullif(btrim(p_profile->>'postal_code'),'');
  city text := nullif(btrim(p_profile->>'city'),'');
  phone text := nullif(btrim(p_profile->>'phone'),'');
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  perform 1 from public.profiles where id=uid and account_space='client' for update;
  if not found then raise exception 'client_profile_required' using errcode='42501';end if;
  if jsonb_typeof(p_profile) is distinct from 'object'
    or p_profile-array['first_name','last_name','address_line','postal_code','city','phone'] <> '{}'::jsonb
    or first_name is null or char_length(first_name)>80
    or last_name is null or char_length(last_name)>80
    or address_line is null or char_length(address_line) not between 5 and 240
    or postal_code is null or postal_code !~ '^[0-9]{5}$'
    or city is null or char_length(city) not between 2 and 100
    or phone is null or phone !~ '^\+[1-9][0-9]{7,14}$'
  then raise exception 'invalid_client_profile' using errcode='23514';end if;
  update public.profiles p set first_name=update_client_profile.first_name,
    last_name=update_client_profile.last_name,address_line=update_client_profile.address_line,
    postal_code=update_client_profile.postal_code,city=update_client_profile.city,
    phone=update_client_profile.phone,
    display_name=left(concat_ws(' ',update_client_profile.first_name,update_client_profile.last_name),80)
  where p.id=uid;
end;
$$;
revoke all on function account_private.update_client_profile(jsonb) from public,anon;
grant execute on function account_private.update_client_profile(jsonb) to authenticated;

create function public.update_client_profile(p_profile jsonb)
returns void language sql security invoker set search_path = ''
as $$ select account_private.update_client_profile(p_profile); $$;
revoke all on function public.update_client_profile(jsonb) from public,anon;
grant execute on function public.update_client_profile(jsonb) to authenticated;
