begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtext('zeeroo_affiliation_migrations_20261025'));
do $$begin
if exists(select 1 from supabase_migrations.schema_migrations where version in ('20261025130000','20261025140000')) then
raise exception 'Affiliation migration history changed: inspect before applying';
end if;
end$$;
-- Annuaire des clients connectés : seuls les établissements affiliés (abonnement actif ou en essai,
-- paiement configuré) sont listés. Le public non connecté continue de voir tous les commerces publiés.
drop function if exists public.nearby_merchants(double precision, double precision, integer, integer);
drop function if exists public.search_merchants(text, integer);

CREATE OR REPLACE FUNCTION public.nearby_merchants(p_latitude double precision, p_longitude double precision, p_radius_m integer DEFAULT 10000, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         public.public_distance_m(m, here.point),
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, here
  where m.is_published
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and extensions.st_dwithin(ml.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by ml.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.search_merchants(p_query text, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with q as (
    select lower(extensions.unaccent(trim(p_query))) as term
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, q
  where m.is_published
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like '%' || q.term || '%'
      or lower(extensions.unaccent(m.city)) like q.term || '%'
      or (m.offers_pickup and m.postal_code like q.term || '%')
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$function$;

revoke execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) from public;
grant execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) to anon, authenticated;

-- Publication réservée aux professionnels affiliés, imposée par la base.
--
-- Affilié = abonnement ZeeRoo en cours (essai ou actif) ET encaissement configuré (lien de
-- paiement ou espèces au comptoir). L'abonnement ZeeRoo est le seul usage de Stripe : aucun compte
-- Stripe Connect n'est exigé du professionnel pour publier sa fiche.
--
-- Une fiche non affiliée reste un brouillon privé (visible de son seul propriétaire). Même un appel
-- direct à l'API ne peut pas la publier ; si l'abonnement s'arrête, la fiche est dépubliée mais
-- conservée, et le professionnel la republie lui-même une fois en règle.

-- Garde : s'applique aux rôles de l'API (anon, authenticated). Le serveur et l'administration
-- (postgres, service_role, fonctions SECURITY DEFINER) gardent la main pour la maintenance.
-- Volontairement SECURITY INVOKER : current_user doit rester le rôle de l'appelant.
create or replace function public.merchants_publication_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.is_published
     and not (public.is_subscription_active(new) and public.is_payments_ready(new)) then
    -- Publication demandée par un professionnel non affilié : refusée.
    if tg_op = 'INSERT' or not old.is_published then
      raise exception 'merchant_not_affiliated' using errcode = '42501';
    end if;
    -- Fiche déjà publiée dont l'encaissement vient d'être retiré : dépubliée, pas supprimée.
    new.is_published := false;
  end if;
  return new;
end;
$$;

create trigger merchants_publication_guard
  before insert or update of is_published, payment_link, accepts_cash_pickup on public.merchants
  for each row execute function public.merchants_publication_guard();

-- Fin d'abonnement (annulé, impayé, en pause, expiré…) : la fiche quitte l'annuaire.
-- Déclenché quel que soit l'auteur de la mise à jour (webhook Stripe, administration).
-- Les statuts qui comptent comme affilié sont les mêmes que dans is_subscription_active().
create or replace function public.subscriptions_unpublish_on_lapse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merchants
     set is_published = false
   where id = new.merchant_id
     and is_published;
  return null;
end;
$$;

revoke execute on function public.subscriptions_unpublish_on_lapse() from public, anon, authenticated;

-- Seulement à la transition de statut : la création de la ligne d'abonnement (statut « incomplete »)
-- au premier paiement ne concerne pas une fiche déjà publiée.
create trigger subscriptions_unpublish_on_lapse
  after update of status on public.subscriptions
  for each row
  when (new.status not in ('trialing', 'active') and new.status is distinct from old.status)
  execute function public.subscriptions_unpublish_on_lapse();

insert into supabase_migrations.schema_migrations(version,name,statements) values
('20261025130000','affiliated_directory',array['-- Annuaire des clients connectés : seuls les établissements affiliés (abonnement actif ou en essai,
-- paiement configuré) sont listés. Le public non connecté continue de voir tous les commerces publiés.
drop function if exists public.nearby_merchants(double precision, double precision, integer, integer);
drop function if exists public.search_merchants(text, integer);

CREATE OR REPLACE FUNCTION public.nearby_merchants(p_latitude double precision, p_longitude double precision, p_radius_m integer DEFAULT 10000, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''''
AS $function$
  with here as (
    select extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography as point
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         public.public_distance_m(m, here.point),
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, here
  where m.is_published
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and extensions.st_dwithin(ml.location, here.point, least(greatest(p_radius_m, 100), 50000))
  order by ml.location operator(extensions.<->) here.point
  limit least(greatest(p_limit, 1), 100);
$function$;

CREATE OR REPLACE FUNCTION public.search_merchants(p_query text, p_limit integer DEFAULT 50, p_affiliated_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, slug text, name text, category text, address_line text, city text, distance_m integer, is_open boolean, is_accepting_orders boolean, offers_pickup boolean, offers_delivery boolean, delivery_available_now boolean, has_happy_hour_now boolean, meal_periods text[], latitude double precision, longitude double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''''
AS $function$
  with q as (
    select lower(extensions.unaccent(trim(p_query))) as term
  )
  select m.id, m.slug, m.name, m.category,
         case when m.offers_pickup then ml.address_line end,
         m.city,
         null::int,
         public.is_open_now(m),
         public.is_accepting_orders(m),
         m.offers_pickup,
         public.offers_delivery(m),
         public.delivery_available_now(m),
         public.has_happy_hour_now(m),
         public.meal_periods_of(m),
         case when m.offers_pickup then ml.latitude end,
         case when m.offers_pickup then ml.longitude end
  from public.merchants m join public.merchant_locations ml on ml.merchant_id = m.id, q
  where m.is_published
    and (not p_affiliated_only or (public.is_subscription_active(m) and public.is_payments_ready(m)))
    and char_length(q.term) >= 2
    and (
      lower(extensions.unaccent(m.name)) like ''%'' || q.term || ''%''
      or lower(extensions.unaccent(m.city)) like q.term || ''%''
      or (m.offers_pickup and m.postal_code like q.term || ''%'')
    )
  order by public.is_accepting_orders(m) desc, m.name
  limit least(greatest(p_limit, 1), 100);
$function$;

revoke execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) from public;
grant execute on function public.nearby_merchants(double precision, double precision, integer, integer, boolean),
  public.search_merchants(text, integer, boolean) to anon, authenticated;
']),
('20261025140000','publication_guard',array['-- Publication réservée aux professionnels affiliés, imposée par la base.
--
-- Affilié = abonnement ZeeRoo en cours (essai ou actif) ET encaissement configuré (lien de
-- paiement ou espèces au comptoir). L''abonnement ZeeRoo est le seul usage de Stripe : aucun compte
-- Stripe Connect n''est exigé du professionnel pour publier sa fiche.
--
-- Une fiche non affiliée reste un brouillon privé (visible de son seul propriétaire). Même un appel
-- direct à l''API ne peut pas la publier ; si l''abonnement s''arrête, la fiche est dépubliée mais
-- conservée, et le professionnel la republie lui-même une fois en règle.

-- Garde : s''applique aux rôles de l''API (anon, authenticated). Le serveur et l''administration
-- (postgres, service_role, fonctions SECURITY DEFINER) gardent la main pour la maintenance.
-- Volontairement SECURITY INVOKER : current_user doit rester le rôle de l''appelant.
create or replace function public.merchants_publication_guard()
returns trigger
language plpgsql
set search_path = ''''
as $$
begin
  if current_user in (''anon'', ''authenticated'')
     and new.is_published
     and not (public.is_subscription_active(new) and public.is_payments_ready(new)) then
    -- Publication demandée par un professionnel non affilié : refusée.
    if tg_op = ''INSERT'' or not old.is_published then
      raise exception ''merchant_not_affiliated'' using errcode = ''42501'';
    end if;
    -- Fiche déjà publiée dont l''encaissement vient d''être retiré : dépubliée, pas supprimée.
    new.is_published := false;
  end if;
  return new;
end;
$$;

create trigger merchants_publication_guard
  before insert or update of is_published, payment_link, accepts_cash_pickup on public.merchants
  for each row execute function public.merchants_publication_guard();

-- Fin d''abonnement (annulé, impayé, en pause, expiré…) : la fiche quitte l''annuaire.
-- Déclenché quel que soit l''auteur de la mise à jour (webhook Stripe, administration).
-- Les statuts qui comptent comme affilié sont les mêmes que dans is_subscription_active().
create or replace function public.subscriptions_unpublish_on_lapse()
returns trigger
language plpgsql
security definer
set search_path = ''''
as $$
begin
  update public.merchants
     set is_published = false
   where id = new.merchant_id
     and is_published;
  return null;
end;
$$;

revoke execute on function public.subscriptions_unpublish_on_lapse() from public, anon, authenticated;

-- Seulement à la transition de statut : la création de la ligne d''abonnement (statut « incomplete »)
-- au premier paiement ne concerne pas une fiche déjà publiée.
create trigger subscriptions_unpublish_on_lapse
  after update of status on public.subscriptions
  for each row
  when (new.status not in (''trialing'', ''active'') and new.status is distinct from old.status)
  execute function public.subscriptions_unpublish_on_lapse();
']);
notify pgrst,'reload schema';
commit;