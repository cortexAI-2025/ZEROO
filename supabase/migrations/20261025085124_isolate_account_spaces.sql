-- Un compte appartient à un seul espace. Le choix ne dépend jamais du navigateur/JWT éditable.
alter table public.profiles add column account_space text
  check (account_space in ('client', 'merchant', 'courier'));

-- Reprise sans ambiguïté des comptes existants. Les comptes de démo multi-profils choisissent
-- une seule fois, explicitement ; aucun commerce, livreur ou abonnement n'est supprimé.
update public.profiles p set account_space = case
  when exists (select 1 from public.merchants m where m.owner_id=p.id) then 'merchant'
  else 'courier' end
where (exists (select 1 from public.merchants m where m.owner_id=p.id))
   <> (exists (select 1 from public.couriers c where c.user_id=p.id));
update public.profiles p set account_space='client'
where account_space is null
  and not exists (select 1 from public.merchants m where m.owner_id=p.id)
  and not exists (select 1 from public.couriers c where c.user_id=p.id)
  and exists (select 1 from public.orders o where o.customer_id=p.id);

-- Lecture invoker : la RLS de profiles limite à l'identité connectée.
create function public.get_my_account_space() returns text
language sql stable set search_path='' as $$
  select account_space from public.profiles where id=(select auth.uid());
$$;

-- Le verrou de ligne rend deux choix concurrents atomiques. Aucun id utilisateur en paramètre.
create function public.claim_account_space(p_space text) returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); current_space text;
begin
  if uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_space is null or p_space not in ('client','merchant','courier') then
    raise exception 'invalid_account_space' using errcode='22023';
  end if;
  select account_space into current_space from public.profiles where id=uid for update;
  if not found then raise exception 'not_authenticated' using errcode='42501'; end if;
  if current_space is not null and current_space <> p_space then
    raise exception 'account_space_locked' using errcode='42501';
  end if;
  update public.profiles set account_space=p_space where id=uid and account_space is null;
  return p_space;
end;
$$;
revoke all on function public.get_my_account_space(), public.claim_account_space(text) from public, anon;
grant execute on function public.get_my_account_space(), public.claim_account_space(text) to authenticated;
-- Les grants UPDATE de profiles restent limités à display_name, phone, locale.
revoke update(account_space) on public.profiles from authenticated, anon;

-- Empêche les RPC de création de réintroduire un autre métier, même hors interface.
create function public.enforce_creation_account_space() returns trigger
language plpgsql security definer set search_path='' as $$
declare uid uuid; current_space text;
begin
  if tg_table_name='merchants' then uid := new.owner_id;
  elsif tg_table_name='couriers' then uid := new.user_id;
  else uid := new.customer_id; end if;
  if uid is null then return new; end if;
  select account_space into current_space from public.profiles where id=uid for update;
  if current_space is not null and current_space <> tg_argv[0] then
    raise exception 'account_space_locked' using errcode='42501';
  end if;
  update public.profiles set account_space=tg_argv[0] where id=uid and account_space is null;
  return new;
end;
$$;
revoke all on function public.enforce_creation_account_space() from public, anon, authenticated;
create trigger merchant_account_space before insert on public.merchants
for each row execute function public.enforce_creation_account_space('merchant');
create trigger courier_account_space before insert on public.couriers
for each row execute function public.enforce_creation_account_space('courier');
create trigger customer_account_space before insert on public.orders
for each row execute function public.enforce_creation_account_space('client');

-- Les helpers utilisés dans les policies/RPC ne reconnaissent que le métier du compte.
create or replace function public.is_merchant_owner(p_merchant_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (select 1 from public.merchants m join public.profiles p on p.id=m.owner_id
    where m.id=p_merchant_id and m.owner_id=(select auth.uid()) and p.account_space='merchant');
$$;
create or replace function public.current_courier_id() returns uuid
language sql stable security definer set search_path='' as $$
  select c.id from public.couriers c join public.profiles p on p.id=c.user_id
  where c.user_id=(select auth.uid()) and p.account_space='courier';
$$;
