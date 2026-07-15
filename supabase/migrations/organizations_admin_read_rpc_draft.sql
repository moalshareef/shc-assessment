-- قراءة إدارية محددة الأعمدة لسجل الجهات.
-- لا تعدل هذه Migration بيانات الجهات أو RLS أو صلاحيات الجدول.

create or replace function public.platform_list_organizations()
returns table (
  id uuid,
  organization_code text,
  organization_name_ar text,
  organization_type text,
  description text,
  status text,
  disabled_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  lock_version integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can list organizations.'
      using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.organization_code,
    o.organization_name_ar,
    o.organization_type,
    o.description,
    o.status,
    o.disabled_reason,
    o.created_at,
    o.updated_at,
    o.created_by,
    o.updated_by,
    o.lock_version
  from public.organizations as o
  order by o.created_at desc, o.organization_name_ar;
end;
$function$;

revoke all on function public.platform_list_organizations()
  from public, anon, authenticated;

grant execute on function public.platform_list_organizations()
  to authenticated;
