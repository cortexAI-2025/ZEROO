-- Retour arrière de 20261029110000_private_prospects (à n'utiliser que sur décision explicite).
-- Il rétablit l'ancien état, qui EXPOSE le SIRET : ne pas l'utiliser pour une simple panne du site.
-- Les fonctions search_pro_directory / pro_directory_cities / request_directory_claim sont à recréer
-- depuis 20261028115448 et 20261028120521 (même dépôt) ; ce fichier ne rétablit que les droits.
begin;
grant select on public.directory_businesses to anon, authenticated;
create policy "listed directory references" on public.directory_businesses for select to anon, authenticated using (is_listed);
grant select on public.directory_claims to authenticated;
create policy "claimant reads own claims" on public.directory_claims for select to authenticated using (claimant_user_id = (select auth.uid()));
delete from supabase_migrations.schema_migrations where version = '20261029110000';
commit;
