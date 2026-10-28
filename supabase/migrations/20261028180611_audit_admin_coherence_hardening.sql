-- Least privilege even where RLS already rejects anonymous users.
-- The table was historically provisioned manually; the following baseline migration records it.
do $$ begin if to_regclass('public.admin_profiles') is not null then
  revoke all on public.admin_profiles from anon;
end if;end $$;

create function admin_private.profile_identity(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'admin_required' using errcode='42501';end if;
 select jsonb_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,
 'address_line',p.address_line,'postal_code',p.postal_code,'city',p.city,'phone',p.phone,
 'email',u.email,'updated_at',p.updated_at)
 into result from public.profiles p join auth.users u on u.id=p.id where p.id=p_user_id;
 if result is null then raise exception 'profile_not_found' using errcode='P0002';end if;
 return result;
end;$$;
revoke all on function admin_private.profile_identity(uuid) from public,anon;
grant execute on function admin_private.profile_identity(uuid) to authenticated;
create function public.admin_profile_identity(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select admin_private.profile_identity(p_user_id);$$;
revoke all on function public.admin_profile_identity(uuid) from public,anon;
grant execute on function public.admin_profile_identity(uuid) to authenticated;

create function admin_private.directory_claims(p_status text default 'pending',p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total bigint; rows jsonb;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'admin_required' using errcode='42501';end if;
 if p_status is null or p_status not in('all','pending','accepted','rejected') or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'invalid_filter' using errcode='22023';end if;
 select count(*) into total from public.directory_claims c where p_status='all' or c.status=p_status;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into rows from (
  select c.id,c.siret,d.display_name,d.address_line,d.postal_code,d.city,c.claimant_user_id,
   c.contact_email,c.contact_phone,c.capacity,c.evidence_note,c.status,c.created_at,c.review_note,c.updated_at,
   (select m.id from public.merchants m where m.owner_id=c.claimant_user_id and m.siret=c.siret limit 1) as matching_merchant_id
  from public.directory_claims c join public.directory_businesses d on d.siret=c.siret
  where p_status='all' or c.status=p_status order by c.created_at desc,c.id limit 25 offset p_offset
 )x;
 return jsonb_build_object('total',total,'rows',rows,'page_size',25);
end;$$;
revoke all on function admin_private.directory_claims(text,int) from public,anon;
grant execute on function admin_private.directory_claims(text,int) to authenticated;
create function public.admin_directory_claims(p_status text default 'pending',p_offset int default 0)
returns jsonb language sql stable security invoker set search_path='' as $$select admin_private.directory_claims(p_status,p_offset);$$;
revoke all on function public.admin_directory_claims(text,int) from public,anon;
grant execute on function public.admin_directory_claims(text,int) to authenticated;
