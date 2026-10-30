-- REPUBLICATION après un retour arrière sûr (merchants_private_ROLLBACK_SAFE.sql).
-- ATTENTION : republier un commerce RÉEXPOSE à l'API publique les colonnes siret, vat_number, legal_name,
-- contact_email, phone, payment_link restaurées dans merchants (ancien modèle). À n'exécuter qu'après :
--   1. redéploiement de l'ancienne application ET de l'ancienne Edge Function create-order ;
--   2. décision explicite du propriétaire d'accepter cette exposition.
-- Garde-fou : le script refuse de s'exécuter sans l'ordre explicite ci-dessous (à taper avant, dans la même session) :
--   set zeeroo.accept_exposure = 'oui';
begin;
do $$ begin
  if coalesce(current_setting('zeeroo.accept_exposure', true), '') <> 'oui' then
    raise exception 'Republication refusée : elle réexpose les données privées. Taper d''abord : set zeeroo.accept_exposure = ''oui'';';
  end if;
  if to_regclass('admin_private.rollback_published_snapshot') is null then raise exception 'Aucune liste à republier'; end if;
end $$;
-- Seuls les commerces encore éligibles (abonnement en cours + encaissement) sont republiés.
update public.merchants m set is_published = true
from admin_private.rollback_published_snapshot s
where s.merchant_id = m.id and m.admin_status = 'active'
  and public.is_subscription_active(m) and public.is_payments_ready(m);
select (select count(*) from admin_private.rollback_published_snapshot) as dans_la_liste,
       (select count(*) from public.merchants where is_published) as republies;
commit;
