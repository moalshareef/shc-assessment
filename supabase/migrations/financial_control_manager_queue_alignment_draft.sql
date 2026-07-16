-- مواءمة لوحة المدير مع رفع الإجراءات التصحيحية دون تعديل بيانات قائم أو إعادة رفع من الموظف.

create or replace function public.financial_control_begin_manager_review(
  p_finding_id uuid,
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
  v_reason text := coalesce(
    nullif(pg_catalog.btrim(p_reason), ''),
    'بدء مراجعة المدير بعد اكتمال رفع الإجراءات التصحيحية.'
  );
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
  if not private.financial_control_can_manage_finding(v_old.workspace_id, v_old.id) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  if v_old.workflow_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'submitted_for_manager_review'
  ) then
    raise exception 'The finding is not awaiting manager review.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.corrective_actions ca
    where ca.workspace_id = v_old.workspace_id
      and ca.finding_id = v_old.id
  ) or exists (
    select 1 from public.corrective_actions ca
    where ca.workspace_id = v_old.workspace_id
      and ca.finding_id = v_old.id
      and ca.workflow_status not in ('submitted_for_manager_review', 'completed')
  ) then
    raise exception 'All corrective actions must be submitted for manager review.'
      using errcode = '23514';
  end if;

  update public.financial_control_findings
  set workflow_status = 'under_manager_review',
      last_activity_at = v_now,
      updated_by = v_actor,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id
    and lock_version = p_expected_lock_version
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

revoke all on function public.financial_control_begin_manager_review(uuid, text, integer)
from public, anon, authenticated;
grant execute on function public.financial_control_begin_manager_review(uuid, text, integer)
to authenticated;

select pg_catalog.pg_notify('pgrst', 'reload schema');
