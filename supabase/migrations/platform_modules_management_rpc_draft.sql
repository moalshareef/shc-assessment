-- إدارة سجل موديلات المنصة عبر RPCs آمنة فقط.
-- لا تعدل هذه Migration بنية platform_modules أو سياسات RLS أو بيانات الموديلات.

create or replace function private.platform_create_module_internal(
  p_module_code text,
  p_module_name_ar text,
  p_description text,
  p_module_status text
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_result public.platform_modules;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can create platform modules.'
      using errcode = '42501';
  end if;

  if p_module_name_ar is null or pg_catalog.btrim(p_module_name_ar) = '' then
    raise exception 'The Arabic module name is required.'
      using errcode = '22023';
  end if;

  if p_module_code is null
     or p_module_code is distinct from pg_catalog.btrim(p_module_code)
     or p_module_code !~ '^[a-z]+(-[a-z]+)*$' then
    raise exception 'module_code must contain lowercase English letters separated by single hyphens.'
      using errcode = '22023';
  end if;

  if p_module_status is distinct from 'draft' then
    raise exception 'New platform modules must be created as draft.'
      using errcode = '22023';
  end if;

  v_code := p_module_code;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-module-code:' || v_code, 0)
  );

  if exists (
    select 1
    from public.platform_modules as m
    where m.module_code = v_code
  ) then
    raise exception 'module_code already exists.'
      using errcode = '23505', constraint = 'platform_modules_code_unique';
  end if;

  insert into public.platform_modules (
    module_code,
    module_name_ar,
    description,
    module_status,
    created_by,
    updated_by
  ) values (
    v_code,
    pg_catalog.btrim(p_module_name_ar),
    nullif(pg_catalog.btrim(p_description), ''),
    'draft',
    v_actor,
    v_actor
  )
  returning * into v_result;

  return v_result;
end;
$function$;

create or replace function private.platform_update_module_internal(
  p_module_id uuid,
  p_module_code text,
  p_module_name_ar text,
  p_description text,
  p_expected_lock_version integer
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.platform_modules;
  v_result public.platform_modules;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can update platform modules.'
      using errcode = '42501';
  end if;

  if p_module_id is null then
    raise exception 'module_id is required.' using errcode = '22023';
  end if;

  if p_module_name_ar is null or pg_catalog.btrim(p_module_name_ar) = '' then
    raise exception 'The Arabic module name is required.'
      using errcode = '22023';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected_lock_version is required.'
      using errcode = '22023';
  end if;

  select m.*
  into v_current
  from public.platform_modules as m
  where m.id = p_module_id
  for update;

  if not found then
    raise exception 'Platform module was not found.' using errcode = 'P0002';
  end if;

  if p_module_code is distinct from v_current.module_code then
    raise exception 'module_code is immutable after creation.'
      using errcode = '22023';
  end if;

  if v_current.lock_version is distinct from p_expected_lock_version then
    raise exception 'The module was modified by another transaction.'
      using errcode = '40001';
  end if;

  update public.platform_modules as m
  set module_name_ar = pg_catalog.btrim(p_module_name_ar),
      description = nullif(pg_catalog.btrim(p_description), ''),
      updated_by = v_actor
  where m.id = p_module_id
    and m.lock_version = p_expected_lock_version
  returning m.* into v_result;

  if not found then
    raise exception 'The module was modified by another transaction.'
      using errcode = '40001';
  end if;

  return v_result;
end;
$function$;

create or replace function private.platform_change_module_status_internal(
  p_module_id uuid,
  p_new_status text,
  p_disabled_reason text,
  p_expected_lock_version integer
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_current public.platform_modules;
  v_result public.platform_modules;
begin
  if v_actor is null
     or not private.platform_user_has_role(v_actor, array['system_owner']::text[]) then
    raise exception 'Only an active system_owner can change platform module status.'
      using errcode = '42501';
  end if;

  if p_module_id is null then
    raise exception 'module_id is required.' using errcode = '22023';
  end if;

  if p_new_status is null
     or p_new_status not in ('draft', 'active', 'disabled') then
    raise exception 'Unsupported module status.' using errcode = '22023';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected_lock_version is required.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-module-status:' || p_module_id::text, 0)
  );

  select m.*
  into v_current
  from public.platform_modules as m
  where m.id = p_module_id
  for update;

  if not found then
    raise exception 'Platform module was not found.' using errcode = 'P0002';
  end if;

  if v_current.lock_version is distinct from p_expected_lock_version then
    raise exception 'The module was modified by another transaction.'
      using errcode = '40001';
  end if;

  if not (
    (v_current.module_status = 'draft' and p_new_status = 'active')
    or (v_current.module_status = 'active' and p_new_status = 'disabled')
    or (v_current.module_status = 'disabled' and p_new_status = 'active')
  ) then
    raise exception 'The requested module status transition is not allowed.'
      using errcode = '22023';
  end if;

  if p_new_status = 'disabled'
     and (p_disabled_reason is null or pg_catalog.btrim(p_disabled_reason) = '') then
    raise exception 'A reason is required when disabling a module.'
      using errcode = '22023';
  end if;

  update public.platform_modules as m
  set module_status = p_new_status,
      disabled_reason = case
        when p_new_status = 'disabled' then pg_catalog.btrim(p_disabled_reason)
        else null
      end,
      updated_by = v_actor
  where m.id = p_module_id
    and m.lock_version = p_expected_lock_version
  returning m.* into v_result;

  if not found then
    raise exception 'The module was modified by another transaction.'
      using errcode = '40001';
  end if;

  return v_result;
end;
$function$;

revoke all on function private.platform_create_module_internal(text, text, text, text)
  from public, anon, authenticated;
revoke all on function private.platform_update_module_internal(uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function private.platform_change_module_status_internal(uuid, text, text, integer)
  from public, anon, authenticated;

create or replace function public.platform_create_module(
  p_module_code text,
  p_module_name_ar text,
  p_description text default null,
  p_module_status text default 'draft'
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_create_module_internal(
    p_module_code,
    p_module_name_ar,
    p_description,
    p_module_status
  );
end;
$function$;

create or replace function public.platform_update_module(
  p_module_id uuid,
  p_module_code text,
  p_module_name_ar text,
  p_description text,
  p_expected_lock_version integer
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_update_module_internal(
    p_module_id,
    p_module_code,
    p_module_name_ar,
    p_description,
    p_expected_lock_version
  );
end;
$function$;

create or replace function public.platform_change_module_status(
  p_module_id uuid,
  p_new_status text,
  p_disabled_reason text,
  p_expected_lock_version integer
)
returns public.platform_modules
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  return private.platform_change_module_status_internal(
    p_module_id,
    p_new_status,
    p_disabled_reason,
    p_expected_lock_version
  );
end;
$function$;

revoke all on function public.platform_create_module(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.platform_update_module(uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.platform_change_module_status(uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.platform_create_module(text, text, text, text)
  to authenticated;
grant execute on function public.platform_update_module(uuid, text, text, text, integer)
  to authenticated;
grant execute on function public.platform_change_module_status(uuid, text, text, integer)
  to authenticated;
