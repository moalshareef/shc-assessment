-- مسودة غير مطبقة (2/3): جميع عمليات كتابة المستندات المرجعية عبر RPC.
-- تعتمد على financial_control_document_references_schema_draft.sql.

begin;

create or replace function public.financial_control_add_document_reference(
  p_corrective_action_id uuid,
  p_document_number text,
  p_document_name text,
  p_document_type text,
  p_document_date date,
  p_issuing_entity text,
  p_storage_location text,
  p_location_reference text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_action public.corrective_actions%rowtype;
  v_finding_status text;
  v_new public.corrective_action_document_references%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_document_number is null or pg_catalog.btrim(p_document_number) = ''
     or p_document_name is null or pg_catalog.btrim(p_document_name) = ''
     or p_document_type is null or pg_catalog.btrim(p_document_type) = ''
     or p_document_date is null
     or p_issuing_entity is null or pg_catalog.btrim(p_issuing_entity) = ''
     or p_storage_location is null
     or p_storage_location not in ('share_folder', 'official_email', 'internal_system', 'other')
     or p_location_reference is null or pg_catalog.btrim(p_location_reference) = '' then
    raise exception 'Complete and valid document-reference fields are required.'
      using errcode = '22023';
  end if;

  select ca.* into v_action
  from public.corrective_actions ca
  where ca.id = p_corrective_action_id
  for update;

  if not found then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;

  select f.workflow_status into v_finding_status
  from public.financial_control_findings f
  where f.id = v_action.finding_id
    and f.workspace_id = v_action.workspace_id;

  if v_action.responsible_user_id is null
     or v_action.responsible_user_id <> v_actor
     or not private.financial_control_has_role(
       v_action.workspace_id, array['action_owner']::text[]
     ) then
    raise exception 'Only the assigned employee may add a document reference.'
      using errcode = '42501';
  end if;

  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.'
      using errcode = '42501';
  end if;

  insert into public.corrective_action_document_references (
    workspace_id, finding_id, corrective_action_id, document_number,
    document_name, document_type, document_date, issuing_entity,
    storage_location, location_reference, description,
    manager_verification_status, created_by, created_at, updated_at, lock_version
  ) values (
    v_action.workspace_id, v_action.finding_id, v_action.id,
    pg_catalog.btrim(p_document_number), pg_catalog.btrim(p_document_name),
    pg_catalog.btrim(p_document_type), p_document_date,
    pg_catalog.btrim(p_issuing_entity), p_storage_location,
    pg_catalog.btrim(p_location_reference), nullif(pg_catalog.btrim(p_description), ''),
    'pending', v_actor, v_now, v_now, 1
  ) returning * into v_new;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_action_document_references', v_new.id::text,
    'INSERT', null, pg_catalog.to_jsonb(v_new), v_now
  );

  return pg_catalog.to_jsonb(v_new);
end;
$function$;

