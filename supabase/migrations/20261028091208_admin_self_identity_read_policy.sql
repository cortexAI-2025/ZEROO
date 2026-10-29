-- Rétabli depuis la base de production : cette migration y a été appliquée (version 20261028091208)
-- sans être versionnée dans Git. Contenu repris à l'identique de supabase_migrations.schema_migrations.
grant select on public.platform_admins to authenticated; create policy "platform admin own membership" on public.platform_admins for select to authenticated using (user_id=(select auth.uid()));
