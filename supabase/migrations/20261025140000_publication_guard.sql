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