create or replace function public.financial_control_update_document_reference(
  p_document_reference_id uuid,
  p_document_number text,
  p_document_name text,
  p_document_type text,
  p_document_date date,
  p_issuing_entity text,
  p_storage_location text,
  p_location_reference text,
  p_description text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_old public.corrective_action_document_references%rowtype;
  v_new public.corrective_action_document_references%rowtype;
  v_finding_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;
  if p_document_number is null or pg_catalog.btrim(p_document_number) = ''
     or p_document_name is null or pg_catalog.btrim(p_document_name) = ''
     or p_document_type is null or pg_catalog.btrim(p_document_type) = ''
     or p_document_date is null
     or p_issuing_entity is null or pg_catalog.btrim(p_issuing_entity) = ''
     or p_storage_location is null
     or p_storage_location not in ('share_folder', 'official_email', 'internal_system', 'other')
     or p_location_reference is null or pg_catalog.btrim(p_location_reference) = '' then
    raise exception 'Complete and valid document-reference fields are required.'
      using errcode = '22023';
  end if;

  select * into v_old
  from public.corrective_action_document_references r
  where r.id = p_document_reference_id
  for update;
  if not found then
    raise exception 'Document reference was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;

  select f.workflow_status into v_finding_status
  from public.corrective_actions ca
  join public.financial_control_findings f
    on f.id = ca.finding_id and f.workspace_id = ca.workspace_id
  where ca.id = v_old.corrective_action_id
    and ca.workspace_id = v_old.workspace_id
    and ca.finding_id = v_old.finding_id
    and ca.responsible_user_id is not null
    and ca.responsible_user_id = v_actor;

  if not found or not private.financial_control_has_role(
    v_old.workspace_id, array['action_owner']::text[]
  ) then
    raise exception 'Only the assigned employee may update a document reference.'
      using errcode = '42501';
  end if;
  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.'
      using errcode = '42501';
  end if;

  update public.corrective_action_document_references
  set document_number = pg_catalog.btrim(p_document_number),
      document_name = pg_catalog.btrim(p_document_name),
      document_type = pg_catalog.btrim(p_document_type),
      document_date = p_document_date,
      issuing_entity = pg_catalog.btrim(p_issuing_entity),
      storage_location = p_storage_location,
      location_reference = pg_catalog.btrim(p_location_reference),
      description = nullif(pg_catalog.btrim(p_description), ''),
      manager_verification_status = 'pending',
      manager_decision_note = null,
      manager_verified_by = null,
      manager_verified_at = null,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id and lock_version = p_expected_lock_version
  returning * into v_new;

  if not found then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_action_document_references', v_old.id::text,
    'UPDATE', pg_catalog.to_jsonb(v_old), pg_catalog.to_jsonb(v_new), v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

create or replace function public.financial_control_delete_document_reference(
  p_document_reference_id uuid,
  p_expected_lock_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_old public.corrective_action_document_references%rowtype;
  v_finding_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.corrective_action_document_references r
  where r.id = p_document_reference_id
  for update;
  if not found then
    raise exception 'Document reference was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;

  select f.workflow_status into v_finding_status
  from public.corrective_actions ca
  join public.financial_control_findings f
    on f.id = ca.finding_id and f.workspace_id = ca.workspace_id
  where ca.id = v_old.corrective_action_id
    and ca.workspace_id = v_old.workspace_id
    and ca.finding_id = v_old.finding_id
    and ca.responsible_user_id is not null
    and ca.responsible_user_id = v_actor;

  if not found or not private.financial_control_has_role(
    v_old.workspace_id, array['action_owner']::text[]
  ) then
    raise exception 'Only the assigned employee may delete a document reference.'
      using errcode = '42501';
  end if;
  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.'
      using errcode = '42501';
  end if;

  delete from public.corrective_action_document_references
  where id = v_old.id and lock_version = p_expected_lock_version;
  if not found then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_action_document_references', v_old.id::text,
    'DELETE', pg_catalog.to_jsonb(v_old), null, v_now
  );
end;
$function$;

create or replace function public.financial_control_decide_document_reference(
  p_document_reference_id uuid,
  p_decision text,
  p_decision_note text,
  p_expected_lock_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_old public.corrective_action_document_references%rowtype;
  v_new public.corrective_action_document_references%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_decision_note), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_note is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old
  from public.corrective_action_document_references r
  where r.id = p_document_reference_id
  for update;
  if not found then
    raise exception 'Document reference was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;
  if not private.financial_control_has_role(
    v_old.workspace_id, array['manager']::text[]
  ) then
    raise exception 'Only a manager may decide a document reference.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.financial_control_findings f
    where f.id = v_old.finding_id
      and f.workspace_id = v_old.workspace_id
      and f.workflow_status = 'under_manager_review'
  ) then
    raise exception 'The finding must be under manager review.' using errcode = '23514';
  end if;

  update public.corrective_action_document_references
  set manager_verification_status = p_decision,
      manager_decision_note = v_note,
      manager_verified_by = v_actor,
      manager_verified_at = v_now,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id and lock_version = p_expected_lock_version
  returning * into v_new;
  if not found then
    raise exception 'The document reference was changed by another transaction.'
      using errcode = '40001';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_action_document_references', v_old.id::text,
    'UPDATE', pg_catalog.to_jsonb(v_old), pg_catalog.to_jsonb(v_new), v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

revoke all on function public.financial_control_add_document_reference(
  uuid, text, text, text, date, text, text, text, text
) from public;
revoke all on function public.financial_control_update_document_reference(
  uuid, text, text, text, date, text, text, text, text, integer
) from public;
revoke all on function public.financial_control_delete_document_reference(uuid, integer)
  from public;
revoke all on function public.financial_control_decide_document_reference(uuid, text, text, integer)
  from public;

revoke execute on function public.financial_control_add_document_reference(
  uuid, text, text, text, date, text, text, text, text
) from anon;
revoke execute on function public.financial_control_update_document_reference(
  uuid, text, text, text, date, text, text, text, text, integer
) from anon;
revoke execute on function public.financial_control_delete_document_reference(uuid, integer)
  from anon;
revoke execute on function public.financial_control_decide_document_reference(uuid, text, text, integer)
  from anon;

grant execute on function public.financial_control_add_document_reference(
  uuid, text, text, text, date, text, text, text, text
) to authenticated;
grant execute on function public.financial_control_update_document_reference(
  uuid, text, text, text, date, text, text, text, text, integer
) to authenticated;
grant execute on function public.financial_control_delete_document_reference(uuid, integer)
  to authenticated;
grant execute on function public.financial_control_decide_document_reference(uuid, text, text, integer)
  to authenticated;

commit;
