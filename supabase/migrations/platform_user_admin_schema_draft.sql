-- إدارة المستخدمين والدعوات: عضوية الجهات وسجل الدعوات فقط.
-- لا ينشئ مستخدمين ولا جهات ولا أدوارًا، ولا يغير profiles.role.

create table if not exists public.user_organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  is_primary boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'disabled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 1 check (lock_version > 0),
  constraint user_organizations_user_organization_unique unique (user_id, organization_id),
  constraint user_organizations_dates_check check (ends_at is null or ends_at > starts_at)
);

create unique index if not exists user_organizations_one_active_primary_idx
  on public.user_organizations (user_id)
  where is_primary and status = 'active';
create index if not exists user_organizations_organization_idx
  on public.user_organizations (organization_id, status);
create index if not exists user_organizations_user_idx
  on public.user_organizations (user_id, status);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null,
  display_name text not null,
  primary_organization_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'active', 'expired', 'cancelled')),
  platform_sync_status text not null default 'pending'
    check (platform_sync_status in ('pending', 'complete', 'failed')),
  auth_invited_user_id uuid references public.profiles(id) on delete restrict,
  provider_invitation_reference text,
  processing_error text,
  expires_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  sent_by uuid references public.profiles(id) on delete restrict,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 1 check (lock_version > 0),
  constraint user_invitations_email_normalized_check
    check (email_normalized = lower(btrim(email_normalized)) and email_normalized <> ''),
  constraint user_invitations_display_name_check check (btrim(display_name) <> '')
);

create unique index if not exists user_invitations_active_email_unique_idx
  on public.user_invitations (email_normalized)
  where status in ('draft', 'sent', 'accepted');
create index if not exists user_invitations_status_idx
  on public.user_invitations (status, created_at desc);
create index if not exists user_invitations_auth_user_idx
  on public.user_invitations (auth_invited_user_id)
  where auth_invited_user_id is not null;

create or replace function private.platform_user_admin_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  new.lock_version := old.lock_version + 1;
  return new;
end;
$function$;

create or replace function private.platform_user_admin_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else null end;
  v_new jsonb := pg_catalog.to_jsonb(new);
  v_actor uuid;
begin
  v_actor := coalesce(
    auth.uid(),
    nullif(v_new ->> 'updated_by', '')::uuid,
    nullif(v_new ->> 'created_by', '')::uuid,
    nullif(v_new ->> 'sent_by', '')::uuid,
    nullif(v_new ->> 'cancelled_by', '')::uuid
  );

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action,
    old_data, new_data, created_at
  ) values (
    v_actor, tg_table_name, v_new ->> 'id', tg_op,
    v_old, v_new, pg_catalog.clock_timestamp()
  );
  return new;
end;
$function$;

revoke all on function private.platform_user_admin_before_update() from public, anon, authenticated;
revoke all on function private.platform_user_admin_audit_row() from public, anon, authenticated;

drop trigger if exists user_organizations_10_before_update on public.user_organizations;
create trigger user_organizations_10_before_update
before update on public.user_organizations
for each row execute function private.platform_user_admin_before_update();

drop trigger if exists user_organizations_90_audit on public.user_organizations;
create trigger user_organizations_90_audit
after insert or update on public.user_organizations
for each row execute function private.platform_user_admin_audit_row();

drop trigger if exists user_invitations_10_before_update on public.user_invitations;
create trigger user_invitations_10_before_update
before update on public.user_invitations
for each row execute function private.platform_user_admin_before_update();

drop trigger if exists user_invitations_90_audit on public.user_invitations;
create trigger user_invitations_90_audit
after insert or update on public.user_invitations
for each row execute function private.platform_user_admin_audit_row();

alter table public.user_organizations enable row level security;
alter table public.user_organizations force row level security;
alter table public.user_invitations enable row level security;
alter table public.user_invitations force row level security;

revoke all on table public.user_organizations from public, anon, authenticated;
revoke all on table public.user_invitations from public, anon, authenticated;

comment on table public.user_organizations is
  'Normalized organization memberships. Administrative writes are server-side only.';
comment on table public.user_invitations is
  'Invitation lifecycle metadata only; never stores passwords or usable invitation tokens.';
