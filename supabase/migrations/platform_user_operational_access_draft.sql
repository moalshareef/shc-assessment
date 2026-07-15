-- مسودة/هجرة الصلاحيات التشغيلية المركزية للمستخدمين.
-- تربط الصلاحية بمساحة العمل والجهة، ولا تعدل profiles.role أو platform_role_assignments.

begin;

create table if not exists public.user_module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  module_id uuid null references public.platform_modules(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  role_code text not null,
  access_scope text not null,
  status text not null,
  starts_at timestamptz not null default pg_catalog.clock_timestamp(),
  ends_at timestamptz null,
  revoked_at timestamptz null,
  revoked_by uuid null references public.profiles(id) on delete restrict,
  revoke_reason text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  lock_version integer not null default 1,
  constraint user_module_access_role_check
    check (role_code in ('financial_control_employee', 'financial_control_manager')),
  constraint user_module_access_scope_check
    check (access_scope in ('assigned_records', 'organization_records', 'all_records')),
  constraint user_module_access_status_check
    check (status in ('scheduled', 'active', 'expired', 'revoked')),
  constraint user_module_access_dates_check
    check (ends_at is null or ends_at > starts_at),
  constraint user_module_access_lock_check check (lock_version > 0),
  constraint user_module_access_revocation_check check (
    (status = 'revoked' and revoked_at is not null and revoked_by is not null and nullif(btrim(revoke_reason), '') is not null)
    or (status <> 'revoked' and revoked_at is null and revoked_by is null and revoke_reason is null)
  )
);

comment on table public.user_module_access is
  'Central operational access. Workspace is authoritative until each platform module is linked one-to-one to a workspace.';

create unique index if not exists user_module_access_current_unique_idx
  on public.user_module_access (user_id, workspace_id, organization_id)
  where status in ('scheduled', 'active');
create index if not exists user_module_access_user_effective_idx
  on public.user_module_access (user_id, workspace_id, status, starts_at, ends_at);
create index if not exists user_module_access_admin_list_idx
  on public.user_module_access (workspace_id, organization_id, status, created_at desc);
create index if not exists user_module_access_module_idx
  on public.user_module_access (module_id) where module_id is not null;
create index if not exists user_module_access_organization_idx
  on public.user_module_access (organization_id);
create index if not exists user_module_access_revoked_by_idx
  on public.user_module_access (revoked_by) where revoked_by is not null;
create index if not exists user_module_access_created_by_idx on public.user_module_access (created_by);
create index if not exists user_module_access_updated_by_idx on public.user_module_access (updated_by);

alter table public.user_module_access enable row level security;
alter table public.user_module_access force row level security;

drop policy if exists user_module_access_select_self on public.user_module_access;
create policy user_module_access_select_self
on public.user_module_access for select to authenticated
using (user_id = (select auth.uid()));

revoke all on table public.user_module_access from public, anon, authenticated;
grant select on table public.user_module_access to authenticated;

create or replace function private.platform_require_system_owner()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception using errcode = '42501', message = 'Active system_owner role is required.';
  end if;
  return v_actor;
end;
$$;

