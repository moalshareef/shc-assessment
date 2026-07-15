-- مسودة غير مطبقة (3/3): مسار مباشر من الموظف المسند إلى المدير.
-- تعتمد على مسودتي schema وRPC للمستندات المرجعية، ولا ترحّل أو تسند بيانات.

begin;

do $preflight$
begin
  if exists (
    select 1
    from public.corrective_actions ca
    where ca.workflow_status not in (
      'not_started', 'in_progress', 'submitted_for_manager_review', 'completed'
    )
  ) then
    raise exception 'Existing corrective-action statuses require an approved mapping before this migration.'
      using errcode = '23514';
  end if;
end;
$preflight$;

alter table public.corrective_actions
  drop constraint if exists corrective_actions_workflow_status_check;
alter table public.corrective_actions
  add constraint corrective_actions_workflow_status_check
  check (
    workflow_status in (
      'not_started', 'in_progress', 'submitted_for_manager_review', 'completed'
    )
  );

create or replace function private.financial_control_transition_action_tx(
  p_corrective_action_id uuid,
  p_to_status text,
  p_reason text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_old public.corrective_actions%rowtype;
  v_new public.corrective_actions%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.corrective_actions ca
  where ca.id = p_corrective_action_id
  for update;
  if not found then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The corrective action was changed by another transaction.'
      using errcode = '40001';
  end if;

  if v_old.responsible_user_id is null
     or v_old.responsible_user_id <> v_actor
     or not private.financial_control_has_role(
       v_old.workspace_id, array['action_owner']::text[]
     ) then
    raise exception 'Only the assigned employee may transition this corrective action.'
      using errcode = '42501';
  end if;

  if not (
    (v_old.workflow_status = 'not_started' and p_to_status = 'in_progress')
    or (
      v_old.workflow_status = 'in_progress'
      and p_to_status = 'submitted_for_manager_review'
    )
  ) then
    raise exception 'Corrective-action transition % -> % is not allowed.',
      v_old.workflow_status, p_to_status using errcode = '42501';
  end if;

  if p_to_status = 'submitted_for_manager_review' then
    if v_old.progress_percent <> 100
       or nullif(pg_catalog.btrim(v_old.execution_details), '') is null
       or not exists (
         select 1
         from public.corrective_action_document_references r
         where r.workspace_id = v_old.workspace_id
           and r.finding_id = v_old.finding_id
           and r.corrective_action_id = v_old.id
       ) then
      raise exception 'Progress 100, execution details, and a document reference are required before manager submission.'
        using errcode = '23514';
    end if;
  end if;

  update public.corrective_actions
  set workflow_status = p_to_status,
      completed_at = null,
      updated_by = v_actor,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id and lock_version = p_expected_lock_version
  returning * into v_new;
  if not found then
    raise exception 'The corrective action was changed by another transaction.'
      using errcode = '40001';
  end if;

  insert into public.corrective_action_status_history (
    workspace_id, finding_id, corrective_action_id, from_status, to_status,
    progress_before, progress_after, due_date_before, due_date_after,
    reason, changed_by, changed_at
  ) values (
    v_old.workspace_id, v_old.finding_id, v_old.id,
    v_old.workflow_status, v_new.workflow_status,
    v_old.progress_percent, v_new.progress_percent,
    v_old.current_due_date, v_new.current_due_date,
    v_reason, v_actor, v_now
  );

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_actions', v_old.id::text, 'UPDATE',
    pg_catalog.to_jsonb(v_old),
    pg_catalog.to_jsonb(v_new) || pg_catalog.jsonb_build_object('_transition_reason', v_reason),
    v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

create or replace function private.financial_control_transition_finding_tx(
  p_finding_id uuid,
  p_to_status text,
  p_reason text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_old public.financial_control_findings%rowtype;
  v_new public.financial_control_findings%rowtype;
  v_action_old public.corrective_actions%rowtype;
  v_action_new public.corrective_actions%rowtype;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.financial_control_findings f
  where f.id = p_finding_id
  for update;
  if not found then
    raise exception 'Financial-control finding was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The finding was changed by another transaction.' using errcode = '40001';
  end if;

  if not (
    (
      v_old.workflow_status in (
        'imported_pending_review', 'not_started', 'reopened'
      )
      and p_to_status = 'in_progress'
      and private.financial_control_has_role(
        v_old.workspace_id, array['action_owner']::text[]
      )
      and exists (
        select 1 from public.corrective_actions ca
        where ca.workspace_id = v_old.workspace_id
          and ca.finding_id = v_old.id
          and ca.responsible_user_id is not null
          and ca.responsible_user_id = v_actor
      )
    )
    or (
      v_old.workflow_status in ('in_progress', 'returned_for_revision')
      and p_to_status = 'submitted_for_manager_review'
      and private.financial_control_has_role(
        v_old.workspace_id, array['action_owner']::text[]
      )
      and exists (
        select 1 from public.corrective_actions ca
        where ca.workspace_id = v_old.workspace_id
          and ca.finding_id = v_old.id
          and ca.responsible_user_id is not null
          and ca.responsible_user_id = v_actor
      )
    )
    or (
      v_old.workflow_status = 'submitted_for_manager_review'
      and p_to_status = 'under_manager_review'
      and private.financial_control_has_role(
        v_old.workspace_id, array['manager']::text[]
      )
    )
    or (
      v_old.workflow_status = 'under_manager_review'
      and p_to_status in ('returned_for_revision', 'approved')
      and private.financial_control_has_role(
        v_old.workspace_id, array['manager']::text[]
      )
    )
    or (
      v_old.workflow_status = 'approved'
      and p_to_status = 'closed'
      and private.financial_control_has_role(
        v_old.workspace_id, array['manager']::text[]
      )
    )
    or (
      v_old.workflow_status = 'closed'
      and p_to_status = 'reopened'
      and private.financial_control_has_role(
        v_old.workspace_id, array['manager']::text[]
      )
    )
  ) then
    raise exception 'Finding transition % -> % is not allowed for the current user.',
      v_old.workflow_status, p_to_status using errcode = '42501';
  end if;

  if (
    p_to_status in ('returned_for_revision', 'reopened')
    or (
      v_old.workflow_status = 'imported_pending_review'
      and p_to_status = 'in_progress'
    )
  ) and v_reason is null then
    raise exception 'A reason is required for this finding transition.' using errcode = '22023';
  end if;

  if p_to_status in ('submitted_for_manager_review', 'approved') then
    if not exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id and ca.finding_id = v_old.id
    ) or exists (
      select 1 from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id
        and ca.finding_id = v_old.id
        and ca.workflow_status <> 'submitted_for_manager_review'
    ) then
      raise exception 'All corrective actions must be submitted for manager review.'
        using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'approved' and exists (
    select 1
    from public.corrective_action_document_references r
    where r.workspace_id = v_old.workspace_id
      and r.finding_id = v_old.id
      and r.manager_verification_status in ('pending', 'rejected')
  ) then
    raise exception 'All document references must be approved before finding approval.'
      using errcode = '23514';
  end if;

  if p_to_status = 'returned_for_revision' then
    for v_action_old in
      select * from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id
        and ca.finding_id = v_old.id
        and ca.workflow_status = 'submitted_for_manager_review'
      for update
    loop
      update public.corrective_actions
      set workflow_status = 'in_progress', completed_at = null,
          updated_by = v_actor, updated_at = v_now,
          lock_version = lock_version + 1
      where id = v_action_old.id
      returning * into v_action_new;

      insert into public.corrective_action_status_history (
        workspace_id, finding_id, corrective_action_id, from_status, to_status,
        progress_before, progress_after, due_date_before, due_date_after,
        reason, changed_by, changed_at
      ) values (
        v_action_old.workspace_id, v_action_old.finding_id, v_action_old.id,
        v_action_old.workflow_status, v_action_new.workflow_status,
        v_action_old.progress_percent, v_action_new.progress_percent,
        v_action_old.current_due_date, v_action_new.current_due_date,
        v_reason, v_actor, v_now
      );
      insert into public.audit_logs (
        actor_user_id, table_name, record_id, action, old_data, new_data, created_at
      ) values (
        v_actor, 'corrective_actions', v_action_old.id::text, 'UPDATE',
        pg_catalog.to_jsonb(v_action_old), pg_catalog.to_jsonb(v_action_new), v_now
      );
    end loop;
  elsif p_to_status = 'approved' then
    for v_action_old in
      select * from public.corrective_actions ca
      where ca.workspace_id = v_old.workspace_id
        and ca.finding_id = v_old.id
        and ca.workflow_status = 'submitted_for_manager_review'
      for update
    loop
      update public.corrective_actions
      set workflow_status = 'completed', completed_at = v_now,
          updated_by = v_actor, updated_at = v_now,
          lock_version = lock_version + 1
      where id = v_action_old.id
      returning * into v_action_new;

      insert into public.corrective_action_status_history (
        workspace_id, finding_id, corrective_action_id, from_status, to_status,
        progress_before, progress_after, due_date_before, due_date_after,
        reason, changed_by, changed_at
      ) values (
        v_action_old.workspace_id, v_action_old.finding_id, v_action_old.id,
        v_action_old.workflow_status, v_action_new.workflow_status,
        v_action_old.progress_percent, v_action_new.progress_percent,
        v_action_old.current_due_date, v_action_new.current_due_date,
        v_reason, v_actor, v_now
      );
      insert into public.audit_logs (
        actor_user_id, table_name, record_id, action, old_data, new_data, created_at
      ) values (
        v_actor, 'corrective_actions', v_action_old.id::text, 'UPDATE',
        pg_catalog.to_jsonb(v_action_old), pg_catalog.to_jsonb(v_action_new), v_now
      );
    end loop;
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
  where id = v_old.id and lock_version = p_expected_lock_version
  returning * into v_new;
  if not found then
    raise exception 'The finding was changed by another transaction.' using errcode = '40001';
  end if;

  insert into public.finding_status_history (
    workspace_id, finding_id, from_status, to_status, transition_code, reason,
    progress_before, progress_after, due_date_before, due_date_after,
    snapshot_version, changed_by, changed_at
  ) values (
    v_old.workspace_id, v_old.id, v_old.workflow_status, v_new.workflow_status,
    v_old.workflow_status || '_to_' || v_new.workflow_status, v_reason,
    v_old.progress_percent, v_new.progress_percent,
    v_old.current_due_date, v_new.current_due_date,
    v_new.lock_version, v_actor, v_now
  );
  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'financial_control_findings', v_old.id::text, 'UPDATE',
    pg_catalog.to_jsonb(v_old),
    pg_catalog.to_jsonb(v_new) || pg_catalog.jsonb_build_object('_transition_reason', v_reason),
    v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

revoke all on function private.financial_control_transition_action_tx(
  uuid, text, text, integer
) from public;
revoke execute on function private.financial_control_transition_action_tx(
  uuid, text, text, integer
) from anon, authenticated;
revoke all on function private.financial_control_transition_finding_tx(
  uuid, text, text, integer
) from public;
revoke execute on function private.financial_control_transition_finding_tx(
  uuid, text, text, integer
) from anon, authenticated;

-- الأغلفة العامة الحالية تبقى وحدها قابلة للتنفيذ بواسطة authenticated.
revoke all on function public.financial_control_transition_action(
  uuid, text, text, integer
) from public;
revoke execute on function public.financial_control_transition_action(
  uuid, text, text, integer
) from anon;
grant execute on function public.financial_control_transition_action(
  uuid, text, text, integer
) to authenticated;
revoke all on function public.financial_control_transition_finding(
  uuid, text, text, integer
) from public;
revoke execute on function public.financial_control_transition_finding(
  uuid, text, text, integer
) from anon;
grant execute on function public.financial_control_transition_finding(
  uuid, text, text, integer
) to authenticated;

commit;
