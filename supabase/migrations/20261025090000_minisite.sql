-- Mini-site du professionnel, inclus dans la formule Pro.
--
--  * Le lien public `https://zeeroo.fr/m/<slug>` et la fiche de commande existent pour tous
--    (formule Start comprise) : nom, catégorie, horaires, menu, commande directe.
--  * La formule Pro ajoute la personnalisation : logo, accroche, présentation, couleur, et la
--    carte de situation. Ces réglages se saisissent dans l'espace professionnel, sans double saisie
--    (la photo, les horaires, le menu, les Happy Hours et les modes de commande sont ceux déjà saisis).
--  * Si la formule Pro s'arrête, rien n'est supprimé et le lien ne change pas : la fiche repasse
--    simplement à la présentation Start, et les réglages sont retrouvés au retour en Pro.

alter table public.merchants
  add column logo_url     text check (char_length(logo_url) <= 500),
  add column tagline      text check (char_length(tagline) <= 100),
  add column about        text check (char_length(about) <= 1000),
  add column accent_color text check (accent_color in ('green', 'orange', 'blue', 'red', 'purple', 'dark'));

grant update (logo_url, tagline, about, accent_color) on public.merchants to authenticated;

-- Le mini-site personnalisé est-il actif ? (formule Pro en cours : essai ou abonnement actif)
create or replace function public.has_minisite(m public.merchants)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.merchant_id = m.id and s.plan = 'pro' and s.status in ('trialing', 'active')
  );
$$;

grant execute on function public.has_minisite(public.merchants) to anon, authenticated;

-- Personnaliser demande la formule Pro. Effacer un réglage reste toujours possible.
create or replace function public.check_minisite_option()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.logo_url is distinct from old.logo_url and new.logo_url is not null
      or new.tagline is distinct from old.tagline and new.tagline is not null
      or new.about is distinct from old.about and new.about is not null
      or new.accent_color is distinct from old.accent_color and new.accent_color is not null)
     and not public.has_minisite(new) then
    raise exception 'minisite_requires_pro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger merchants_check_minisite_option
  before update of logo_url, tagline, about, accent_color on public.merchants
  for each row execute function public.check_minisite_option();
