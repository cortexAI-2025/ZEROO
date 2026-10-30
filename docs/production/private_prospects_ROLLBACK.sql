-- Retour arrière de 20261029110000_private_prospects (à n'utiliser que sur décision explicite).
-- Il rétablit l'ancien état, qui EXPOSE le SIRET : ne pas l'utiliser pour une simple panne du site.
-- Les fonctions search_pro_directory / pro_directory_cities / request_directory_claim sont à recréer
-- depuis 20261028115448 et 20261028120521 (même dépôt) ; ce fichier ne rétablit que les droits.
begin;
-- GARDE ANTI-REJEU : ce script modifie la production (réexpose le SIRET des fiches de l’annuaire et supprime l’enregistrement de la migration 20261029110000). Il refuse de s'exécuter sans confirmation explicite, typée
-- dans la même exécution, AVANT le script : set zeeroo.confirm_rollback = 'private_prospects';
do $$ begin
  if coalesce(current_setting('zeeroo.confirm_rollback', true), '') <> 'private_prospects' then
    raise exception 'Retour arrière non confirmé. Il réexpose le SIRET des fiches de l’annuaire et supprime l’enregistrement de la migration 20261029110000. Si c''est voulu, taper d''abord : set zeeroo.confirm_rollback = ''private_prospects'';';
  end if;
end $$;
grant select on public.directory_businesses to anon, authenticated;
create policy "listed directory references" on public.directory_businesses for select to anon, authenticated using (is_listed);
grant select on public.directory_claims to authenticated;
create policy "claimant reads own claims" on public.directory_claims for select to authenticated using (claimant_user_id = (select auth.uid()));
delete from supabase_migrations.schema_migrations where version = '20261029110000';
commit;
reset zeeroo.confirm_rollback;
