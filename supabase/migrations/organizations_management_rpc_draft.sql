-- إدارة سجل الجهات عبر RPCs آمنة فقط.
-- لا تنشئ هذه Migration جهات ولا روابط ولا تعدل بيانات تشغيلية.

alter table public.organizations
  add column if not exists description text;

alter table public.organizations
  alter column status set default 'draft',
  alter column organization_type set not null;

alter table public.organizations
  drop constraint if exists organizations_status_check,
  drop constraint if exists organizations_status_metadata_check,
  drop constraint if exists organizations_type_check;

alter table public.organizations
  add constraint organizations_status_check
    check (status in ('draft', 'active', 'disabled')),
  add constraint organizations_status_metadata_check
    check (
      (status in ('draft', 'active') and disabled_at is null and disabled_reason is null)
      or
      (status = 'disabled' and disabled_at is not null
        and disabled_reason is not null and pg_catalog.btrim(disabled_reason) <> '')
    ),
  add constraint organizations_type_check
    check (organization_type in ('secretariat', 'center', 'department', 'other'));

create or replace function private.platform_create_organization_internal(
  p_organization_code text,
  p_organization_name_ar text,
  p_organization_type text,
  p_description text,
  p_organization_status text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_result public.organizations;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can create organizations.'
      using errcode = '42501';
  end if;

  if p_organization_name_ar is null or pg_catalog.btrim(p_organization_name_ar) = '' then
    raise exception 'The Arabic organization name is required.'
      using errcode = '22023';
  end if;

  if p_organization_code is null
     or p_organization_code is distinct from pg_catalog.btrim(p_organization_code)
     or p_organization_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'organization_code must contain lowercase English letters, numbers, and single hyphens only.'
      using errcode = '22023';
  end if;

  if p_organization_type is null
     or p_organization_type not in ('secretariat', 'center', 'department', 'other') then
    raise exception 'Unsupported organization_type.'
      using errcode = '22023';
  end if;

  if p_organization_status is distinct from 'draft' then
    raise exception 'New organizations must be created as draft.'
      using errcode = '22023';
  end if;

  v_code := p_organization_code;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-organization-code:' || v_code, 0)
  );

  if exists (
    select 1
    from public.organizations as o
    where o.organization_code = v_code
  ) then
    raise exception 'organization_code already exists.'
      using errcode = '23505', constraint = 'organizations_code_unique';
  end if;

  insert into public.organizations (
    organization_code,
    organization_name_ar,
    organization_type,
    description,
    status,
    created_by,
    updated_by
  ) values (
    v_code,
    pg_catalog.btrim(p_organization_name_ar),
    p_organization_type,
    nullif(pg_catalog.btrim(p_description), ''),
    'draft',
    v_actor,
    v_actor
  )
  returning * into v_result;

  return v_result;
end;
$function$;