create or replace function private.platform_validate_operational_access(
  p_user_id uuid,
  p_workspace_id uuid,
  p_organization_id uuid,
  p_role_code text,
  p_access_scope text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_module_id uuid;
begin
  if p_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_user_id and p.is_active
  ) then
    raise exception using errcode = '22023', message = 'Target user must have an active profile.';
  end if;

  if p_organization_id is null or not exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active'
  ) then
    raise exception using errcode = '22023', message = 'An active organization is required.';
  end if;

  if not exists (
    select 1
    from public.user_organizations uo
    where uo.user_id = p_user_id
      and uo.organization_id = p_organization_id
      and uo.status = 'active'
      and uo.starts_at <= pg_catalog.clock_timestamp()
      and (uo.ends_at is null or uo.ends_at > pg_catalog.clock_timestamp())
  ) then
    raise exception using errcode = '22023', message = 'Target user must have an active membership in the organization.';
  end if;

  if p_workspace_id is null or not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.status = 'active' and w.code = 'financial-control'
  ) then
    raise exception using errcode = '22023', message = 'Only the active financial-control workspace is supported in this phase.';
  end if;

  if p_role_code is null or p_role_code not in ('financial_control_employee', 'financial_control_manager') then
    raise exception using errcode = '22023', message = 'Unsupported operational role.';
  end if;
  if p_access_scope is null or p_access_scope not in ('assigned_records', 'organization_records', 'all_records') then
    raise exception using errcode = '22023', message = 'Unsupported access scope.';
  end if;
  if p_starts_at is null or (p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception using errcode = '22023', message = 'Invalid access time window.';
  end if;
  if p_ends_at is not null and p_ends_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'Access end time must be in the future.';
  end if;

  select pm.id into v_module_id
  from public.platform_modules pm
  where pm.workspace_id = p_workspace_id and pm.module_status <> 'disabled';
  return v_module_id;
end;
$$;

create or replace function private.platform_user_has_operational_access(
  p_user_id uuid,
  p_workspace_id uuid,
  p_role_codes text[] default null,
  p_access_scopes text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from public.user_module_access a
    join public.profiles p on p.id = a.user_id and p.is_active
    join public.organizations o on o.id = a.organization_id and o.status = 'active'
    join public.user_organizations uo
      on uo.user_id = a.user_id and uo.organization_id = a.organization_id
    where a.user_id = p_user_id
      and a.workspace_id = p_workspace_id
      and a.status in ('scheduled', 'active')
      and a.revoked_at is null
      and a.starts_at <= pg_catalog.clock_timestamp()
      and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
      and uo.status = 'active'
      and uo.starts_at <= pg_catalog.clock_timestamp()
      and (uo.ends_at is null or uo.ends_at > pg_catalog.clock_timestamp())
      and (p_role_codes is null or a.role_code = any(p_role_codes))
      and (p_access_scopes is null or a.access_scope = any(p_access_scopes))
  );
$$;

create or replace function public.platform_list_user_access()
returns table (
  id uuid, user_id uuid, email text, full_name text,
  workspace_id uuid, workspace_code text, workspace_name text,
  module_id uuid, organization_id uuid, organization_name_ar text,
  role_code text, access_scope text, status text,
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz, updated_at timestamptz, lock_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.platform_require_system_owner();
  return query
  select a.id, a.user_id, u.email::text, p.full_name,
    a.workspace_id, w.code, w.name, a.module_id,
    a.organization_id, o.organization_name_ar,
    a.role_code, a.access_scope,
    case
      when a.status = 'revoked' then 'revoked'
      when a.ends_at is not null and a.ends_at <= pg_catalog.clock_timestamp() then 'expired'
      when a.starts_at > pg_catalog.clock_timestamp() then 'scheduled'
      else 'active'
    end,
    a.starts_at, a.ends_at, a.created_at, a.updated_at, a.lock_version
  from public.user_module_access a
  join auth.users u on u.id = a.user_id
  join public.profiles p on p.id = a.user_id
  join public.workspaces w on w.id = a.workspace_id
  join public.organizations o on o.id = a.organization_id
  order by a.created_at desc, p.full_name;
end;
$$;

create or replace function public.platform_list_operational_workspaces()
returns table (id uuid, code text, name text, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.platform_require_system_owner();
  return query
  select w.id, w.code, w.name, w.status
  from public.workspaces w
  where w.status = 'active' and w.code = 'financial-control'
  order by w.name;
end;
$$;

create or replace function public.platform_current_user_operational_access()
returns table (
  workspace_id uuid, workspace_code text, workspace_name text,
  organization_id uuid, role_code text, access_scope text, source text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not exists (select 1 from public.profiles p where p.id = v_user and p.is_active) then
    raise exception using errcode = '42501', message = 'Active authenticated profile is required.';
  end if;

  return query
  select a.workspace_id, w.code, w.name, a.organization_id, a.role_code, a.access_scope, 'central'::text
  from public.user_module_access a
  join public.workspaces w on w.id = a.workspace_id and w.status = 'active'
  join public.organizations o on o.id = a.organization_id and o.status = 'active'
  join public.user_organizations uo on uo.user_id = a.user_id and uo.organization_id = a.organization_id
  where a.user_id = v_user
    and a.status in ('scheduled', 'active') and a.revoked_at is null
    and a.starts_at <= pg_catalog.clock_timestamp()
    and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
    and uo.status = 'active' and uo.starts_at <= pg_catalog.clock_timestamp()
    and (uo.ends_at is null or uo.ends_at > pg_catalog.clock_timestamp())
  union all
  select fm.workspace_id, w.code, w.name, null::uuid,
    case when pg_catalog.bool_or(fm.role in ('owner', 'manager')) then 'financial_control_manager' else 'financial_control_employee' end,
    case when pg_catalog.bool_or(fm.role in ('owner', 'manager', 'specialist', 'viewer')) then 'all_records' else 'assigned_records' end,
    'legacy_financial_control'::text
  from public.financial_control_members fm
  join public.workspaces w on w.id = fm.workspace_id and w.status = 'active'
  where fm.user_id = v_user and fm.is_active
    and fm.starts_at <= pg_catalog.clock_timestamp()
    and (fm.ends_at is null or fm.ends_at > pg_catalog.clock_timestamp())
  group by fm.workspace_id, w.code, w.name
  union all
  select wm.workspace_id, w.code, w.name, null::uuid,
    ('legacy_workspace_' || wm.role)::text, 'all_records'::text, 'legacy_workspace'::text
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id and w.status = 'active'
  where wm.user_id = v_user
    and not exists (
      select 1 from public.financial_control_members fm
      where fm.user_id = v_user and fm.workspace_id = wm.workspace_id and fm.is_active
    );
end;
$$;

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

create or replace function public.platform_update_user_access(
  p_access_id uuid, p_role_code text, p_access_scope text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_expected_lock_version integer
)
returns public.user_module_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid; v_old public.user_module_access; v_new public.user_module_access; v_module uuid;
begin
  v_actor := private.platform_require_system_owner();
  select * into v_old from public.user_module_access where id = p_access_id for update;
  if not found then raise exception using errcode='P0002', message='Access assignment was not found.'; end if;
  if v_old.status in ('revoked','expired') then raise exception using errcode='22023', message='Revoked or expired access cannot be edited.'; end if;
  if v_old.lock_version <> p_expected_lock_version then raise exception using errcode='40001', message='Access assignment changed by another transaction.'; end if;
  v_module := private.platform_validate_operational_access(v_old.user_id, v_old.workspace_id, v_old.organization_id, p_role_code, p_access_scope, p_starts_at, p_ends_at);
  update public.user_module_access set role_code=p_role_code, access_scope=p_access_scope,
    module_id=v_module, starts_at=p_starts_at, ends_at=p_ends_at,
    status=case when p_starts_at > pg_catalog.clock_timestamp() then 'scheduled' else 'active' end,
    updated_by=v_actor, updated_at=pg_catalog.clock_timestamp(), lock_version=lock_version+1
  where id=p_access_id and lock_version=p_expected_lock_version returning * into v_new;
  if not found then raise exception using errcode='40001', message='Access assignment changed by another transaction.'; end if;
  insert into public.audit_logs(actor_user_id,table_name,record_id,action,old_data,new_data)
  values(v_actor,'user_module_access',v_new.id::text,'UPDATE',to_jsonb(v_old),to_jsonb(v_new));
  return v_new;
end;
$$;

create or replace function public.platform_revoke_user_access(
  p_access_id uuid, p_reason text, p_expected_lock_version integer
)
returns public.user_module_access
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid; v_old public.user_module_access; v_new public.user_module_access;
begin
  v_actor := private.platform_require_system_owner();
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='22023', message='Revocation reason is required.'; end if;
  select * into v_old from public.user_module_access where id=p_access_id for update;
  if not found then raise exception using errcode='P0002', message='Access assignment was not found.'; end if;
  if v_old.status='revoked' then raise exception using errcode='22023', message='Access assignment is already revoked.'; end if;
  if v_old.lock_version<>p_expected_lock_version then raise exception using errcode='40001', message='Access assignment changed by another transaction.'; end if;
  update public.user_module_access set status='revoked', revoked_at=pg_catalog.clock_timestamp(),
    revoked_by=v_actor, revoke_reason=btrim(p_reason), updated_by=v_actor,
    updated_at=pg_catalog.clock_timestamp(), lock_version=lock_version+1
  where id=p_access_id and lock_version=p_expected_lock_version returning * into v_new;
  if not found then raise exception using errcode='40001', message='Access assignment changed by another transaction.'; end if;
  insert into public.audit_logs(actor_user_id,table_name,record_id,action,old_data,new_data)
  values(v_actor,'user_module_access',v_new.id::text,'UPDATE',to_jsonb(v_old),to_jsonb(v_new));
  return v_new;
end;
$$;

-- دمج المصدر المركزي مع العضويات القديمة دون حذفها أو تعديل بياناتها.
create or replace function private.financial_control_has_role(p_workspace_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.financial_control_members m
    where m.workspace_id=p_workspace_id and m.user_id=(select auth.uid()) and m.role=any(p_roles)
      and m.is_active and m.starts_at<=pg_catalog.clock_timestamp()
      and (m.ends_at is null or m.ends_at>pg_catalog.clock_timestamp())
  ) or (
    ('manager'=any(p_roles) and private.platform_user_has_operational_access((select auth.uid()),p_workspace_id,array['financial_control_manager']::text[],null))
    or ('action_owner'=any(p_roles) and private.platform_user_has_operational_access((select auth.uid()),p_workspace_id,array['financial_control_employee']::text[],null))
  );
$$;

create or replace function private.can_access_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_system_admin()
    or exists (
      select 1 from public.workspace_members wm
      join public.profiles p on p.id=wm.user_id and p.is_active
      where wm.workspace_id=target_workspace_id and wm.user_id=(select auth.uid())
    )
    or private.platform_user_has_operational_access((select auth.uid()),target_workspace_id,null,null);
$$;

create or replace function private.financial_control_user_has_role(p_workspace_id uuid,p_user_id uuid,p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.financial_control_members m
    where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.role=any(p_roles)
      and m.is_active and m.starts_at<=pg_catalog.clock_timestamp()
      and (m.ends_at is null or m.ends_at>pg_catalog.clock_timestamp())
  ) or (
    ('manager'=any(p_roles) and private.platform_user_has_operational_access(p_user_id,p_workspace_id,array['financial_control_manager']::text[],null))
    or ('action_owner'=any(p_roles) and private.platform_user_has_operational_access(p_user_id,p_workspace_id,array['financial_control_employee']::text[],null))
  );
$$;

create or replace function private.financial_control_can_read_finding(p_workspace_id uuid,p_finding_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.financial_control_has_role(p_workspace_id,array['owner','manager','specialist','viewer']::text[])
    or private.platform_user_has_operational_access((select auth.uid()),p_workspace_id,
         array['financial_control_employee']::text[],array['organization_records','all_records']::text[])
    or (private.financial_control_has_role(p_workspace_id,array['action_owner']::text[]) and exists (
      select 1 from public.corrective_actions ca where ca.workspace_id=p_workspace_id
        and ca.finding_id=p_finding_id and ca.responsible_user_id=(select auth.uid())
    ));
$$;

create or replace function private.financial_control_can_read_item(p_workspace_id uuid,p_finding_id uuid,p_corrective_action_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.financial_control_has_role(p_workspace_id,array['owner','manager','specialist','viewer']::text[])
    or private.platform_user_has_operational_access((select auth.uid()),p_workspace_id,
         array['financial_control_employee']::text[],array['organization_records','all_records']::text[])
    or (p_corrective_action_id is not null and private.financial_control_has_role(p_workspace_id,array['action_owner']::text[]) and exists (
      select 1 from public.corrective_actions ca where ca.id=p_corrective_action_id
        and ca.workspace_id=p_workspace_id and ca.finding_id=p_finding_id
        and ca.responsible_user_id=(select auth.uid())
    ));
$$;

revoke all on function private.platform_require_system_owner() from public, anon, authenticated;
revoke all on function private.platform_validate_operational_access(uuid,uuid,uuid,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function private.platform_user_has_operational_access(uuid,uuid,text[],text[]) from public, anon, authenticated;
-- لا تغيّر ACL للدوال القديمة أعلاه؛ تحتاجها سياسات RLS الحالية للرقابة المالية والركائز.

revoke all on function public.platform_list_user_access() from public, anon, authenticated;
revoke all on function public.platform_list_operational_workspaces() from public, anon, authenticated;
revoke all on function public.platform_current_user_operational_access() from public, anon, authenticated;
revoke all on function public.platform_grant_user_access(uuid,uuid,uuid,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.platform_update_user_access(uuid,text,text,timestamptz,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.platform_revoke_user_access(uuid,text,integer) from public, anon, authenticated;

grant execute on function public.platform_list_user_access() to authenticated;
grant execute on function public.platform_list_operational_workspaces() to authenticated;
grant execute on function public.platform_current_user_operational_access() to authenticated;
grant execute on function public.platform_grant_user_access(uuid,uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.platform_update_user_access(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;
grant execute on function public.platform_revoke_user_access(uuid,text,integer) to authenticated;

commit;
