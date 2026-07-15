-- مسودة غير مطبقة: Module Registry للإدارة المركزية.
-- لا يحتوي الملف حدود معاملة؛ يجب تطبيقه مستقبلًا داخل معاملة واحدة بعد الاعتماد.
-- لا ينشئ platform_role_assignments ولا يمنح صلاحيات system_owner في هذه المرحلة.

create schema if not exists private;

create table if not exists public.platform_modules (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete restrict,
  module_code text not null,
  module_name_ar text not null,
  module_name_en text,
  description text,
  module_status text not null default 'draft',
  route_path text,
  icon_name text,
  display_order integer not null default 0,
  disabled_reason text,
  activated_at timestamptz,
  disabled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  lock_version integer not null default 1,
  constraint platform_modules_workspace_unique unique (workspace_id),
  constraint platform_modules_code_unique unique (module_code),
  constraint platform_modules_code_format_check
    check (module_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint platform_modules_name_ar_check
    check (pg_catalog.btrim(module_name_ar) <> ''),
  constraint platform_modules_status_check
    check (module_status in ('draft', 'active', 'disabled')),
  constraint platform_modules_route_path_check
    check (route_path is null or route_path ~ '^/[A-Za-z0-9/_-]+$'),
  constraint platform_modules_display_order_check
    check (display_order >= 0),
  constraint platform_modules_lock_version_check
    check (lock_version >= 1),
  constraint platform_modules_status_metadata_check
    check (
      (module_status = 'draft'
        and disabled_at is null
        and disabled_reason is null)
      or
      (module_status = 'active'
        and activated_at is not null
        and disabled_at is null
        and disabled_reason is null)
      or
      (module_status = 'disabled'
        and disabled_at is not null
        and disabled_reason is not null
        and pg_catalog.btrim(disabled_reason) <> '')
    )
);

create unique index if not exists platform_modules_route_path_unique_idx
  on public.platform_modules (pg_catalog.lower(route_path))
  where route_path is not null;

create index if not exists platform_modules_status_order_idx
  on public.platform_modules (module_status, display_order, module_code);

create index if not exists platform_modules_created_by_idx
  on public.platform_modules (created_by)
  where created_by is not null;

create index if not exists platform_modules_updated_by_idx
  on public.platform_modules (updated_by)
  where updated_by is not null;

create or replace function private.platform_modules_before_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.module_code is distinct from old.module_code then
    raise exception 'module_code is immutable after creation.'
      using errcode = '22023';
  end if;

  if new.lock_version is distinct from old.lock_version then
    raise exception 'lock_version is managed by the database.'
      using errcode = '22023';
  end if;

  if new.module_status = 'active' and old.module_status is distinct from 'active' then
    new.activated_at := coalesce(new.activated_at, pg_catalog.clock_timestamp());
    new.disabled_at := null;
    new.disabled_reason := null;
  elsif new.module_status = 'disabled' and old.module_status is distinct from 'disabled' then
    if new.disabled_reason is null or pg_catalog.btrim(new.disabled_reason) = '' then
      raise exception 'A disabled module requires a reason.'
        using errcode = '22023';
    end if;
    new.disabled_at := coalesce(new.disabled_at, pg_catalog.clock_timestamp());
  elsif new.module_status <> 'disabled' then
    new.disabled_at := null;
    new.disabled_reason := null;
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  new.lock_version := old.lock_version + 1;
  return new;
end;
$function$;

create or replace function private.platform_admin_prevent_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'Physical deletion is prohibited; use status-based disabling.'
    using errcode = '42501';
end;
$function$;

create or replace function private.platform_admin_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_record_id text;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then pg_catalog.to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then pg_catalog.to_jsonb(new) else null end;
  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  insert into public.audit_logs (
    actor_user_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    created_at
  ) values (
    auth.uid(),
    tg_table_name,
    v_record_id,
    tg_op,
    v_old,
    v_new,
    pg_catalog.clock_timestamp()
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.platform_modules_before_update() from public, anon, authenticated;
revoke all on function private.platform_admin_prevent_delete() from public, anon, authenticated;
revoke all on function private.platform_admin_audit_row() from public, anon, authenticated;

drop trigger if exists platform_modules_10_before_update on public.platform_modules;
create trigger platform_modules_10_before_update
before update on public.platform_modules
for each row execute function private.platform_modules_before_update();

drop trigger if exists platform_modules_20_prevent_delete on public.platform_modules;
create trigger platform_modules_20_prevent_delete
before delete on public.platform_modules
for each row execute function private.platform_admin_prevent_delete();

drop trigger if exists platform_modules_90_audit on public.platform_modules;
create trigger platform_modules_90_audit
after insert or update or delete on public.platform_modules
for each row execute function private.platform_admin_audit_row();

alter table public.platform_modules enable row level security;
alter table public.platform_modules force row level security;

drop policy if exists platform_modules_active_read on public.platform_modules;
create policy platform_modules_active_read
on public.platform_modules
for select
to authenticated
using (
  module_status = 'active'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
  )
);

-- لا توجد سياسات INSERT/UPDATE/DELETE. ستضاف الكتابة لاحقًا عبر RPCs إدارية
-- بعد إنشاء platform_role_assignments وربط system_owner بصورة مستقلة.
revoke all on table public.platform_modules from public, anon, authenticated;
grant select on table public.platform_modules to authenticated;