create or replace function private.platform_update_organization_internal(
  p_organization_id uuid,
  p_organization_code text,
  p_organization_name_ar text,
  p_organization_type text,
  p_description text,
  p_expected_lock_version integer
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.organizations;
  v_result public.organizations;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can update organizations.'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required.' using errcode = '22023';
  end if;

  if p_organization_name_ar is null or pg_catalog.btrim(p_organization_name_ar) = '' then
    raise exception 'The Arabic organization name is required.'
      using errcode = '22023';
  end if;

  if p_organization_type is null
     or p_organization_type not in ('secretariat', 'center', 'department', 'other') then
    raise exception 'Unsupported organization_type.'
      using errcode = '22023';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected_lock_version is required.'
      using errcode = '22023';
  end if;

  select o.*
  into v_current
  from public.organizations as o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'Organization was not found.' using errcode = 'P0002';
  end if;

  if p_organization_code is distinct from v_current.organization_code then
    raise exception 'organization_code is immutable after creation.'
      using errcode = '22023';
  end if;

  if v_current.lock_version is distinct from p_expected_lock_version then
    raise exception 'The organization was modified by another transaction.'
      using errcode = '40001';
  end if;

  update public.organizations as o
  set organization_name_ar = pg_catalog.btrim(p_organization_name_ar),
      organization_type = p_organization_type,
      description = nullif(pg_catalog.btrim(p_description), ''),
      updated_by = v_actor
  where o.id = p_organization_id
    and o.lock_version = p_expected_lock_version
  returning o.* into v_result;

  if not found then
    raise exception 'The organization was modified by another transaction.'
      using errcode = '40001';
  end if;

  return v_result;
end;
$function$;

create or replace function private.platform_change_organization_status_internal(
  p_organization_id uuid,
  p_new_status text,
  p_disabled_reason text,
  p_expected_lock_version integer
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.organizations;
  v_result public.organizations;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can change organization status.'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'organization_id is required.' using errcode = '22023';
  end if;

  if p_new_status is null
     or p_new_status not in ('draft', 'active', 'disabled') then
    raise exception 'Unsupported organization status.' using errcode = '22023';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected_lock_version is required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-organization-status:' || p_organization_id::text, 0)
  );

  select o.*
  into v_current
  from public.organizations as o
  where o.id = p_organization_id
  for update;

  if not found then
    raise exception 'Organization was not found.' using errcode = 'P0002';
  end if;

  if v_current.lock_version is distinct from p_expected_lock_version then
    raise exception 'The organization was modified by another transaction.'
      using errcode = '40001';
  end if;

  if not (
    (v_current.status = 'draft' and p_new_status = 'active')
    or (v_current.status = 'active' and p_new_status = 'disabled')
    or (v_current.status = 'disabled' and p_new_status = 'active')
  ) then
    raise exception 'The requested organization status transition is not allowed.'
      using errcode = '22023';
  end if;

  if p_new_status = 'disabled'
     and (p_disabled_reason is null or pg_catalog.btrim(p_disabled_reason) = '') then
    raise exception 'A reason is required when disabling an organization.'
      using errcode = '22023';
  end if;

  update public.organizations as o
  set status = p_new_status,
      disabled_reason = case
        when p_new_status = 'disabled' then pg_catalog.btrim(p_disabled_reason)
        else null
      end,
      updated_by = v_actor
  where o.id = p_organization_id
    and o.lock_version = p_expected_lock_version
  returning o.* into v_result;

  if not found then
    raise exception 'The organization was modified by another transaction.'
      using errcode = '40001';
  end if;

  return v_result;
end;
$function$;

revoke all on function private.platform_create_organization_internal(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function private.platform_update_organization_internal(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function private.platform_change_organization_status_internal(uuid, text, text, integer)
  from public, anon, authenticated;

create or replace function public.platform_create_organization(
  p_organization_code text,
  p_organization_name_ar text,
  p_organization_type text,
  p_description text default null,
  p_organization_status text default 'draft'
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_create_organization_internal(
    p_organization_code,
    p_organization_name_ar,
    p_organization_type,
    p_description,
    p_organization_status
  );
end;
$function$;

create or replace function public.platform_update_organization(
  p_organization_id uuid,
  p_organization_code text,
  p_organization_name_ar text,
  p_organization_type text,
  p_description text,
  p_expected_lock_version integer
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_update_organization_internal(
    p_organization_id,
    p_organization_code,
    p_organization_name_ar,
    p_organization_type,
    p_description,
    p_expected_lock_version
  );
end;
$function$;

create or replace function public.platform_change_organization_status(
  p_organization_id uuid,
  p_new_status text,
  p_disabled_reason text,
  p_expected_lock_version integer
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_change_organization_status_internal(
    p_organization_id,
    p_new_status,
    p_disabled_reason,
    p_expected_lock_version
  );
end;
$function$;

revoke all on function public.platform_create_organization(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.platform_update_organization(uuid, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.platform_change_organization_status(uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.platform_create_organization(text, text, text, text, text)
  to authenticated;
grant execute on function public.platform_update_organization(uuid, text, text, text, text, integer)
  to authenticated;
grant execute on function public.platform_change_organization_status(uuid, text, text, integer)
  to authenticated;
