begin;

create table public.financial_control_follow_ups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null,
  follow_up_type text not null,
  target_organization_id uuid references public.organizations(id) on delete restrict,
  target_user_id uuid references public.profiles(id) on delete restrict,
  title text,
  body text not null,
  priority text not null default 'normal',
  due_at timestamptz,
  status text not null default 'open',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  lock_version integer not null default 1,
  constraint financial_control_follow_ups_finding_scope_fk
    foreign key (workspace_id, finding_id)
    references public.financial_control_findings(workspace_id, id)
    on delete restrict,
  constraint financial_control_follow_ups_type_check
    check (follow_up_type in ('reminder', 'employee_direction')),
  constraint financial_control_follow_ups_priority_check
    check (priority in ('normal', 'urgent')),
  constraint financial_control_follow_ups_status_check
    check (status in ('open', 'completed', 'cancelled')),
  constraint financial_control_follow_ups_body_check
    check (btrim(body) <> ''),
  constraint financial_control_follow_ups_reminder_target_check
    check (
      follow_up_type <> 'reminder'
      or target_organization_id is not null
      or target_user_id is not null
    ),
  constraint financial_control_follow_ups_direction_target_check
    check (follow_up_type <> 'employee_direction' or target_user_id is not null),
  constraint financial_control_follow_ups_completion_check
    check (
      (status = 'open'
        and completed_by is null and completed_at is null
        and cancelled_by is null and cancelled_at is null)
      or (status = 'completed'
        and completed_by is not null and completed_at is not null
        and cancelled_by is null and cancelled_at is null)
      or (status = 'cancelled'
        and cancelled_by is not null and cancelled_at is not null
        and completed_by is null and completed_at is null)
    ),
  constraint financial_control_follow_ups_lock_version_check
    check (lock_version > 0)
);

create index financial_control_follow_ups_workspace_idx
  on public.financial_control_follow_ups (workspace_id);
create index financial_control_follow_ups_finding_idx
  on public.financial_control_follow_ups (finding_id);
create index financial_control_follow_ups_target_user_idx
  on public.financial_control_follow_ups (target_user_id)
  where target_user_id is not null;
create index financial_control_follow_ups_target_organization_idx
  on public.financial_control_follow_ups (target_organization_id)
  where target_organization_id is not null;
create index financial_control_follow_ups_status_idx
  on public.financial_control_follow_ups (status);
create index financial_control_follow_ups_due_at_idx
  on public.financial_control_follow_ups (due_at)
  where due_at is not null;
create index financial_control_follow_ups_open_queue_idx
  on public.financial_control_follow_ups (workspace_id, due_at, priority)
  where status = 'open';

alter table public.financial_control_follow_ups enable row level security;
alter table public.financial_control_follow_ups force row level security;

create policy financial_control_follow_ups_select
on public.financial_control_follow_ups
for select to authenticated
using (
  (select private.financial_control_has_role(workspace_id, array['manager', 'owner']::text[]))
  or (
    follow_up_type = 'employee_direction'
    and target_user_id = (select auth.uid())
    and (select private.financial_control_can_read_finding(workspace_id, finding_id))
  )
);

create policy financial_control_follow_ups_insert_manager
on public.financial_control_follow_ups
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.financial_control_has_role(workspace_id, array['manager', 'owner']::text[]))
);

create policy financial_control_follow_ups_update_manager
on public.financial_control_follow_ups
for update to authenticated
using ((select private.financial_control_has_role(workspace_id, array['manager', 'owner']::text[])))
with check ((select private.financial_control_has_role(workspace_id, array['manager', 'owner']::text[])));

create or replace function private.financial_control_target_is_manager(
  p_user_id uuid,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_control_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role in ('manager', 'owner')
      and m.is_active
      and m.starts_at <= pg_catalog.clock_timestamp()
      and (m.ends_at is null or m.ends_at > pg_catalog.clock_timestamp())
  ) or private.platform_user_has_operational_access(
    p_user_id,
    p_workspace_id,
    array['financial_control_manager']::text[],
    null
  );
$$;

revoke all on function private.financial_control_target_is_manager(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function private.financial_control_audit_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'CREATE';
  elsif old.status is distinct from new.status and new.status = 'completed' then
    v_action := 'COMPLETE';
  elsif old.status is distinct from new.status and new.status = 'cancelled' then
    v_action := 'CANCEL';
  else
    v_action := 'UPDATE';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    (select auth.uid()),
    'financial_control_follow_ups',
    new.id::text,
    v_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    pg_catalog.clock_timestamp()
  );

  return new;
end;
$$;

revoke all on function private.financial_control_audit_follow_up()
from public, anon, authenticated, service_role;

create trigger financial_control_follow_ups_audit
after insert or update on public.financial_control_follow_ups
for each row execute function private.financial_control_audit_follow_up();

