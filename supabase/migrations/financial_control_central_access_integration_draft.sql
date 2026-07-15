-- توحيد التفويض التشغيلي للرقابة المالية بين العضويات القديمة والصلاحيات المركزية.
-- لا تنقل هذه الحزمة أي بيانات ولا تنشئ إسنادات أو تعليقات أو مستندات.

create or replace function private.financial_control_user_has_legacy_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null and exists (
    select 1
    from public.financial_control_members m
    join public.profiles p on p.id = m.user_id and p.is_active
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role = any(p_roles)
      and m.is_active
      and m.starts_at <= pg_catalog.clock_timestamp()
      and (m.ends_at is null or m.ends_at > pg_catalog.clock_timestamp())
  );
$function$;

create or replace function private.financial_control_central_scope_allows_finding(
  p_user_id uuid,
  p_workspace_id uuid,
  p_finding_id uuid,
  p_role_codes text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null and exists (
    select 1
    from public.user_module_access a
    join public.profiles p on p.id = a.user_id and p.is_active
    join public.organizations o on o.id = a.organization_id and o.status = 'active'
    join public.user_organizations uo
      on uo.user_id = a.user_id and uo.organization_id = a.organization_id
    join public.financial_control_findings f
      on f.id = p_finding_id and f.workspace_id = p_workspace_id
    where a.user_id = p_user_id
      and a.workspace_id = p_workspace_id
      and a.role_code = any(p_role_codes)
      and a.status in ('scheduled', 'active')
      and a.revoked_at is null
      and a.starts_at <= pg_catalog.clock_timestamp()
      and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
      and uo.status = 'active'
      and uo.starts_at <= pg_catalog.clock_timestamp()
      and (uo.ends_at is null or uo.ends_at > pg_catalog.clock_timestamp())
      and (
        a.access_scope = 'all_records'
        or (
          a.access_scope = 'assigned_records'
          and exists (
            select 1
            from public.corrective_actions ca
            where ca.workspace_id = f.workspace_id
              and ca.finding_id = f.id
              and ca.responsible_user_id = p_user_id
          )
        )
        or (
          a.access_scope = 'organization_records'
          and f.official_owner_department_id is not null
          and exists (
            select 1
            from public.organization_department_mappings odm
            where odm.organization_id = a.organization_id
              and odm.department_id = f.official_owner_department_id
          )
        )
      )
  );
$function$;

create or replace function private.financial_control_central_scope_allows_item(
  p_user_id uuid,
  p_workspace_id uuid,
  p_finding_id uuid,
  p_corrective_action_id uuid,
  p_role_codes text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null and exists (
    select 1
    from public.user_module_access a
    join public.profiles p on p.id = a.user_id and p.is_active
    join public.organizations o on o.id = a.organization_id and o.status = 'active'
    join public.user_organizations uo
      on uo.user_id = a.user_id and uo.organization_id = a.organization_id
    join public.financial_control_findings f
      on f.id = p_finding_id and f.workspace_id = p_workspace_id
    where a.user_id = p_user_id
      and a.workspace_id = p_workspace_id
      and a.role_code = any(p_role_codes)
      and a.status in ('scheduled', 'active')
      and a.revoked_at is null
      and a.starts_at <= pg_catalog.clock_timestamp()
      and (a.ends_at is null or a.ends_at > pg_catalog.clock_timestamp())
      and uo.status = 'active'
      and uo.starts_at <= pg_catalog.clock_timestamp()
      and (uo.ends_at is null or uo.ends_at > pg_catalog.clock_timestamp())
      and (
        a.access_scope = 'all_records'
        or (
          a.access_scope = 'organization_records'
          and f.official_owner_department_id is not null
          and exists (
            select 1
            from public.organization_department_mappings odm
            where odm.organization_id = a.organization_id
              and odm.department_id = f.official_owner_department_id
          )
        )
        or (
          a.access_scope = 'assigned_records'
          and exists (
            select 1
            from public.corrective_actions ca
            where ca.workspace_id = f.workspace_id
              and ca.finding_id = f.id
              and ca.responsible_user_id = p_user_id
              and (p_corrective_action_id is null or ca.id = p_corrective_action_id)
          )
        )
      )
  );
$function$;

create or replace function private.financial_control_can_read_finding(
  p_workspace_id uuid,
  p_finding_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.financial_control_user_has_legacy_role(
      p_workspace_id, (select auth.uid()),
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or private.financial_control_central_scope_allows_finding(
      (select auth.uid()), p_workspace_id, p_finding_id,
      array['financial_control_manager', 'financial_control_employee']::text[]
    )
    or (
      private.financial_control_user_has_legacy_role(
        p_workspace_id, (select auth.uid()), array['action_owner']::text[]
      )
      and exists (
        select 1 from public.corrective_actions ca
        where ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
      )
    );
$function$;

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
as $function$
  select
    private.financial_control_user_has_legacy_role(
      p_workspace_id, (select auth.uid()),
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or private.financial_control_central_scope_allows_item(
      (select auth.uid()), p_workspace_id, p_finding_id,
      p_corrective_action_id,
      array['financial_control_manager', 'financial_control_employee']::text[]
    )
    or (
      private.financial_control_user_has_legacy_role(
        p_workspace_id, (select auth.uid()), array['action_owner']::text[]
      )
      and exists (
        select 1 from public.corrective_actions ca
        where ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
          and (p_corrective_action_id is null or ca.id = p_corrective_action_id)
      )
    );
$function$;

create or replace function private.financial_control_can_work_finding(
  p_workspace_id uuid,
  p_finding_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.corrective_actions ca
    where ca.workspace_id = p_workspace_id
      and ca.finding_id = p_finding_id
      and ca.responsible_user_id = (select auth.uid())
  ) and (
    private.financial_control_user_has_legacy_role(
      p_workspace_id, (select auth.uid()), array['action_owner']::text[]
    )
    or private.financial_control_central_scope_allows_finding(
      (select auth.uid()), p_workspace_id, p_finding_id,
      array['financial_control_employee']::text[]
    )
  );
$function$;

create or replace function private.financial_control_can_work_action(
  p_workspace_id uuid,
  p_finding_id uuid,
  p_corrective_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.financial_control_can_work_finding(p_workspace_id, p_finding_id)
    and exists (
      select 1 from public.corrective_actions ca
      where ca.id = p_corrective_action_id
        and ca.workspace_id = p_workspace_id
        and ca.finding_id = p_finding_id
        and ca.responsible_user_id = (select auth.uid())
    );
$function$;

create or replace function private.financial_control_can_manage_finding(
  p_workspace_id uuid,
  p_finding_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.financial_control_user_has_legacy_role(
      p_workspace_id, (select auth.uid()), array['owner', 'manager']::text[]
    )
    or private.financial_control_central_scope_allows_finding(
      (select auth.uid()), p_workspace_id, p_finding_id,
      array['financial_control_manager']::text[]
    );
$function$;

create or replace function public.financial_control_transition_action(
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
  v_action public.corrective_actions%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into v_action from public.corrective_actions where id = p_corrective_action_id;
  if not found then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;
  if not private.financial_control_can_work_action(
    v_action.workspace_id, v_action.finding_id, v_action.id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  return private.financial_control_transition_action_tx(
    p_corrective_action_id, p_to_status, p_reason, p_expected_lock_version
  );
end;
$function$;

create or replace function public.financial_control_transition_finding(
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
  v_finding public.financial_control_findings%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into v_finding from public.financial_control_findings where id = p_finding_id;
  if not found then
    raise exception 'Financial-control finding was not found.' using errcode = 'P0002';
  end if;
  if p_to_status in ('in_progress', 'submitted_for_manager_review') then
    if not private.financial_control_can_work_finding(v_finding.workspace_id, v_finding.id) then
      raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
    end if;
  elsif p_to_status in ('under_manager_review', 'returned_for_revision', 'approved', 'closed', 'reopened') then
    if not private.financial_control_can_manage_finding(v_finding.workspace_id, v_finding.id) then
      raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
    end if;
  else
    raise exception 'The requested finding transition is not supported.' using errcode = '22023';
  end if;
  return private.financial_control_transition_finding_tx(
    p_finding_id, p_to_status, p_reason, p_expected_lock_version
  );
end;
$function$;

create or replace function public.financial_control_update_action_progress(
  p_corrective_action_id uuid,
  p_progress_percent numeric,
  p_execution_details text,
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
  v_details text := nullif(pg_catalog.btrim(p_execution_details), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_progress_percent is null or p_progress_percent < 0 or p_progress_percent > 100 then
    raise exception 'يجب أن تكون نسبة الإنجاز بين 0 و100.' using errcode = '22023';
  end if;
  if v_details is null then
    raise exception 'ملاحظة التحديث مطلوبة قبل الحفظ.' using errcode = '22023';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;

  select * into v_old from public.corrective_actions
  where id = p_corrective_action_id for update;
  if not found then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The corrective action was changed by another transaction.' using errcode = '40001';
  end if;
  if not private.financial_control_can_work_action(
    v_old.workspace_id, v_old.finding_id, v_old.id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  if v_old.workflow_status not in ('not_started', 'in_progress') then
    raise exception 'لا يمكن تعديل التنفيذ بعد رفع الإجراء للمدير.' using errcode = '23514';
  end if;

  update public.corrective_actions
  set progress_percent = p_progress_percent,
      execution_details = v_details,
      updated_by = v_actor,
      updated_at = v_now,
      lock_version = lock_version + 1
  where id = v_old.id and lock_version = p_expected_lock_version
  returning * into v_new;
  if not found then
    raise exception 'The corrective action was changed by another transaction.' using errcode = '40001';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_actions', v_old.id::text, 'UPDATE',
    pg_catalog.to_jsonb(v_old),
    pg_catalog.to_jsonb(v_new) || pg_catalog.jsonb_build_object('_operation', 'progress_update'),
    v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

create or replace function public.financial_control_add_follow_up_comment(
  p_finding_id uuid,
  p_corrective_action_id uuid,
  p_activity_at timestamptz,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_finding public.financial_control_findings%rowtype;
  v_new public.finding_comments%rowtype;
  v_body text := nullif(pg_catalog.btrim(p_body), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_body is null then
    raise exception 'نص ملاحظة المتابعة مطلوب.' using errcode = '22023';
  end if;
  if p_activity_at is null then
    raise exception 'تاريخ المتابعة مطلوب.' using errcode = '22023';
  end if;
  select * into v_finding from public.financial_control_findings where id = p_finding_id;
  if not found then
    raise exception 'Financial-control finding was not found.' using errcode = 'P0002';
  end if;

  if p_corrective_action_id is null then
    if not (
      private.financial_control_can_work_finding(v_finding.workspace_id, v_finding.id)
      or private.financial_control_can_manage_finding(v_finding.workspace_id, v_finding.id)
      or private.financial_control_user_has_legacy_role(
        v_finding.workspace_id, v_actor, array['specialist']::text[]
      )
    ) then
      raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
    end if;
  elsif not exists (
    select 1 from public.corrective_actions ca
    where ca.id = p_corrective_action_id
      and ca.workspace_id = v_finding.workspace_id
      and ca.finding_id = v_finding.id
  ) then
    raise exception 'Corrective action does not belong to the finding.' using errcode = '22023';
  elsif not (
    private.financial_control_can_work_action(
      v_finding.workspace_id, v_finding.id, p_corrective_action_id
    )
    or private.financial_control_can_manage_finding(v_finding.workspace_id, v_finding.id)
    or private.financial_control_user_has_legacy_role(
      v_finding.workspace_id, v_actor, array['specialist']::text[]
    )
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;

  insert into public.finding_comments (
    workspace_id, finding_id, corrective_action_id, parent_comment_id,
    comment_type, visibility, body, author_user_id,
    supersedes_comment_id, created_at
  ) values (
    v_finding.workspace_id, v_finding.id, p_corrective_action_id, null,
    'internal', 'workspace', v_body, v_actor, null, p_activity_at
  ) returning * into v_new;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'finding_comments', v_new.id::text, 'INSERT', null,
    pg_catalog.to_jsonb(v_new), v_now
  );
  return pg_catalog.to_jsonb(v_new);
end;
$function$;

create or replace function public.financial_control_decide_extension(
  p_extension_request_id uuid,
  p_decision text,
  p_decision_note text,
  p_expected_action_lock_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_request public.extension_requests%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  select * into v_request from public.extension_requests where id = p_extension_request_id;
  if not found then
    raise exception 'Extension request was not found.' using errcode = 'P0002';
  end if;
  if not private.financial_control_can_manage_finding(
    v_request.workspace_id, v_request.finding_id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  return private.financial_control_decide_extension_tx(
    p_extension_request_id, p_decision, p_decision_note,
    p_expected_action_lock_version
  );
end;
$function$;

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
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_document_number is null or pg_catalog.btrim(p_document_number) = ''
     or p_document_name is null or pg_catalog.btrim(p_document_name) = ''
     or p_document_type is null or pg_catalog.btrim(p_document_type) = ''
     or p_document_date is null
     or p_issuing_entity is null or pg_catalog.btrim(p_issuing_entity) = ''
     or p_storage_location not in ('share_folder', 'official_email', 'internal_system', 'other')
     or p_location_reference is null or pg_catalog.btrim(p_location_reference) = '' then
    raise exception 'Complete and valid document-reference fields are required.' using errcode = '22023';
  end if;
  select * into v_action from public.corrective_actions
  where id = p_corrective_action_id for update;
  if not found then raise exception 'Corrective action was not found.' using errcode = 'P0002'; end if;
  if not private.financial_control_can_work_action(
    v_action.workspace_id, v_action.finding_id, v_action.id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  select workflow_status into v_finding_status
  from public.financial_control_findings
  where id = v_action.finding_id and workspace_id = v_action.workspace_id;
  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.' using errcode = '42501';
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
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;
  if p_document_number is null or pg_catalog.btrim(p_document_number) = ''
     or p_document_name is null or pg_catalog.btrim(p_document_name) = ''
     or p_document_type is null or pg_catalog.btrim(p_document_type) = ''
     or p_document_date is null
     or p_issuing_entity is null or pg_catalog.btrim(p_issuing_entity) = ''
     or p_storage_location not in ('share_folder', 'official_email', 'internal_system', 'other')
     or p_location_reference is null or pg_catalog.btrim(p_location_reference) = '' then
    raise exception 'Complete and valid document-reference fields are required.' using errcode = '22023';
  end if;
  select * into v_old from public.corrective_action_document_references
  where id = p_document_reference_id for update;
  if not found then raise exception 'Document reference was not found.' using errcode = 'P0002'; end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
  end if;
  if not private.financial_control_can_work_action(
    v_old.workspace_id, v_old.finding_id, v_old.corrective_action_id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  select workflow_status into v_finding_status
  from public.financial_control_findings
  where id = v_old.finding_id and workspace_id = v_old.workspace_id;
  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.' using errcode = '42501';
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
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
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
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;
  select * into v_old from public.corrective_action_document_references
  where id = p_document_reference_id for update;
  if not found then raise exception 'Document reference was not found.' using errcode = 'P0002'; end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
  end if;
  if not private.financial_control_can_work_action(
    v_old.workspace_id, v_old.finding_id, v_old.corrective_action_id
  ) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  select workflow_status into v_finding_status
  from public.financial_control_findings
  where id = v_old.finding_id and workspace_id = v_old.workspace_id;
  if v_finding_status not in (
    'imported_pending_review', 'not_started', 'in_progress',
    'returned_for_revision', 'reopened'
  ) then
    raise exception 'Document references are locked after manager submission.' using errcode = '42501';
  end if;
  delete from public.corrective_action_document_references
  where id = v_old.id and lock_version = p_expected_lock_version;
  if not found then
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
  end if;
  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    v_actor, 'corrective_action_document_references', v_old.id::text,
    'DELETE', pg_catalog.to_jsonb(v_old), null, v_now
  );
end;
$function$;

-- حماية قرارات المدير على المراجع بنطاق السجل نفسه.
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
  if v_actor is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_note is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  if p_expected_lock_version is null or p_expected_lock_version < 1 then
    raise exception 'A valid expected lock version is required.' using errcode = '22023';
  end if;
  select * into v_old from public.corrective_action_document_references
  where id = p_document_reference_id for update;
  if not found then raise exception 'Document reference was not found.' using errcode = 'P0002'; end if;
  if v_old.lock_version <> p_expected_lock_version then
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
  end if;
  if not private.financial_control_can_manage_finding(v_old.workspace_id, v_old.finding_id) then
    raise exception 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.financial_control_findings f
    where f.id = v_old.finding_id and f.workspace_id = v_old.workspace_id
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
    raise exception 'The document reference was changed by another transaction.' using errcode = '40001';
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

-- سياسات السجلات التشغيلية تستخدم التفويض المرتبط بالسجل، لا الدور المجرد.
drop policy if exists financial_control_findings_select on public.financial_control_findings;
create policy financial_control_findings_select on public.financial_control_findings
for select to authenticated
using (private.financial_control_can_read_finding(workspace_id, id));

drop policy if exists financial_control_findings_update_operational on public.financial_control_findings;
create policy financial_control_findings_update_operational on public.financial_control_findings
for update to authenticated
using (
  private.financial_control_can_manage_finding(workspace_id, id)
  or private.financial_control_user_has_legacy_role(
    workspace_id, (select auth.uid()), array['specialist']::text[]
  )
)
with check (
  private.financial_control_can_manage_finding(workspace_id, id)
  or private.financial_control_user_has_legacy_role(
    workspace_id, (select auth.uid()), array['specialist']::text[]
  )
);

drop policy if exists corrective_actions_select on public.corrective_actions;
create policy corrective_actions_select on public.corrective_actions
for select to authenticated
using (private.financial_control_can_read_item(workspace_id, finding_id, id));

drop policy if exists corrective_actions_insert_manager on public.corrective_actions;
create policy corrective_actions_insert_manager on public.corrective_actions
for insert to authenticated
with check (private.financial_control_can_manage_finding(workspace_id, finding_id));

drop policy if exists corrective_actions_update on public.corrective_actions;
create policy corrective_actions_update on public.corrective_actions
for update to authenticated
using (
  private.financial_control_can_manage_finding(workspace_id, finding_id)
  or private.financial_control_can_work_action(workspace_id, finding_id, id)
  or private.financial_control_user_has_legacy_role(
    workspace_id, (select auth.uid()), array['specialist']::text[]
  )
)
with check (
  private.financial_control_can_manage_finding(workspace_id, finding_id)
  or private.financial_control_can_work_action(workspace_id, finding_id, id)
  or private.financial_control_user_has_legacy_role(
    workspace_id, (select auth.uid()), array['specialist']::text[]
  )
);

drop policy if exists finding_comments_select on public.finding_comments;
create policy finding_comments_select on public.finding_comments
for select to authenticated
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

drop policy if exists finding_comments_insert on public.finding_comments;
create policy finding_comments_insert on public.finding_comments
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (
    private.financial_control_can_manage_finding(workspace_id, finding_id)
    or private.financial_control_user_has_legacy_role(
      workspace_id, (select auth.uid()), array['specialist']::text[]
    )
    or (corrective_action_id is null and private.financial_control_can_work_finding(workspace_id, finding_id))
    or (corrective_action_id is not null and private.financial_control_can_work_action(
      workspace_id, finding_id, corrective_action_id
    ))
  )
);

drop policy if exists finding_messages_select on public.finding_messages;
create policy finding_messages_select on public.finding_messages
for select to authenticated
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

drop policy if exists finding_messages_insert on public.finding_messages;
create policy finding_messages_insert on public.finding_messages
for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    private.financial_control_can_manage_finding(workspace_id, finding_id)
    or private.financial_control_user_has_legacy_role(
      workspace_id, (select auth.uid()), array['specialist']::text[]
    )
    or (corrective_action_id is null and private.financial_control_can_work_finding(workspace_id, finding_id))
    or (corrective_action_id is not null and private.financial_control_can_work_action(
      workspace_id, finding_id, corrective_action_id
    ))
  )
);

drop policy if exists finding_assignments_select on public.finding_assignments;
create policy finding_assignments_select on public.finding_assignments
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.financial_control_can_read_finding(workspace_id, finding_id)
);

drop policy if exists finding_assignments_insert_manager on public.finding_assignments;
create policy finding_assignments_insert_manager on public.finding_assignments
for insert to authenticated
with check (private.financial_control_can_manage_finding(workspace_id, finding_id));

drop policy if exists finding_assignments_update_manager on public.finding_assignments;
create policy finding_assignments_update_manager on public.finding_assignments
for update to authenticated
using (private.financial_control_can_manage_finding(workspace_id, finding_id))
with check (private.financial_control_can_manage_finding(workspace_id, finding_id));

drop policy if exists corrective_action_document_references_select on public.corrective_action_document_references;
create policy corrective_action_document_references_select on public.corrective_action_document_references
for select to authenticated
using (private.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

drop policy if exists corrective_action_document_references_insert_employee on public.corrective_action_document_references;
create policy corrective_action_document_references_insert_employee on public.corrective_action_document_references
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and manager_verification_status = 'pending'
  and manager_decision_note is null
  and manager_verified_by is null
  and manager_verified_at is null
  and lock_version = 1
  and private.financial_control_can_work_action(workspace_id, finding_id, corrective_action_id)
  and exists (
    select 1 from public.financial_control_findings f
    where f.id = corrective_action_document_references.finding_id
      and f.workspace_id = corrective_action_document_references.workspace_id
      and f.workflow_status in (
        'imported_pending_review', 'not_started', 'in_progress',
        'returned_for_revision', 'reopened'
      )
  )
);

drop policy if exists corrective_action_document_references_delete_employee on public.corrective_action_document_references;
create policy corrective_action_document_references_delete_employee on public.corrective_action_document_references
for delete to authenticated
using (
  private.financial_control_can_work_action(workspace_id, finding_id, corrective_action_id)
  and exists (
    select 1 from public.financial_control_findings f
    where f.id = corrective_action_document_references.finding_id
      and f.workspace_id = corrective_action_document_references.workspace_id
      and f.workflow_status in (
        'imported_pending_review', 'not_started', 'in_progress',
        'returned_for_revision', 'reopened'
      )
  )
);

-- لا تمنح صلاحيات مباشرة جديدة على الجداول.
revoke all on function private.financial_control_user_has_legacy_role(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function private.financial_control_central_scope_allows_finding(uuid, uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function private.financial_control_central_scope_allows_item(uuid, uuid, uuid, uuid, text[]) from public, anon, authenticated;

revoke all on function private.financial_control_can_read_finding(uuid, uuid) from public, anon, authenticated;
revoke all on function private.financial_control_can_read_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.financial_control_can_work_finding(uuid, uuid) from public, anon, authenticated;
revoke all on function private.financial_control_can_work_action(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.financial_control_can_manage_finding(uuid, uuid) from public, anon, authenticated;
grant execute on function private.financial_control_can_read_finding(uuid, uuid) to authenticated;
grant execute on function private.financial_control_can_read_item(uuid, uuid, uuid) to authenticated;
grant execute on function private.financial_control_can_work_finding(uuid, uuid) to authenticated;
grant execute on function private.financial_control_can_work_action(uuid, uuid, uuid) to authenticated;
grant execute on function private.financial_control_can_manage_finding(uuid, uuid) to authenticated;

revoke all on function public.financial_control_update_action_progress(uuid, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.financial_control_add_follow_up_comment(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.financial_control_transition_action(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.financial_control_transition_finding(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.financial_control_decide_extension(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.financial_control_decide_document_reference(uuid, text, text, integer) from public, anon, authenticated;

grant execute on function public.financial_control_update_action_progress(uuid, numeric, text, integer) to authenticated;
grant execute on function public.financial_control_add_follow_up_comment(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.financial_control_transition_action(uuid, text, text, integer) to authenticated;
grant execute on function public.financial_control_transition_finding(uuid, text, text, integer) to authenticated;
grant execute on function public.financial_control_decide_extension(uuid, text, text, integer) to authenticated;
grant execute on function public.financial_control_decide_document_reference(uuid, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
