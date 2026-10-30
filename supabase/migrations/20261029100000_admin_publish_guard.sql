-- La publication d'un commerce reste réservée aux affiliés, y compris depuis le dashboard administrateur.
--
-- Écart constaté : l'action « publish » de admin_private.console (SECURITY DEFINER) publiait tout commerce
-- actif sans vérifier l'affiliation. Dans cette fonction, current_user vaut « postgres » : la garde de
-- 20261025140000 (qui ne regardait que le rôle SQL) ne s'appliquait donc pas, et un administrateur pouvait
-- rendre public un commerce sans abonnement actif ni moyen d'encaissement.
--
-- Correction : la garde s'applique aussi quand le rôle du jeton de la requête (request.jwt.claims.role,
-- posé par l'API) est « anon » ou « authenticated ». Restent hors garde, par conception :
--  * le serveur (rôle du jeton « service_role » : webhook Stripe, fonctions Edge) ;
--  * l'administration directe de la base (éditeur SQL, migrations : aucun jeton).
create or replace function public.merchants_publication_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_token_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if (current_user in ('anon', 'authenticated') or v_token_role in ('anon', 'authenticated'))
     and new.is_published
     and not (public.is_subscription_active(new) and public.is_payments_ready(new)) then
    -- Publication demandée pour un commerce non affilié : refusée.
    if tg_op = 'INSERT' or not old.is_published then
      raise exception 'merchant_not_affiliated' using errcode = '42501';
    end if;
    -- Commerce déjà publié dont l'encaissement vient d'être retiré : dépublié, pas supprimé.
    new.is_published := false;
  end if;
  return new;
end;
$$;