create or replace function public.financial_control_create_follow_up(
  p_finding_id uuid,
  p_follow_up_type text,
  p_target_organization_id uuid,
  p_target_user_id uuid,
  p_title text,
  p_body text,
  p_priority text,
  p_due_at timestamptz
)
returns public.financial_control_follow_ups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_finding public.financial_control_findings%rowtype;
  v_follow_up public.financial_control_follow_ups%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_finding
  from public.financial_control_findings
  where id = p_finding_id and archived_at is null;

  if not found then
    raise exception using errcode = 'P0002', message = 'Finding not found';
  end if;

  if not private.financial_control_has_role(v_finding.workspace_id, array['manager', 'owner']::text[]) then
    raise exception using errcode = '42501', message = 'Manager role required';
  end if;

  if p_follow_up_type not in ('reminder', 'employee_direction') then
    raise exception using errcode = '22023', message = 'Unsupported follow-up type';
  end if;
  if p_priority not in ('normal', 'urgent') then
    raise exception using errcode = '22023', message = 'Unsupported priority';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception using errcode = '22023', message = 'Follow-up body is required';
  end if;

  if p_follow_up_type = 'reminder' then
    if nullif(btrim(coalesce(p_title, '')), '') is null then
      raise exception using errcode = '22023', message = 'Reminder title is required';
    end if;
    if p_target_organization_id is null and (
      p_target_user_id is null
      or not private.financial_control_target_is_manager(p_target_user_id, v_finding.workspace_id)
    ) then
      raise exception using errcode = '22023', message = 'A valid administrative reminder target is required';
    end if;
    if p_target_organization_id is not null and not exists (
      select 1 from public.organizations o
      where o.id = p_target_organization_id and o.status = 'active'
    ) then
      raise exception using errcode = '22023', message = 'Target organization is not active';
    end if;
  end if;

  if p_follow_up_type = 'employee_direction' and (
    p_target_user_id is null
    or not exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_finding.workspace_id
        and ca.finding_id = v_finding.id
        and ca.responsible_user_id = p_target_user_id
    )
  ) then
    raise exception using errcode = '22023', message = 'Direction target must be assigned to the finding';
  end if;

  insert into public.financial_control_follow_ups (
    workspace_id, finding_id, follow_up_type,
    target_organization_id, target_user_id, title, body,
    priority, due_at, created_by
  ) values (
    v_finding.workspace_id, v_finding.id, p_follow_up_type,
    p_target_organization_id, p_target_user_id,
    nullif(btrim(coalesce(p_title, '')), ''), btrim(p_body),
    p_priority, p_due_at, v_actor
  ) returning * into v_follow_up;

  return v_follow_up;
end;
$$;

create or replace function public.financial_control_update_follow_up(
  p_follow_up_id uuid,
  p_title text,
  p_body text,
  p_priority text,
  p_due_at timestamptz,
  p_expected_lock_version integer
)
returns public.financial_control_follow_ups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.financial_control_follow_ups%rowtype;
  v_new public.financial_control_follow_ups%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_old
  from public.financial_control_follow_ups
  where id = p_follow_up_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Follow-up not found';
  end if;
  if not private.financial_control_has_role(v_old.workspace_id, array['manager', 'owner']::text[]) then
    raise exception using errcode = '42501', message = 'Manager role required';
  end if;
  if v_old.status <> 'open' then
    raise exception using errcode = '22023', message = 'Only open follow-ups can be updated';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception using errcode = '40001', message = 'Follow-up changed by another transaction';
  end if;
  if nullif(btrim(p_body), '') is null then
    raise exception using errcode = '22023', message = 'Follow-up body is required';
  end if;
  if p_priority not in ('normal', 'urgent') then
    raise exception using errcode = '22023', message = 'Unsupported priority';
  end if;
  if v_old.follow_up_type = 'reminder' and nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception using errcode = '22023', message = 'Reminder title is required';
  end if;

  update public.financial_control_follow_ups
  set title = nullif(btrim(coalesce(p_title, '')), ''),
      body = btrim(p_body),
      priority = p_priority,
      due_at = p_due_at,
      updated_at = pg_catalog.clock_timestamp(),
      lock_version = lock_version + 1
  where id = v_old.id
  returning * into v_new;

  return v_new;
end;
$$;

create or replace function public.financial_control_set_follow_up_status(
  p_follow_up_id uuid,
  p_status text,
  p_expected_lock_version integer
)
returns public.financial_control_follow_ups
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old public.financial_control_follow_ups%rowtype;
  v_new public.financial_control_follow_ups%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_status not in ('completed', 'cancelled') then
    raise exception using errcode = '22023', message = 'Unsupported follow-up status';
  end if;

  select * into v_old
  from public.financial_control_follow_ups
  where id = p_follow_up_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Follow-up not found';
  end if;
  if not private.financial_control_has_role(v_old.workspace_id, array['manager', 'owner']::text[]) then
    raise exception using errcode = '42501', message = 'Manager role required';
  end if;
  if v_old.status <> 'open' then
    raise exception using errcode = '22023', message = 'Only open follow-ups can be closed';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception using errcode = '40001', message = 'Follow-up changed by another transaction';
  end if;

  update public.financial_control_follow_ups
  set status = p_status,
      completed_by = case when p_status = 'completed' then v_actor else null end,
      completed_at = case when p_status = 'completed' then v_now else null end,
      cancelled_by = case when p_status = 'cancelled' then v_actor else null end,
      cancelled_at = case when p_status = 'cancelled' then v_now else null end,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id
  returning * into v_new;

  return v_new;
end;
$$;

revoke all on public.financial_control_follow_ups from public, anon, authenticated;
grant select on public.financial_control_follow_ups to authenticated;

revoke all on function public.financial_control_create_follow_up(uuid, text, uuid, uuid, text, text, text, timestamptz)
from public, anon;
grant execute on function public.financial_control_create_follow_up(uuid, text, uuid, uuid, text, text, text, timestamptz)
to authenticated;

revoke all on function public.financial_control_update_follow_up(uuid, text, text, text, timestamptz, integer)
from public, anon;
grant execute on function public.financial_control_update_follow_up(uuid, text, text, text, timestamptz, integer)
to authenticated;

revoke all on function public.financial_control_set_follow_up_status(uuid, text, integer)
from public, anon;
grant execute on function public.financial_control_set_follow_up_status(uuid, text, integer)
to authenticated;

select pg_catalog.pg_notify('pgrst', 'reload schema');

commit;
