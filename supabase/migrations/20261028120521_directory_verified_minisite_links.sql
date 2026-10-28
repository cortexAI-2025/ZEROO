-- Dynamic mini-site links require a staff-verified business linkage.
create or replace function public.search_pro_directory(p_query text default '',p_city text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare total bigint; rows jsonb; query text:=lower(extensions.unaccent(btrim(coalesce(p_query,''))));
begin
 if p_offset is null or p_offset<0 or p_offset>1000000 or length(query)>160 or length(coalesce(p_city,''))>100 then raise exception 'Recherche invalide' using errcode='22023';end if;
 select count(*) into total from public.directory_businesses d where d.is_listed
 and (coalesce(p_city,'')='' or d.city=p_city)
 and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code,d.siret))) like '%'||query||'%');
 select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
  select d.siret,d.display_name,d.address_line,d.postal_code,d.city,d.source_url,d.source_checked_on,
   d.linked_merchant_id is not null as is_claimed,
   coalesce(d.mini_site_path,(select 'https://app.zeeroo.fr/m/'||m.slug from public.merchants m where m.id=d.linked_merchant_id and m.siret=d.siret and m.is_published and public.has_minisite(m) limit 1)) as mini_site_url
  from public.directory_businesses d where d.is_listed and (coalesce(p_city,'')='' or d.city=p_city)
   and (query='' or lower(extensions.unaccent(concat_ws(' ',d.display_name,d.legal_name,d.address_line,d.city,d.postal_code,d.siret))) like '%'||query||'%')
  order by d.city,d.display_name,d.siret limit 25 offset p_offset
 ) x;
 return jsonb_build_object('rows',rows,'total',total,'page_size',25);
end;$$;
