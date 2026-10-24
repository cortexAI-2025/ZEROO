-- Photos : produits (menu_items.image_url, déjà présent), restaurants et livreurs.
-- Fichiers dans le bucket public « photos » :
--   merchants/<merchant_id>/…  (photo du restaurant, photos des produits) : le propriétaire ;
--   couriers/<courier_id>/…    (photo du livreur) : le livreur.
-- Les URL publiques sont enregistrées dans les tables.

alter table public.merchants add column photo_url text check (char_length(photo_url) <= 500);
alter table public.couriers add column photo_url text check (char_length(photo_url) <= 500);

grant update (photo_url) on public.merchants to authenticated;
grant update (photo_url) on public.couriers to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Le dossier d'un fichier appartient-il à l'utilisateur connecté ?
create or replace function public.can_write_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_id uuid;
begin
  if array_length(v_parts, 1) < 3 then
    return false;
  end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return case v_parts[1]
    when 'merchants' then public.is_merchant_owner(v_id)
    when 'couriers' then v_id = public.current_courier_id()
    else false
  end;
end;
$$;

revoke execute on function public.can_write_photo from public, anon;
grant execute on function public.can_write_photo to authenticated;

create policy "photos: envoi par le propriétaire du dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_write_photo(name));

create policy "photos: remplacement par le propriétaire du dossier"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_write_photo(name))
  with check (bucket_id = 'photos' and public.can_write_photo(name));

create policy "photos: suppression par le propriétaire du dossier"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_write_photo(name));

-- Le client voit son livreur pendant la livraison (prénom, photo, véhicule, note), sans
-- jamais lire la table couriers.
create or replace function public.order_courier_profile(p_order_id uuid)
returns table (display_name text, photo_url text, vehicle public.courier_vehicle,
               average numeric, reviews_count int)
language sql
stable
security definer
set search_path = ''
as $$
  select split_part(c.display_name, ' ', 1), c.photo_url, c.vehicle,
         (select round(avg(r.courier_stars), 1) from public.order_reviews r
          where r.courier_id = c.id and r.courier_stars is not null),
         (select count(*)::int from public.order_reviews r
          where r.courier_id = c.id and r.courier_stars is not null)
  from public.orders o
  join public.couriers c on c.id = o.courier_id
  where o.id = p_order_id
    and o.customer_id = (select auth.uid());
$$;

revoke execute on function public.order_courier_profile from public, anon;
grant execute on function public.order_courier_profile to authenticated;
