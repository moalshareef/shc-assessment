-- ============================================================================
-- DRAFT ONLY — FINANCIAL CONTROL SECURITY HARDENING
-- لا تطبق هذه المسودة قبل المراجعة والاعتماد الصريح.
-- تنقل دوال RLS المساعدة من public إلى private دون تغيير الجداول أو البيانات.
-- ============================================================================

begin;

-- فشل أي تعليمة قبل COMMIT يعيد المعاملة كاملة تلقائيًا.
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create schema if not exists private;

-- لا نسحب USAGE القائم من authenticated لأن سياسات الركائز تعتمد على private.
revoke usage on schema private from anon;
grant usage on schema private to authenticated;

-- --------------------------------------------------------------------------
-- 1. دوال RLS المساعدة في schema غير معروض عبر Data API
-- --------------------------------------------------------------------------

create or replace function private.financial_control_has_role(
  p_workspace_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_control_members as m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
      and m.is_active
      and (m.ends_at is null or m.ends_at > pg_catalog.now())
  );
$$;

create or replace function private.financial_control_user_has_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.financial_control_members as m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role = any (p_roles)
      and m.is_active
      and (m.ends_at is null or m.ends_at > pg_catalog.now())
  );
$$;

create or replace function private.financial_control_can_read_finding(
  p_workspace_id uuid,
  p_finding_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.financial_control_has_role(
      p_workspace_id,
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or (
      private.financial_control_has_role(
        p_workspace_id,
        array['action_owner']::text[]
      )
      and exists (
        select 1
        from public.corrective_actions as ca
        where ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
      )
    );
$$;

create or replace function private.financial_control_can_read_item(
  p_workspace_id uuid,
  p_finding_id uuid,
  p_corrective_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.financial_control_has_role(
      p_workspace_id,
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or (
      p_corrective_action_id is not null
      and private.financial_control_has_role(
        p_workspace_id,
        array['action_owner']::text[]
      )
      and exists (
        select 1
        from public.corrective_actions as ca
        where ca.id = p_corrective_action_id
          and ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
      )
    );
$$;

revoke all on function private.financial_control_has_role(uuid, text[]) from public;
revoke all on function private.financial_control_user_has_role(uuid, uuid, text[]) from public;
revoke all on function private.financial_control_can_read_finding(uuid, uuid) from public;
revoke all on function private.financial_control_can_read_item(uuid, uuid, uuid) from public;

revoke execute on function private.financial_control_has_role(uuid, text[]) from anon;
revoke execute on function private.financial_control_user_has_role(uuid, uuid, text[]) from anon;
revoke execute on function private.financial_control_can_read_finding(uuid, uuid) from anon;
revoke execute on function private.financial_control_can_read_item(uuid, uuid, uuid) from anon;

grant execute on function private.financial_control_has_role(uuid, text[]) to authenticated;
grant execute on function private.financial_control_user_has_role(uuid, uuid, text[]) to authenticated;
grant execute on function private.financial_control_can_read_finding(uuid, uuid) to authenticated;
grant execute on function private.financial_control_can_read_item(uuid, uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 2. تحديث الدوال الداخلية فقط لتستخدم helper الخاص.
-- لا يعاد إنشاء أو تعديل RPCs العامة الثلاث.
-- --------------------------------------------------------------------------

create or replace function private.financial_control_transition_finding_tx(
  p_finding_id uuid,
  p_to_status text,
  p_reason text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.financial_control_findings%rowtype;
  v_new public.financial_control_findings%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.financial_control_findings
  where id = p_finding_id
  for update;

  if not found then
    raise exception 'Financial-control finding was not found.' using errcode = 'P0002';
  end if;

  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The finding was changed by another transaction.' using errcode = '40001';
  end if;

  if not (
    (v_old.workflow_status = 'imported_pending_review' and p_to_status = 'not_started'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'not_started' and p_to_status = 'in_progress'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'in_progress' and p_to_status = 'awaiting_action_owner'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'awaiting_action_owner' and p_to_status = 'in_progress'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status in ('in_progress','returned_for_revision') and p_to_status = 'submitted_for_manager_review'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'reopened' and p_to_status = 'in_progress'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'submitted_for_manager_review' and p_to_status = 'under_manager_review'
      and private.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'under_manager_review' and p_to_status in ('returned_for_revision','approved')
      and private.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'approved' and p_to_status = 'closed'
      and private.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'closed' and p_to_status = 'reopened'
      and private.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
  ) then
    raise exception 'Finding transition % -> % is not allowed for the current user.',
      v_old.workflow_status, p_to_status using errcode = '42501';
  end if;

  if p_to_status in ('returned_for_revision','reopened') and v_reason is null then
    raise exception 'A reason is required for return or reopening.' using errcode = '22023';
  end if;

  if v_old.workflow_status = 'imported_pending_review' and p_to_status = 'not_started' then
    if not exists (
      select 1 from public.finding_assignments a
      where a.workspace_id = v_old.workspace_id
        and a.finding_id = v_old.id
        and a.assignment_role = 'specialist'
        and a.ends_at is null
    ) or not exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id and ca.finding_id = v_old.id
    ) then
      raise exception 'Import review requires an active specialist assignment and at least one corrective action.'
        using errcode = '23514';
    end if;
  end if;

  if v_old.workflow_status = 'not_started' and p_to_status = 'in_progress'
     and not exists (
       select 1 from public.corrective_actions ca
       where ca.workspace_id = v_old.workspace_id
         and ca.finding_id = v_old.id
         and ca.workflow_status <> 'not_started'
     ) then
    raise exception 'At least one corrective action must have started.' using errcode = '23514';
  end if;

  if p_to_status in ('submitted_for_manager_review','approved','closed') then
    if not exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id and ca.finding_id = v_old.id
    ) or exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id
        and ca.finding_id = v_old.id
        and ca.workflow_status not in ('specialist_verified','completed')
    ) then
      raise exception 'All corrective actions must be verified before manager review.' using errcode = '23514';
    end if;
  end if;

  if p_to_status in ('approved','closed') then
    if exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id
        and ca.finding_id = v_old.id
        and (
          ca.workflow_status <> 'completed'
          or ca.progress_percent <> 100
          or not exists (
            select 1 from public.finding_attachments fa
            where fa.workspace_id = ca.workspace_id
              and fa.finding_id = ca.finding_id
              and fa.corrective_action_id = ca.id
              and fa.attachment_kind = 'evidence'
              and fa.review_status = 'accepted'
              and fa.archived_at is null
          )
        )
    ) then
      raise exception 'Approval and closure require completed actions and accepted evidence.' using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'closed' and v_old.progress_percent <> 100 then
    raise exception 'Finding progress must be 100 before closure.' using errcode = '23514';
  end if;

  update public.financial_control_findings
  set workflow_status = p_to_status,
      progress_percent = case when p_to_status = 'approved' then 100 else progress_percent end,
      approved_at = case when p_to_status = 'approved' then v_now else approved_at end,
      closed_at = case when p_to_status = 'closed' then v_now else closed_at end,
      reopened_at = case when p_to_status = 'reopened' then v_now else reopened_at end,
      last_activity_at = v_now,
      updated_by = v_actor,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id
  returning * into v_new;

  insert into public.finding_status_history (
    workspace_id, finding_id, from_status, to_status, transition_code, reason,
    progress_before, progress_after, due_date_before, due_date_after,
    snapshot_version, changed_by, changed_at
  ) values (
    v_old.workspace_id, v_old.id, v_old.workflow_status, v_new.workflow_status,
    v_old.workflow_status || '_to_' || v_new.workflow_status, v_reason,
    v_old.progress_percent, v_new.progress_percent, v_old.current_due_date,
    v_new.current_due_date, v_new.lock_version, v_actor, v_now
  );

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'financial_control_findings', v_old.id::text, 'UPDATE',
    to_jsonb(v_old),
    to_jsonb(v_new) || jsonb_build_object('_transition_reason', v_reason),
    v_now
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function private.financial_control_transition_action_tx(
  p_corrective_action_id uuid,
  p_to_status text,
  p_reason text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old public.corrective_actions%rowtype;
  v_new public.corrective_actions%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
  v_now timestamptz := clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.corrective_actions
  where id = p_corrective_action_id
  for update;

  if not found then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;

  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The corrective action was changed by another transaction.' using errcode = '40001';
  end if;

  if not (
    (v_old.workflow_status = 'not_started' and p_to_status = 'in_progress'
      and (
        private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[])
        or (v_old.responsible_user_id = v_actor
          and private.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
      ))
    or (v_old.workflow_status in ('in_progress','blocked') and p_to_status in ('blocked','in_progress')
      and v_old.workflow_status <> p_to_status
      and (
        private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[])
        or (v_old.responsible_user_id = v_actor
          and private.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
      ))
    or (v_old.workflow_status in ('in_progress','returned_for_revision') and p_to_status = 'submitted_for_specialist_review'
      and v_old.responsible_user_id = v_actor
      and private.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
    or (v_old.workflow_status = 'submitted_for_specialist_review' and p_to_status = 'under_specialist_review'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'under_specialist_review' and p_to_status in ('returned_for_revision','specialist_verified')
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'specialist_verified' and p_to_status = 'completed'
      and private.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'completed' and p_to_status = 'in_progress'
      and private.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
  ) then
    raise exception 'Corrective-action transition % -> % is not allowed for the current user.',
      v_old.workflow_status, p_to_status using errcode = '42501';
  end if;

  if (
    p_to_status in ('blocked','returned_for_revision')
    or (v_old.workflow_status in ('blocked','completed') and p_to_status = 'in_progress')
  ) and v_reason is null then
    raise exception 'A reason is required for blocking, return, resolution, or reopening.' using errcode = '22023';
  end if;

  if p_to_status = 'submitted_for_specialist_review' then
    if nullif(btrim(v_old.execution_details), '') is null
       or not exists (
         select 1 from public.finding_attachments fa
         where fa.workspace_id = v_old.workspace_id
           and fa.finding_id = v_old.finding_id
           and fa.corrective_action_id = v_old.id
           and fa.attachment_kind = 'evidence'
           and fa.archived_at is null
       ) then
      raise exception 'Execution details and evidence are required before specialist review.' using errcode = '23514';
    end if;
  end if;

  if p_to_status in ('specialist_verified','completed') then
    if not exists (
      select 1 from public.finding_attachments fa
      where fa.workspace_id = v_old.workspace_id
        and fa.finding_id = v_old.finding_id
        and fa.corrective_action_id = v_old.id
        and fa.attachment_kind = 'evidence'
        and fa.review_status = 'accepted'
        and fa.archived_at is null
    ) or exists (
      select 1 from public.finding_attachments fa
      where fa.workspace_id = v_old.workspace_id
        and fa.finding_id = v_old.finding_id
        and fa.corrective_action_id = v_old.id
        and fa.attachment_kind = 'evidence'
        and fa.review_status = 'pending'
        and fa.archived_at is null
    ) then
      raise exception 'Accepted evidence with no pending review is required.' using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'completed' and v_old.progress_percent <> 100 then
    raise exception 'Corrective-action progress must be 100 before completion.' using errcode = '23514';
  end if;

  update public.corrective_actions
  set workflow_status = p_to_status,
      completed_at = case
        when p_to_status = 'completed' then v_now
        when v_old.workflow_status = 'completed' and p_to_status = 'in_progress' then null
        else completed_at
      end,
      updated_by = v_actor,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id
  returning * into v_new;

  insert into public.corrective_action_status_history (
    workspace_id, finding_id, corrective_action_id, from_status, to_status,
    progress_before, progress_after, due_date_before, due_date_after,
    reason, changed_by, changed_at
  ) values (
    v_old.workspace_id, v_old.finding_id, v_old.id, v_old.workflow_status,
    v_new.workflow_status, v_old.progress_percent, v_new.progress_percent,
    v_old.current_due_date, v_new.current_due_date, v_reason, v_actor, v_now
  );

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_actions', v_old.id::text, 'UPDATE',
    to_jsonb(v_old),
    to_jsonb(v_new) || jsonb_build_object('_transition_reason', v_reason),
    v_now
  );

  return to_jsonb(v_new);
end;
$$;

create or replace function private.financial_control_decide_extension_tx(
  p_extension_request_id uuid,
  p_decision text,
  p_decision_note text,
  p_expected_action_lock_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_old public.extension_requests%rowtype;
  v_request_new public.extension_requests%rowtype;
  v_action_old public.corrective_actions%rowtype;
  v_action_new public.corrective_actions%rowtype;
  v_note text := nullif(btrim(p_decision_note), '');
  v_now timestamptz := clock_timestamp();
  v_correlation_id uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_decision not in ('approved','rejected') then
    raise exception 'Extension decision must be approved or rejected.' using errcode = '22023';
  end if;

  if p_decision = 'rejected' and v_note is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;

  select * into v_request_old
  from public.extension_requests
  where id = p_extension_request_id
  for update;

  if not found then
    raise exception 'Extension request was not found.' using errcode = 'P0002';
  end if;

  if not private.financial_control_has_role(v_request_old.workspace_id, array['manager']::text[]) then
    raise exception 'Only a financial-control manager may decide an extension request.' using errcode = '42501';
  end if;

  if v_request_old.status_code <> 'submitted' then
    raise exception 'Only a submitted extension request can be decided.' using errcode = '23514';
  end if;

  select * into v_action_old
  from public.corrective_actions
  where id = v_request_old.corrective_action_id
    and workspace_id = v_request_old.workspace_id
    and finding_id = v_request_old.finding_id
  for update;

  if not found then
    raise exception 'The extension request corrective action was not found.' using errcode = 'P0002';
  end if;

  if p_expected_action_lock_version is null
     or v_action_old.lock_version <> p_expected_action_lock_version then
    raise exception 'The corrective action was changed by another transaction.' using errcode = '40001';
  end if;

  if v_request_old.current_due_date <> v_action_old.current_due_date then
    raise exception 'The extension request is based on an outdated due date.' using errcode = '40001';
  end if;

  update public.extension_requests
  set status_code = p_decision,
      decided_by = v_actor,
      decided_at = v_now,
      decision_note = v_note,
      approved_due_date = case when p_decision = 'approved' then requested_due_date else null end,
      updated_at = v_now
  where id = v_request_old.id
  returning * into v_request_new;

  if p_decision = 'approved' then
    update public.corrective_actions
    set current_due_date = v_request_old.requested_due_date,
        updated_by = v_actor,
        updated_at = v_now,
        lock_version = lock_version + 1
    where id = v_action_old.id
    returning * into v_action_new;

    insert into public.corrective_action_status_history (
      workspace_id, finding_id, corrective_action_id, from_status, to_status,
      progress_before, progress_after, due_date_before, due_date_after,
      reason, changed_by, changed_at, correlation_id
    ) values (
      v_action_old.workspace_id, v_action_old.finding_id, v_action_old.id,
      v_action_old.workflow_status, v_action_new.workflow_status,
      v_action_old.progress_percent, v_action_new.progress_percent,
      v_action_old.current_due_date, v_action_new.current_due_date,
      coalesce(v_note, v_request_old.reason), v_actor, v_now, v_correlation_id
    );

    insert into public.audit_logs (
      actor_user_id, table_name, record_id, action, old_data, new_data, created_at
    ) values (
      v_actor, 'corrective_actions', v_action_old.id::text, 'UPDATE',
      to_jsonb(v_action_old),
      to_jsonb(v_action_new) || jsonb_build_object('_extension_request_id', v_request_old.id),
      v_now
    );
  else
    v_action_new := v_action_old;
  end if;

  insert into public.approvals (
    workspace_id, finding_id, corrective_action_id, extension_request_id,
    approval_type, status_code, requested_by, requested_at,
    assigned_manager_id, decided_by, decided_at, decision_note,
    submitted_snapshot, correlation_id
  ) values (
    v_request_old.workspace_id, v_request_old.finding_id,
    v_request_old.corrective_action_id, v_request_old.id,
    'extension', p_decision, v_request_old.requested_by, v_request_old.requested_at,
    v_actor, v_actor, v_now, v_note, to_jsonb(v_request_old), v_correlation_id
  );

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'extension_requests', v_request_old.id::text, 'UPDATE',
    to_jsonb(v_request_old),
    to_jsonb(v_request_new) || jsonb_build_object('_decision_note', v_note),
    v_now
  );

  return jsonb_build_object(
    'extension_request', to_jsonb(v_request_new),
    'corrective_action', to_jsonb(v_action_new)
  );
end;
$$;

-- CREATE OR REPLACE يحتفظ بالـACL عادةً، لكن المنع يعاد هنا بصورة صريحة.
revoke all on function private.financial_control_transition_finding_tx(uuid, text, text, integer) from public;
revoke all on function private.financial_control_transition_action_tx(uuid, text, text, integer) from public;
revoke all on function private.financial_control_decide_extension_tx(uuid, text, text, integer) from public;
revoke execute on function private.financial_control_transition_finding_tx(uuid, text, text, integer) from anon, authenticated;
revoke execute on function private.financial_control_transition_action_tx(uuid, text, text, integer) from anon, authenticated;
revoke execute on function private.financial_control_decide_extension_tx(uuid, text, text, integer) from anon, authenticated;

-- --------------------------------------------------------------------------
-- 3. تحديث تعبيرات سياسات RLS فقط؛ الأوامر والأدوار والسلوك لا تتغير.
-- --------------------------------------------------------------------------

alter policy financial_control_members_select
on public.financial_control_members
using (
  user_id = (select auth.uid())
  or private.financial_control_has_role(workspace_id, array['owner', 'manager']::text[])
);

alter policy financial_control_members_insert_owner
on public.financial_control_members
with check (private.financial_control_has_role(workspace_id, array['owner']::text[]));

alter policy financial_control_members_update_owner
on public.financial_control_members
using (private.financial_control_has_role(workspace_id, array['owner']::text[]))
with check (private.financial_control_has_role(workspace_id, array['owner']::text[]));

alter policy financial_control_source_documents_select
on public.financial_control_source_documents
using (private.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

alter policy financial_control_unit_aliases_select
on public.financial_control_unit_aliases
using (private.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

alter policy financial_control_escalation_rules_select
on public.financial_control_escalation_rules
using (private.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

alter policy financial_control_findings_select
on public.financial_control_findings
using (private.financial_control_can_read_finding(workspace_id, id));

alter policy financial_control_findings_update_operational
on public.financial_control_findings
using (private.financial_control_has_role(workspace_id, array['manager','specialist']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager','specialist']::text[]));

alter policy financial_control_finding_versions_select
on public.financial_control_finding_versions
using (private.financial_control_can_read_finding(workspace_id, finding_id));

alter policy corrective_actions_select
on public.corrective_actions
using (
  private.financial_control_has_role(workspace_id, array['owner','manager','specialist','viewer']::text[])
  or (
    private.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
);

alter policy corrective_actions_insert_manager
on public.corrective_actions
with check (private.financial_control_has_role(workspace_id, array['manager']::text[]));

alter policy corrective_actions_update
on public.corrective_actions
using (
  private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  or (
    private.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
)
with check (
  private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  or (
    private.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
);

alter policy finding_assignments_select
on public.finding_assignments
using (
  private.financial_control_has_role(workspace_id, array['owner','manager','specialist','viewer']::text[])
  or user_id = (select auth.uid())
);

alter policy finding_assignments_insert_manager
on public.finding_assignments
with check (private.financial_control_has_role(workspace_id, array['manager']::text[]));

alter policy finding_assignments_update_manager
on public.finding_assignments
using (private.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager']::text[]));

alter policy finding_comments_select
on public.finding_comments
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

alter policy finding_comments_insert
on public.finding_comments
with check (
  author_user_id = (select auth.uid())
  and (
    private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      private.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

alter policy finding_messages_select
on public.finding_messages
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

alter policy finding_messages_insert
on public.finding_messages
with check (
  recorded_by = (select auth.uid())
  and (
    private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      private.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

alter policy finding_attachments_select
on public.finding_attachments
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

alter policy finding_attachments_insert
on public.finding_attachments
with check (
  uploaded_by = (select auth.uid())
  and review_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and archived_at is null
  and (
    private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      private.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

alter policy finding_attachments_review_update
on public.finding_attachments
using (private.financial_control_has_role(workspace_id, array['manager','specialist']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager','specialist']::text[]));

alter policy finding_status_history_select
on public.finding_status_history
using (private.financial_control_can_read_finding(workspace_id, finding_id));

alter policy corrective_action_status_history_select
on public.corrective_action_status_history
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

alter policy extension_requests_select
on public.extension_requests
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

alter policy extension_requests_insert
on public.extension_requests
with check (
  requested_by = (select auth.uid())
  and status_code in ('draft', 'submitted')
  and decided_by is null
  and decided_at is null
  and approved_due_date is null
  and (
    private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      private.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

alter policy extension_requests_update_manager
on public.extension_requests
using (private.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager']::text[]));

alter policy escalations_select
on public.escalations
using (private.financial_control_can_read_finding(workspace_id, finding_id));

alter policy escalations_insert_manager_owner
on public.escalations
with check (private.financial_control_has_role(workspace_id, array['manager','owner']::text[]));

alter policy escalations_update_manager_owner
on public.escalations
using (private.financial_control_has_role(workspace_id, array['manager','owner']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager','owner']::text[]));

alter policy approvals_select
on public.approvals
using (private.financial_control_can_read_finding(workspace_id, finding_id));

alter policy approvals_insert
on public.approvals
with check (
  private.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  and status_code = 'pending'
  and decided_by is null
  and decided_at is null
  and private.financial_control_user_has_role(
    workspace_id,
    assigned_manager_id,
    array['manager']::text[]
  )
);

alter policy approvals_update_manager
on public.approvals
using (private.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (private.financial_control_has_role(workspace_id, array['manager']::text[]));

-- --------------------------------------------------------------------------
-- 4. إزالة نقاط RLS العامة بعد تحويل السياسات والدوال الداخلية بالكامل.
-- --------------------------------------------------------------------------

revoke all on function public.financial_control_can_read_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.financial_control_can_read_finding(uuid, uuid) from public, anon, authenticated;
revoke all on function public.financial_control_user_has_role(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.financial_control_has_role(uuid, text[]) from public, anon, authenticated;

drop function public.financial_control_can_read_item(uuid, uuid, uuid);
drop function public.financial_control_can_read_finding(uuid, uuid);
drop function public.financial_control_user_has_role(uuid, uuid, text[]);
drop function public.financial_control_has_role(uuid, text[]);

commit;

-- التراجع بعد COMMIT ينفذ في Migration عكسية مستقلة ومعاملة واحدة:
-- 1) إعادة إنشاء الدوال الأربع في public من تعريفاتها السابقة.
-- 2) إعادة تعريف الدوال الداخلية الثلاث لتستدعي public.financial_control_has_role.
-- 3) إعادة تعبيرات السياسات الـ33 إلى public.financial_control_*.
-- 4) سحب EXECUTE من دوال private الأربع ثم إسقاطها.
-- لا تمس عملية التراجع الجداول أو البيانات أو RPCs العامة أو دوال الركائز.
