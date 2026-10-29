-- Republication APRÈS la réapplication (merchants_private_REAPPLY_AFTER_REDUCED.sql) : modèle fermé rétabli, la republication
-- n'expose PLUS rien (contrairement à merchants_private_ROLLBACK_REPUBLISH.sql). À lancer après redéploiement de la NOUVELLE
-- application. Seuls les commerces encore éligibles (abonnement en cours + encaissement) sont republiés.
begin;
do $$ begin
  if to_regclass('admin_private.rollback_published_snapshot') is null then raise exception 'Aucune liste à republier'; end if;
  if to_regclass('admin_private.rollback_reduced_marker') is not null then raise exception 'Mode réduit encore actif : réappliquer d''abord'; end if;
end $$;
update public.merchants m set is_published = true
from admin_private.rollback_published_snapshot s
where s.merchant_id = m.id and m.admin_status = 'active' and public.is_subscription_active(m) and public.is_payments_ready(m);
select (select count(*) from admin_private.rollback_published_snapshot) as dans_la_liste, (select count(*) from public.merchants where is_published) as republies;
commit;
