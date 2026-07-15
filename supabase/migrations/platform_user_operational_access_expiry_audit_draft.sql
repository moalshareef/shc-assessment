-- يكمل تدقيق تحويل الصلاحية المنتهية زمنيًا قبل إنشاء Grant بديل.
-- لا يغير الجداول أو RLS أو البيانات التشغيلية.

begin;

create or replace function public.platform_grant_user_access(
  p_user_id uuid, p_workspace_id uuid, p_organization_id uuid,
  p_role_code text, p_access_scope text,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null
)
returns public.user_module_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_start timestamptz := coalesce(p_starts_at, pg_catalog.clock_timestamp());
  v_module uuid;
  v_row public.user_module_access;
  v_expired_old public.user_module_access;
  v_expired_new public.user_module_access;
begin
  v_actor := private.platform_require_system_owner();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operational-access:' || p_user_id::text || ':' || p_workspace_id::text || ':' || p_organization_id::text, 0));
  v_module := private.platform_validate_operational_access(p_user_id, p_workspace_id, p_organization_id, p_role_code, p_access_scope, v_start, p_ends_at);

  for v_expired_old in
    select a.* from public.user_module_access a
    where a.user_id = p_user_id and a.workspace_id = p_workspace_id and a.organization_id = p_organization_id
      and a.status in ('scheduled', 'active') and a.ends_at is not null and a.ends_at <= pg_catalog.clock_timestamp()
    for update
  loop
    update public.user_module_access a set status = 'expired', updated_by = v_actor,
      updated_at = pg_catalog.clock_timestamp(), lock_version = a.lock_version + 1
    where a.id = v_expired_old.id returning * into v_expired_new;
    insert into public.audit_logs(actor_user_id, table_name, record_id, action, old_data, new_data)
    values (v_actor, 'user_module_access', v_expired_new.id::text, 'UPDATE', to_jsonb(v_expired_old), to_jsonb(v_expired_new));
  end loop;

  if exists (select 1 from public.user_module_access a where a.user_id=p_user_id and a.workspace_id=p_workspace_id and a.organization_id=p_organization_id and a.status in ('scheduled','active')) then
    raise exception using errcode = '23505', message = 'An active or scheduled access assignment already exists.';
  end if;

  insert into public.user_module_access (
    user_id, workspace_id, module_id, organization_id, role_code, access_scope, status,
    starts_at, ends_at, created_by, updated_by
  ) values (
    p_user_id, p_workspace_id, v_module, p_organization_id, p_role_code, p_access_scope,
    case when v_start > pg_catalog.clock_timestamp() then 'scheduled' else 'active' end,
    v_start, p_ends_at, v_actor, v_actor
  ) returning * into v_row;

  insert into public.audit_logs(actor_user_id, table_name, record_id, action, old_data, new_data)
  values (v_actor, 'user_module_access', v_row.id::text, 'INSERT', null, to_jsonb(v_row));
  return v_row;
end;
$$;

revoke all on function public.platform_grant_user_access(uuid,uuid,uuid,text,text,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.platform_grant_user_access(uuid,uuid,uuid,text,text,timestamptz,timestamptz)
  to authenticated;

commit;
