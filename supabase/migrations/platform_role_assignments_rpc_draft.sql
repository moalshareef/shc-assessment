-- مسودة غير مطبقة: Helpers وRPCs لإدارة أدوار المنصة.
-- لا تنشئ system_owner تلقائيًا. Bootstrap المتاح هنا داخلي وغير ممنوح لأي دور API.

create or replace function private.platform_user_has_role(
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_user_id is not null
    and p_roles is not null
    and exists (
      select 1
      from public.profiles as p
      join public.platform_role_assignments as a on a.user_id = p.id
      where p.id = p_user_id
        and p.is_active
        and a.platform_role = any (p_roles)
        and a.status <> 'revoked'
        and coalesce(a.starts_at, a.created_at) <= pg_catalog.clock_timestamp()
        and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
    );
$function$;

create or replace function private.platform_user_is_system_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.platform_user_has_role(p_user_id, array['system_owner']::text[]);
$function$;

create or replace function private.platform_user_is_active_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.platform_user_has_role(
    p_user_id,
    array['system_owner', 'platform_admin']::text[]
  );
$function$;

revoke all on function private.platform_user_has_role(uuid, text[])
  from public, anon, authenticated;
revoke all on function private.platform_user_is_system_owner(uuid)
  from public, anon, authenticated;
revoke all on function private.platform_user_is_active_admin(uuid)
  from public, anon, authenticated;

-- غلاف قراءة آمن لازم لسياسة RLS فقط؛ لا يقبل user_id ولا يكشف صفوفًا.
create or replace function public.platform_current_user_has_role(p_roles text[])
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return false;
  end if;

  if p_roles is null
     or exists (
       select 1
       from pg_catalog.unnest(p_roles) as r(role_code)
       where r.role_code not in ('system_owner', 'platform_admin', 'auditor', 'viewer')
     ) then
    return false;
  end if;

  return private.platform_user_has_role(v_actor, p_roles);
end;
$function$;

revoke all on function public.platform_current_user_has_role(text[])
  from public, anon, authenticated;
grant execute on function public.platform_current_user_has_role(text[])
  to authenticated;

drop policy if exists platform_role_assignments_self_read
  on public.platform_role_assignments;
drop policy if exists platform_role_assignments_read
  on public.platform_role_assignments;
create policy platform_role_assignments_read
on public.platform_role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
  )
  and (
    user_id = (select auth.uid())
    or (select public.platform_current_user_has_role(array['system_owner', 'auditor']::text[]))
    or (
      platform_role <> 'system_owner'
      and (select public.platform_current_user_has_role(array['platform_admin']::text[]))
    )
  )
);

