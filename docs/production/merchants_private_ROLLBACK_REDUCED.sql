-- RETOUR ARRIÈRE À EXPOSITION RÉDUITE de 20261029120000_merchants_private_details.
-- NOUVEAU SCÉNARIO, testé séparément ; il ne remplace PAS merchants_private_ROLLBACK.sql ni _ROLLBACK_SAFE.sql.
--
-- Objectif : permettre à l'ANCIENNE application de refonctionner SANS rendre lisibles par les clients et les livreurs
-- les données administratives. Principe :
--   * merchant_private est CONSERVÉE, fermée (aucun droit API, RLS sans politique) ; elle garde legal_name, siret,
--     vat_number, contact_email (et public_phone). Aucune de ces valeurs n'est copiée dans merchants.
--   * SEULS le téléphone et le lien de paiement (strictement nécessaires à l'ancienne application : fiche, commande,
--     paiement) sont restaurés dans les colonnes de merchants, qui deviennent leur source de vérité ; leurs copies sont
--     retirées de merchant_private (une seule source, pas de divergence).
--   * Les déclencheurs d'écriture des champs administratifs RESTENT : même si un restaurateur saisit un SIRET dans l'ancienne
--     application, il va dans merchant_private, jamais dans merchants (null = conserver, '' = effacer).
--   * Tous les commerces sont d'abord DÉPUBLIÉS (liste mémorisée) : un visiteur ne voit rien, et aucune donnée n'est
--     exposée au public. Republier est une étape explicite (merchants_private_ROLLBACK_REPUBLISH.sql) qui RÉEXPOSE le
--     téléphone et le lien de paiement au public (ancien modèle).
-- Pour revenir à la nouvelle application : merchants_private_REAPPLY_AFTER_REDUCED.sql (n'écrase ni ne supprime rien).
-- Limites assumées : l'ancienne application voit le SIRET/TVA/e-mail/raison sociale vides ; la console admin affiche
-- téléphone et lien de paiement vides tant que le mode réduit est actif ; la nouvelle application NE doit PAS être
-- redéployée avant la réapplication.
begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.merchant_private') is null then raise exception 'merchant_private absente : rien à réduire'; end if;
  if to_regclass('admin_private.rollback_reduced_marker') is not null then raise exception 'Mode réduit déjà actif : utiliser la réapplication'; end if;
end $$;

-- 0. Dépublier (liste mémorisée), comme le retour arrière sûr.
create table if not exists admin_private.rollback_published_snapshot (
  merchant_id uuid primary key,
  taken_at timestamptz not null default now()
);
revoke all on admin_private.rollback_published_snapshot from public, anon, authenticated;
insert into admin_private.rollback_published_snapshot (merchant_id)
select id from public.merchants where is_published on conflict (merchant_id) do nothing;
update public.merchants set is_published = false where is_published;
do $$ begin
  if exists (select 1 from public.merchants where is_published) then raise exception 'Dépublication incomplète : abandon'; end if;
end $$;

-- 1. Marqueur du mode réduit + empreinte des valeurs concernées (contrôle de la réapplication).
create table admin_private.rollback_reduced_marker (
  taken_at timestamptz not null default now(),
  phone_count int not null,
  payment_link_count int not null,
  fingerprint text not null
);
revoke all on admin_private.rollback_reduced_marker from public, anon, authenticated;
insert into admin_private.rollback_reduced_marker (phone_count, payment_link_count, fingerprint)
select count(phone), count(payment_link),
       coalesce(md5(string_agg(merchant_id::text || '|' || coalesce(phone, '') || '|' || coalesce(payment_link, ''), ';' order by merchant_id)), '')
from public.merchant_private;

-- 2. « Encaissement configuré » relit la colonne de merchants (ancien comportement).
create or replace function public.is_payments_ready(m public.merchants)
returns boolean language sql stable security definer set search_path = '' as $$
  select m.payment_link is not null or m.accepts_cash_pickup;
$$;

-- 3. Téléphone et lien de paiement : les déclencheurs de routage sont retirés (la colonne redevient la source de vérité).
drop trigger if exists a00_merchants_private_phone on public.merchants;
drop trigger if exists a00_merchants_private_payment_link on public.merchants;

-- 4. Restauration des SEULES deux colonnes nécessaires à l'ancienne application, puis retrait de leurs copies privées.
update public.merchants m set phone = p.phone, payment_link = p.payment_link
from public.merchant_private p
where p.merchant_id = m.id and (p.phone is not null or p.payment_link is not null);
update public.merchant_private set phone = null, payment_link = null where phone is not null or payment_link is not null;

-- 5. Contrôles : aucun champ administratif dans merchants, rien de publié, données privées intactes.
do $$ begin
  if exists (select 1 from public.merchants where coalesce(legal_name, siret, vat_number, contact_email) is not null) then
    raise exception 'Un champ administratif est présent dans merchants : abandon';
  end if;
  if exists (select 1 from public.merchants where is_published) then raise exception 'Un commerce est publié : abandon'; end if;
  if has_table_privilege('anon', 'public.merchant_private', 'SELECT') or has_table_privilege('authenticated', 'public.merchant_private', 'SELECT') then
    raise exception 'merchant_private lisible : abandon';
  end if;
end $$;
select (select count(phone) from public.merchants) as telephones_restaures,
       (select count(payment_link) from public.merchants) as liens_restaures,
       (select count(*) from public.merchants where coalesce(legal_name, siret, vat_number, contact_email) is not null) as champs_admin_dans_merchants,
       (select count(*) from admin_private.rollback_published_snapshot) as commerces_a_republier,
       (select count(*) from public.merchants where is_published) as publies_maintenant;
commit;
