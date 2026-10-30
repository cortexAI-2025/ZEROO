-- Annuaire public = restaurants affiliés uniquement ; fiches Sirene = base privée de prospection.
--
-- Avant : public.directory_businesses (2 390 fiches Sirene, SIRET compris) était lisible en direct par
-- anon et authenticated, et exposée par search_pro_directory / pro_directory_cities (SIRET et lien source
-- contenant le SIRET), avec une revendication par SIRET (request_directory_claim).
-- Après : plus aucun accès public ni fonction de recherche ; les fiches restent en base (aucune
-- suppression) pour la prospection, lisibles seulement par le propriétaire de la base et par les
-- fonctions SECURITY DEFINER de l'administration. L'annuaire public reste celui des affiliés
-- (merchants publiés, mini-sites, QR codes).

-- Fonctions publiques de l'ancien annuaire général (toutes signatures connues, y compris la variante
-- uuid de la première version de la correction).
drop function if exists public.search_pro_directory(text, text, integer);
drop function if exists public.pro_directory_cities();
drop function if exists public.request_directory_claim(text, text, text, text);
drop function if exists public.request_directory_claim(uuid, text, text, text);
drop function if exists admin_private.request_directory_claim(text, text, text, text);
drop function if exists admin_private.request_directory_claim(uuid, text, text, text);

-- Fermeture des tables : plus de lecture directe par l'API, ni pour les fiches, ni pour les demandes.
drop policy if exists "listed directory references" on public.directory_businesses;
drop policy if exists "claimant reads own claims" on public.directory_claims;
revoke all on public.directory_businesses from public, anon, authenticated;
revoke all on public.directory_claims from public, anon, authenticated;
-- RLS reste active (aucune politique pour les rôles de l'API) : refus par défaut même en cas de nouveau grant.
alter table public.directory_businesses enable row level security;
alter table public.directory_claims enable row level security;
