-- مسودة غير مطبقة: جدول أدوار المنصة المركزية.
-- المتطلب السابق: تطبيق مسودتي platform_modules وorganizations من المرحلة الأولى.
-- لا تنشئ هذه المسودة system_owner ولا تعدل profiles.role أو أي بيانات تشغيلية.

create table if not exists public.platform_role_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  platform_role text not null,
  status text not null default 'scheduled',
  starts_at timestamptz,
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  lock_version integer not null default 1,
  constraint platform_role_assignments_role_check
    check (platform_role in ('system_owner', 'platform_admin', 'auditor', 'viewer')),
  constraint platform_role_assignments_status_check
    check (status in ('scheduled', 'active', 'expired', 'revoked')),
  constraint platform_role_assignments_time_order_check
    check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint platform_role_assignments_owner_no_expiry_check
    check (platform_role <> 'system_owner' or ends_at is null),
  constraint platform_role_assignments_revocation_check
    check (
      (status = 'revoked'
        and revoked_at is not null
        and revoked_reason is not null
        and pg_catalog.btrim(revoked_reason) <> '')
      or
      (status <> 'revoked'
        and revoked_at is null
        and revoked_reason is null)
    ),
  constraint platform_role_assignments_lock_version_check
    check (lock_version >= 1)
);

create index if not exists platform_role_assignments_user_idx
  on public.platform_role_assignments (user_id);

create index if not exists platform_role_assignments_role_status_idx
  on public.platform_role_assignments (platform_role, status, starts_at, ends_at);

create index if not exists platform_role_assignments_effective_user_idx
  on public.platform_role_assignments (user_id, platform_role, starts_at, ends_at)
  where status <> 'revoked';

create index if not exists platform_role_assignments_created_by_idx
  on public.platform_role_assignments (created_by);

create index if not exists platform_role_assignments_updated_by_idx
  on public.platform_role_assignments (updated_by);

create or replace function private.platform_role_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_start timestamptz;
begin
  -- يقفل المستخدم أولًا لمنع سباق منح دورين منصيين متداخلين للحساب نفسه.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-role:user:' || new.user_id::text,
      0
    )
  );

  if new.platform_role = 'system_owner' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('platform-role:system-owner-global', 0)
    );
  end if;

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, v_now);
    new.updated_at := new.created_at;
    new.lock_version := 1;
  else
    if old.status = 'revoked' then
      raise exception 'A revoked platform role assignment is immutable.'
        using errcode = '22023';
    end if;

    if new.user_id is distinct from old.user_id
       or new.platform_role is distinct from old.platform_role
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Assignment identity and creation metadata are immutable.'
        using errcode = '22023';
    end if;

    if new.lock_version is distinct from old.lock_version then
      raise exception 'lock_version is managed by the database.'
        using errcode = '22023';
    end if;

    new.updated_at := v_now;
    new.lock_version := old.lock_version + 1;
  end if;

  v_start := coalesce(new.starts_at, new.created_at);

  if new.revoked_at is not null or new.status = 'revoked' then
    if new.revoked_at is null
       or new.revoked_reason is null
       or pg_catalog.btrim(new.revoked_reason) = '' then
      raise exception 'Revocation requires revoked_at and a non-empty reason.'
        using errcode = '22023';
    end if;
    new.status := 'revoked';
  else
    new.revoked_at := null;
    new.revoked_reason := null;
    if v_start > v_now then
      new.status := 'scheduled';
    elsif new.ends_at is not null and new.ends_at <= v_now then
      new.status := 'expired';
    else
      new.status := 'active';
    end if;
  end if;

  if new.ends_at is not null and new.ends_at <= v_start then
    raise exception 'ends_at must be later than the effective starts_at.'
      using errcode = '22023';
  end if;

  if new.status <> 'revoked' and exists (
    select 1
    from public.platform_role_assignments as a
    where a.id <> new.id
      and a.user_id = new.user_id
      and a.status <> 'revoked'
      and pg_catalog.tstzrange(
        coalesce(a.starts_at, a.created_at),
        a.ends_at,
        '[)'
      ) && pg_catalog.tstzrange(v_start, new.ends_at, '[)')
  ) then
    raise exception 'Overlapping platform role assignments for the same user are prohibited.'
      using errcode = '23P01';
  end if;

  -- system_owner واحد فقط في أي لحظة. التسليم يتم ذريًا عبر RPC الإلغاء مع بديل.
  if new.platform_role = 'system_owner'
     and new.status <> 'revoked'
     and exists (
       select 1
       from public.platform_role_assignments as a
       where a.id <> new.id
         and a.platform_role = 'system_owner'
         and a.status <> 'revoked'
         and pg_catalog.tstzrange(
           coalesce(a.starts_at, a.created_at),
           a.ends_at,
           '[)'
         ) && pg_catalog.tstzrange(v_start, new.ends_at, '[)')
     ) then
    raise exception 'Only one system_owner assignment may be effective at a time.'
      using errcode = '23P01';
  end if;

  return new;
end;
$function$;

revoke all on function private.platform_role_assignments_before_write()
  from public, anon, authenticated;

drop trigger if exists platform_role_assignments_10_before_write
  on public.platform_role_assignments;
create trigger platform_role_assignments_10_before_write
before insert or update on public.platform_role_assignments
for each row execute function private.platform_role_assignments_before_write();

drop trigger if exists platform_role_assignments_20_prevent_delete
  on public.platform_role_assignments;
create trigger platform_role_assignments_20_prevent_delete
before delete on public.platform_role_assignments
for each row execute function private.platform_admin_prevent_delete();

drop trigger if exists platform_role_assignments_90_audit
  on public.platform_role_assignments;
create trigger platform_role_assignments_90_audit
after insert or update or delete on public.platform_role_assignments
for each row execute function private.platform_admin_audit_row();

alter table public.platform_role_assignments enable row level security;
alter table public.platform_role_assignments force row level security;

-- سياسة دفاعية أولية لا تكشف إلا سجل المستخدم النشط نفسه.
-- تستبدل مسودة RPC هذه السياسة بسياسة القراءة الإدارية المعتمدة بعد إنشاء Helpers.
drop policy if exists platform_role_assignments_self_read
  on public.platform_role_assignments;
create policy platform_role_assignments_self_read
on public.platform_role_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.is_active
  )
);

revoke all on table public.platform_role_assignments
  from public, anon, authenticated;
grant select on table public.platform_role_assignments to authenticated;
