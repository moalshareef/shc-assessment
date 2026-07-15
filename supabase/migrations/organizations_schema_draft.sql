-- مسودة غير مطبقة: Organizations والربط الانتقالي مع departments.
-- لا يحتوي الملف حدود معاملة؛ يجب تطبيقه مستقبلًا داخل معاملة واحدة بعد الاعتماد.
-- لا ينقل بيانات departments ولا ينشئ user_organizations.

create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_code text not null,
  organization_name_ar text not null,
  organization_name_en text,
  parent_organization_id uuid references public.organizations(id) on delete restrict,
  organization_type text,
  status text not null default 'active',
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  disabled_at timestamptz,
  disabled_reason text,
  lock_version integer not null default 1,
  constraint organizations_code_unique unique (organization_code),
  constraint organizations_code_format_check
    check (organization_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_name_ar_check
    check (pg_catalog.btrim(organization_name_ar) <> ''),
  constraint organizations_not_self_parent_check
    check (parent_organization_id is null or parent_organization_id <> id),
  constraint organizations_status_check
    check (status in ('active', 'disabled')),
  constraint organizations_status_metadata_check
    check (
      (status = 'active' and disabled_at is null and disabled_reason is null)
      or
      (status = 'disabled'
        and disabled_at is not null
        and disabled_reason is not null
        and pg_catalog.btrim(disabled_reason) <> '')
    ),
  constraint organizations_display_order_check
    check (display_order >= 0),
  constraint organizations_lock_version_check
    check (lock_version >= 1)
);

create index if not exists organizations_parent_order_idx
  on public.organizations (parent_organization_id, display_order, organization_code);

create index if not exists organizations_status_order_idx
  on public.organizations (status, display_order, organization_code);

create index if not exists organizations_created_by_idx
  on public.organizations (created_by)
  where created_by is not null;

create index if not exists organizations_updated_by_idx
  on public.organizations (updated_by)
  where updated_by is not null;

create table if not exists public.organization_department_mappings (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  department_id uuid not null references public.departments(id) on delete restrict,
  is_primary boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint organization_department_mappings_pair_unique
    unique (organization_id, department_id)
);

create index if not exists organization_department_mappings_organization_idx
  on public.organization_department_mappings (organization_id);

create index if not exists organization_department_mappings_department_idx
  on public.organization_department_mappings (department_id);

create index if not exists organization_department_mappings_created_by_idx
  on public.organization_department_mappings (created_by)
  where created_by is not null;

-- يسمح بأكثر من Department للجهة، لكن لا يكون Department نفسه ربطًا رئيسيًا
-- لأكثر من Organization في الوقت نفسه.
create unique index if not exists organization_department_mappings_primary_department_unique_idx
  on public.organization_department_mappings (department_id)
  where is_primary;

create or replace function private.organizations_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_code is distinct from old.organization_code then
      raise exception 'organization_code is immutable after creation.'
        using errcode = '22023';
    end if;

    if new.lock_version is distinct from old.lock_version then
      raise exception 'lock_version is managed by the database.'
        using errcode = '22023';
    end if;
  end if;

  if new.parent_organization_id is not null then
    if new.parent_organization_id = new.id then
      raise exception 'An organization cannot be its own parent.'
        using errcode = '23514';
    end if;

    if exists (
      with recursive ancestors as (
        select o.id, o.parent_organization_id
        from public.organizations as o
        where o.id = new.parent_organization_id

        union all

        select o.id, o.parent_organization_id
        from public.organizations as o
        join ancestors as a on o.id = a.parent_organization_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'The organization hierarchy cannot contain a cycle.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'disabled' and old.status is distinct from 'disabled' then
      if new.disabled_reason is null or pg_catalog.btrim(new.disabled_reason) = '' then
        raise exception 'A disabled organization requires a reason.'
          using errcode = '22023';
      end if;
      new.disabled_at := coalesce(new.disabled_at, pg_catalog.clock_timestamp());
    elsif new.status = 'active' then
      new.disabled_at := null;
      new.disabled_reason := null;
    end if;

    new.updated_at := pg_catalog.clock_timestamp();
    new.lock_version := old.lock_version + 1;
  end if;

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

revoke all on function private.organizations_before_write() from public, anon, authenticated;
revoke all on function private.platform_admin_prevent_delete() from public, anon, authenticated;
revoke all on function private.platform_admin_audit_row() from public, anon, authenticated;

drop trigger if exists organizations_10_before_write on public.organizations;
create trigger organizations_10_before_write
before insert or update on public.organizations
for each row execute function private.organizations_before_write();

drop trigger if exists organizations_20_prevent_delete on public.organizations;
create trigger organizations_20_prevent_delete
before delete on public.organizations
for each row execute function private.platform_admin_prevent_delete();

drop trigger if exists organizations_90_audit on public.organizations;
create trigger organizations_90_audit
after insert or update or delete on public.organizations
for each row execute function private.platform_admin_audit_row();

drop trigger if exists organization_department_mappings_90_audit
  on public.organization_department_mappings;
create trigger organization_department_mappings_90_audit
after insert or update or delete on public.organization_department_mappings
for each row execute function private.platform_admin_audit_row();

alter table public.organizations enable row level security;
alter table public.organizations force row level security;
alter table public.organization_department_mappings enable row level security;
alter table public.organization_department_mappings force row level security;

drop policy if exists organizations_active_read on public.organizations;
create policy organizations_active_read
on public.organizations
for select
to authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
  )
);

drop policy if exists organization_department_mappings_active_read
  on public.organization_department_mappings;
create policy organization_department_mappings_active_read
on public.organization_department_mappings
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
  )
  and exists (
    select 1
    from public.organizations as o
    where o.id = organization_id
      and o.status = 'active'
  )
);

-- لا توجد سياسات INSERT/UPDATE/DELETE. ستضاف الكتابة لاحقًا عبر RPCs إدارية
-- بعد إنشاء platform_role_assignments وربط system_owner بصورة مستقلة.
revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.organization_department_mappings from public, anon, authenticated;
grant select on table public.organizations to authenticated;
grant select on table public.organization_department_mappings to authenticated;
