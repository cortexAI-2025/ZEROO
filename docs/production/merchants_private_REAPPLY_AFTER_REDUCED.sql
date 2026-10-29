-- RÉAPPLICATION après un retour arrière RÉDUIT (merchants_private_ROLLBACK_REDUCED.sql), malgré la présence de
-- merchant_private. N'écrase et ne supprime AUCUNE donnée : les valeurs de téléphone et de lien de paiement saisies
-- dans merchants pendant le mode réduit (la colonne faisait foi) sont recopiées dans merchant_private, puis les colonnes
-- sont vidées AVANT de réinstaller les déclencheurs de routage (ordre essentiel : sinon ils effaceraient les valeurs).
-- Les champs administratifs (legal_name, siret, vat_number, contact_email, public_phone) ne sont pas touchés ; une valeur
-- saisie dans l'ancienne application passait déjà par merchant_private grâce aux déclencheurs conservés.
-- Peut être lancée commerces publiés (après une republication du mode réduit) ou non. Ensuite : redéployer la NOUVELLE
-- application ; si des commerces sont encore dépubliés, les republier avec merchants_private_REAPPLY_REPUBLISH.sql (sans exposition).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $$ begin
  if to_regclass('admin_private.rollback_reduced_marker') is null then
    raise exception 'Mode réduit non actif (marqueur absent) : cette réapplication ne s''applique pas';
  end if;
  if to_regclass('public.merchant_private') is null then raise exception 'merchant_private absente'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.merchants'::regclass and tgname in ('a00_merchants_private_phone', 'a00_merchants_private_payment_link')) then
    raise exception 'Déclencheurs phone / payment_link déjà présents : état inattendu, inspecter';
  end if;
  if exists (select 1 from public.merchants where coalesce(legal_name, siret, vat_number, contact_email) is not null) then
    raise exception 'Un champ administratif est présent dans merchants : état inattendu, inspecter';
  end if;
end $$;

-- Empreintes AVANT : champs administratifs privés (doivent rester identiques) et valeurs de la colonne (doivent arriver en privé).
create temp table zeeroo_reduced_avant as
select (select md5(coalesce(string_agg(merchant_id::text || '|' || coalesce(legal_name, '') || '|' || coalesce(siret, '') || '|' || coalesce(vat_number, '') || '|' || coalesce(contact_email, '') || '|' || coalesce(public_phone, ''), ';' order by merchant_id), ''))
        from public.merchant_private) as admin_fp,
       (select md5(coalesce(string_agg(id::text || '|' || coalesce(phone, '') || '|' || coalesce(payment_link, ''), ';' order by id), ''))
        from public.merchants where phone is not null or payment_link is not null) as raw_fp,
       (select count(phone) from public.merchants) as raw_phone,
       (select count(payment_link) from public.merchants) as raw_link;

-- 1. La colonne de merchants fait foi : recopie vers merchant_private (valeurs ABSENTES comprises : un effacement fait dans
--    l'ancienne application est conservé), sans supprimer de ligne.
insert into public.merchant_private (merchant_id, phone, payment_link)
select id, phone, payment_link from public.merchants where phone is not null or payment_link is not null
on conflict (merchant_id) do update set phone = excluded.phone, payment_link = excluded.payment_link;
update public.merchant_private p set phone = m.phone, payment_link = m.payment_link
from public.merchants m where m.id = p.merchant_id and (p.phone is distinct from m.phone or p.payment_link is distinct from m.payment_link);

-- 2. Vidage des deux colonnes AVANT la réinstallation des déclencheurs.
update public.merchants set phone = null, payment_link = null where phone is not null or payment_link is not null;

-- 3. « Encaissement configuré » relit merchant_private.
create or replace function public.is_payments_ready(m public.merchants)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.merchant_private p where p.merchant_id = m.id and p.payment_link is not null)
         or m.accepts_cash_pickup;
$$;

-- 4. Déclencheurs de routage de phone et payment_link (mêmes définitions que la migration).
create trigger a00_merchants_private_phone before insert or update of phone on public.merchants
  for each row execute function public.route_merchant_private('phone', 'legacy');
create trigger a00_merchants_private_payment_link before insert or update of payment_link on public.merchants
  for each row execute function public.route_merchant_private('payment_link', '');

-- 5. Contrôles : rien perdu, rien écrasé.
do $$
declare a record; admin_after text; raw_after text;
begin
  select * into a from zeeroo_reduced_avant;
  select md5(coalesce(string_agg(merchant_id::text || '|' || coalesce(legal_name, '') || '|' || coalesce(siret, '') || '|' || coalesce(vat_number, '') || '|' || coalesce(contact_email, '') || '|' || coalesce(public_phone, ''), ';' order by merchant_id), ''))
    into admin_after from public.merchant_private;
  if admin_after is distinct from a.admin_fp then raise exception 'Champs administratifs privés modifiés : transaction annulée'; end if;
  select md5(coalesce(string_agg(merchant_id::text || '|' || coalesce(phone, '') || '|' || coalesce(payment_link, ''), ';' order by merchant_id), ''))
    into raw_after from public.merchant_private where phone is not null or payment_link is not null;
  if raw_after is distinct from a.raw_fp then raise exception 'Téléphone / lien de paiement non recopiés à l''identique : transaction annulée'; end if;
  if (select count(phone) from public.merchant_private) <> a.raw_phone or (select count(payment_link) from public.merchant_private) <> a.raw_link then
    raise exception 'Décompte des téléphones / liens différent : transaction annulée';
  end if;
  if exists (select 1 from public.merchants where coalesce(legal_name, siret, vat_number, contact_email, phone, payment_link) is not null) then
    raise exception 'Colonnes brutes non vidées : transaction annulée';
  end if;
  if has_table_privilege('anon', 'public.merchant_private', 'SELECT') or has_table_privilege('authenticated', 'public.merchant_private', 'SELECT') then
    raise exception 'merchant_private lisible : transaction annulée';
  end if;
end $$;
drop table admin_private.rollback_reduced_marker;
select (select count(phone) from public.merchant_private) as telephones_prives,
       (select count(payment_link) from public.merchant_private) as liens_prives,
       (select count(*) from admin_private.rollback_published_snapshot) as commerces_a_republier;
commit;