create or replace function private.platform_grant_role_internal(
  p_user_id uuid,
  p_platform_role text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_result public.platform_role_assignments;
begin
  if v_actor is null or not private.platform_user_is_system_owner(v_actor) then
    raise exception 'Only system_owner may grant platform roles.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'Self-grant and null targets are prohibited.' using errcode = '42501';
  end if;
  if p_platform_role not in ('system_owner', 'platform_admin', 'auditor', 'viewer') then
    raise exception 'Unsupported platform role.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.is_active) then
    raise exception 'Target profile must exist and be active.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, pg_catalog.clock_timestamp()) then
    raise exception 'ends_at must be later than starts_at.' using errcode = '22023';
  end if;
  if p_platform_role = 'system_owner' then
    raise exception 'A system_owner handover must use the atomic replacement path.' using errcode = '42501';
  end if;

  insert into public.platform_role_assignments (
    user_id, platform_role, status, starts_at, ends_at,
    created_by, updated_by
  ) values (
    p_user_id, p_platform_role, 'scheduled', p_starts_at, p_ends_at,
    v_actor, v_actor
  ) returning * into v_result;

  return v_result;
end;
$function$;

create or replace function private.platform_update_role_assignment_internal(
  p_assignment_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_expected_lock_version integer
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.platform_role_assignments;
  v_result public.platform_role_assignments;
begin
  if v_actor is null or not private.platform_user_is_system_owner(v_actor) then
    raise exception 'Only system_owner may update platform roles.' using errcode = '42501';
  end if;
  if p_assignment_id is null or p_expected_lock_version is null then
    raise exception 'Assignment and expected_lock_version are required.' using errcode = '22023';
  end if;

  select * into v_current
  from public.platform_role_assignments
  where id = p_assignment_id
  for update;

  if not found then raise exception 'Assignment not found.' using errcode = 'P0002'; end if;
  if v_current.lock_version <> p_expected_lock_version then
    raise exception 'The assignment was modified by another transaction.' using errcode = '40001';
  end if;
  if v_current.user_id = v_actor then
    raise exception 'A user may not modify their own platform role.' using errcode = '42501';
  end if;
  if v_current.platform_role = 'system_owner' then
    raise exception 'system_owner changes require the atomic handover path.' using errcode = '42501';
  end if;
  if v_current.status = 'revoked' then
    raise exception 'A revoked assignment is immutable.' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_ends_at <= coalesce(p_starts_at, v_current.created_at) then
    raise exception 'ends_at must be later than starts_at.' using errcode = '22023';
  end if;

  update public.platform_role_assignments
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_by = v_actor
  where id = p_assignment_id
    and lock_version = p_expected_lock_version
  returning * into v_result;

  if not found then
    raise exception 'The assignment was modified by another transaction.' using errcode = '40001';
  end if;
  return v_result;
end;
$function$;

create or replace function private.platform_revoke_role_internal(
  p_assignment_id uuid,
  p_revoked_reason text,
  p_expected_lock_version integer,
  p_replacement_user_id uuid
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_current public.platform_role_assignments;
  v_result public.platform_role_assignments;
begin
  if v_actor is null or not private.platform_user_is_system_owner(v_actor) then
    raise exception 'Only system_owner may revoke platform roles.' using errcode = '42501';
  end if;
  if p_assignment_id is null or p_expected_lock_version is null then
    raise exception 'Assignment and expected_lock_version are required.' using errcode = '22023';
  end if;
  if p_revoked_reason is null or pg_catalog.btrim(p_revoked_reason) = '' then
    raise exception 'Revocation reason is required.' using errcode = '22023';
  end if;

  select * into v_current
  from public.platform_role_assignments
  where id = p_assignment_id
  for update;

  if not found then raise exception 'Assignment not found.' using errcode = 'P0002'; end if;
  if v_current.lock_version <> p_expected_lock_version then
    raise exception 'The assignment was modified by another transaction.' using errcode = '40001';
  end if;
  if v_current.status = 'revoked' then
    raise exception 'Assignment is already revoked.' using errcode = '22023';
  end if;

  if v_current.platform_role = 'system_owner' then
    -- الاستثناء الوحيد لتعديل الدور الذاتي: تسليم ذري إلى حساب مختلف ونشط.
    if v_current.user_id <> v_actor then
      raise exception 'Only the current system_owner may perform owner handover.' using errcode = '42501';
    end if;
    if p_replacement_user_id is null or p_replacement_user_id = v_actor then
      raise exception 'Revoking the last system_owner requires a distinct active replacement.' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = p_replacement_user_id and p.is_active
    ) then
      raise exception 'Replacement profile must exist and be active.' using errcode = '22023';
    end if;

    update public.platform_role_assignments
    set status = 'revoked',
        revoked_at = v_now,
        revoked_reason = pg_catalog.btrim(p_revoked_reason),
        updated_by = v_actor
    where id = p_assignment_id and lock_version = p_expected_lock_version
    returning * into v_result;
    if not found then
      raise exception 'The assignment was modified by another transaction.' using errcode = '40001';
    end if;

    insert into public.platform_role_assignments (
      user_id, platform_role, status, starts_at, ends_at,
      created_by, updated_by
    ) values (
      p_replacement_user_id, 'system_owner', 'active', v_now, null,
      v_actor, v_actor
    );
    return v_result;
  end if;

  if v_current.user_id = v_actor then
    raise exception 'A user may not revoke their own platform role.' using errcode = '42501';
  end if;
  if p_replacement_user_id is not null then
    raise exception 'Replacement user is only valid for system_owner handover.' using errcode = '22023';
  end if;

  update public.platform_role_assignments
  set status = 'revoked',
      revoked_at = v_now,
      revoked_reason = pg_catalog.btrim(p_revoked_reason),
      updated_by = v_actor
  where id = p_assignment_id and lock_version = p_expected_lock_version
  returning * into v_result;
  if not found then
    raise exception 'The assignment was modified by another transaction.' using errcode = '40001';
  end if;
  return v_result;
end;
$function$;

create or replace function private.platform_refresh_role_status_internal()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null or not private.platform_user_is_active_admin(v_actor) then
    raise exception 'An active platform administrator is required.' using errcode = '42501';
  end if;

  update public.platform_role_assignments as a
  set updated_by = v_actor
  where a.status <> 'revoked'
    and a.status is distinct from case
      when coalesce(a.starts_at, a.created_at) > pg_catalog.clock_timestamp() then 'scheduled'
      when a.ends_at is not null and a.ends_at <= pg_catalog.clock_timestamp() then 'expired'
      else 'active'
    end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Bootstrap داخلي فقط. في الإنتاج يستدعى مرة واحدة من Migration مضبوطة بـUUID صريح،
-- ثم تسقط الدالة في المعاملة نفسها. لا يعتمد على البريد ولا يخزن كلمة مرور.
create or replace function private.platform_bootstrap_first_system_owner(p_user_id uuid)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result public.platform_role_assignments;
begin
  if p_user_id is null then
    raise exception 'A specific user UUID is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.is_active) then
    raise exception 'Bootstrap target must be an active profile.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.platform_role_assignments a
    where a.platform_role = 'system_owner'
      and a.status <> 'revoked'
      and coalesce(a.starts_at, a.created_at) <= pg_catalog.clock_timestamp()
      and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
  ) then
    raise exception 'An active system_owner already exists.' using errcode = '23505';
  end if;

  insert into public.platform_role_assignments (
    user_id, platform_role, status, starts_at, ends_at,
    created_by, updated_by
  ) values (
    p_user_id, 'system_owner', 'active', pg_catalog.clock_timestamp(), null,
    p_user_id, p_user_id
  ) returning * into v_result;
  return v_result;
end;
$function$;

revoke all on function private.platform_grant_role_internal(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function private.platform_update_role_assignment_internal(uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function private.platform_revoke_role_internal(uuid, text, integer, uuid)
  from public, anon, authenticated;
revoke all on function private.platform_refresh_role_status_internal()
  from public, anon, authenticated;
revoke all on function private.platform_bootstrap_first_system_owner(uuid)
  from public, anon, authenticated;

create or replace function public.platform_grant_role(
  p_user_id uuid,
  p_platform_role text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return private.platform_grant_role_internal(p_user_id, p_platform_role, p_starts_at, p_ends_at);
end;
$function$;

create or replace function public.platform_update_role_assignment(
  p_assignment_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_expected_lock_version integer
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return private.platform_update_role_assignment_internal(
    p_assignment_id, p_starts_at, p_ends_at, p_expected_lock_version
  );
end;
$function$;

create or replace function public.platform_revoke_role(
  p_assignment_id uuid,
  p_revoked_reason text,
  p_expected_lock_version integer,
  p_replacement_user_id uuid default null
)
returns public.platform_role_assignments
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return private.platform_revoke_role_internal(
    p_assignment_id, p_revoked_reason, p_expected_lock_version, p_replacement_user_id
  );
end;
$function$;

create or replace function public.platform_refresh_role_status()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  return private.platform_refresh_role_status_internal();
end;
$function$;

revoke all on function public.platform_grant_role(uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.platform_update_role_assignment(uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.platform_revoke_role(uuid, text, integer, uuid)
  from public, anon, authenticated;
revoke all on function public.platform_refresh_role_status()
  from public, anon, authenticated;

grant execute on function public.platform_grant_role(uuid, text, timestamptz, timestamptz)
  to authenticated;
grant execute on function public.platform_update_role_assignment(uuid, timestamptz, timestamptz, integer)
  to authenticated;
grant execute on function public.platform_revoke_role(uuid, text, integer, uuid)
  to authenticated;
grant execute on function public.platform_refresh_role_status()
  to authenticated;
