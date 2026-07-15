-- مسودة غير مطبقة (1/3): جدول المستندات المرجعية وRLS فقط.
-- تعتمد قبل التنفيذ على مراجعة مستقلة، ولا تنشئ ملفات أو Storage أو Base64.

begin;

create table if not exists public.corrective_action_document_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid not null references public.corrective_actions(id) on delete restrict,
  document_number text not null check (pg_catalog.btrim(document_number) <> ''),
  document_name text not null check (pg_catalog.btrim(document_name) <> ''),
  document_type text not null check (pg_catalog.btrim(document_type) <> ''),
  document_date date not null,
  issuing_entity text not null check (pg_catalog.btrim(issuing_entity) <> ''),
  storage_location text not null check (
    storage_location in ('share_folder', 'official_email', 'internal_system', 'other')
  ),
  location_reference text not null check (pg_catalog.btrim(location_reference) <> ''),
  description text,
  manager_verification_status text not null default 'pending' check (
    manager_verification_status in ('pending', 'approved', 'rejected')
  ),
  manager_decision_note text,
  manager_verified_by uuid references public.profiles(id) on delete restrict,
  manager_verified_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  lock_version integer not null default 1 check (lock_version > 0),
  constraint corrective_action_document_references_finding_scope_fk
    foreign key (workspace_id, finding_id)
    references public.financial_control_findings(workspace_id, id)
    on delete restrict,
  constraint corrective_action_document_references_action_scope_fk
    foreign key (workspace_id, finding_id, corrective_action_id)
    references public.corrective_actions(workspace_id, finding_id, id)
    on delete restrict,
  constraint corrective_action_document_references_manager_decision_check
    check (
      (
        manager_verification_status = 'pending'
        and manager_verified_by is null
        and manager_verified_at is null
        and manager_decision_note is null
      )
      or (
        manager_verification_status = 'approved'
        and manager_verified_by is not null
        and manager_verified_at is not null
      )
      or (
        manager_verification_status = 'rejected'
        and manager_verified_by is not null
        and manager_verified_at is not null
        and manager_decision_note is not null
        and pg_catalog.btrim(manager_decision_note) <> ''
      )
    )
);

create index if not exists corrective_action_document_references_workspace_idx
  on public.corrective_action_document_references (workspace_id);
create index if not exists corrective_action_document_references_finding_idx
  on public.corrective_action_document_references (workspace_id, finding_id);
create index if not exists corrective_action_document_references_action_idx
  on public.corrective_action_document_references (workspace_id, corrective_action_id);
create index if not exists corrective_action_document_references_manager_queue_idx
  on public.corrective_action_document_references (
    workspace_id, manager_verification_status, finding_id
  );

alter table public.corrective_action_document_references enable row level security;
alter table public.corrective_action_document_references force row level security;

drop policy if exists corrective_action_document_references_select
  on public.corrective_action_document_references;
create policy corrective_action_document_references_select
on public.corrective_action_document_references
for select
to authenticated
using (
  private.financial_control_has_role(
    public.corrective_action_document_references.workspace_id,
    array['manager']::text[]
  )
  or (
    private.financial_control_has_role(
      public.corrective_action_document_references.workspace_id,
      array['action_owner']::text[]
    )
    and exists (
      select 1
      from public.corrective_actions ca
      where ca.id = public.corrective_action_document_references.corrective_action_id
        and ca.workspace_id = public.corrective_action_document_references.workspace_id
        and ca.finding_id = public.corrective_action_document_references.finding_id
        and ca.responsible_user_id is not null
        and ca.responsible_user_id = (select auth.uid())
    )
  )
);

-- سياسات الكتابة دفاع إضافي فقط؛ لا توجد منح INSERT/DELETE مباشرة للمستخدم.
drop policy if exists corrective_action_document_references_insert_employee
  on public.corrective_action_document_references;
create policy corrective_action_document_references_insert_employee
on public.corrective_action_document_references
for insert
to authenticated
with check (
  public.corrective_action_document_references.created_by = (select auth.uid())
  and public.corrective_action_document_references.manager_verification_status = 'pending'
  and public.corrective_action_document_references.manager_decision_note is null
  and public.corrective_action_document_references.manager_verified_by is null
  and public.corrective_action_document_references.manager_verified_at is null
  and public.corrective_action_document_references.lock_version = 1
  and private.financial_control_has_role(
    public.corrective_action_document_references.workspace_id,
    array['action_owner']::text[]
  )
  and exists (
    select 1
    from public.corrective_actions ca
    join public.financial_control_findings f
      on f.id = ca.finding_id and f.workspace_id = ca.workspace_id
    where ca.id = public.corrective_action_document_references.corrective_action_id
      and ca.workspace_id = public.corrective_action_document_references.workspace_id
      and ca.finding_id = public.corrective_action_document_references.finding_id
      and ca.responsible_user_id is not null
      and ca.responsible_user_id = (select auth.uid())
      and f.workflow_status in (
        'imported_pending_review', 'not_started', 'in_progress',
        'returned_for_revision', 'reopened'
      )
  )
);

drop policy if exists corrective_action_document_references_delete_employee
  on public.corrective_action_document_references;
create policy corrective_action_document_references_delete_employee
on public.corrective_action_document_references
for delete
to authenticated
using (
  private.financial_control_has_role(
    public.corrective_action_document_references.workspace_id,
    array['action_owner']::text[]
  )
  and exists (
    select 1
    from public.corrective_actions ca
    join public.financial_control_findings f
      on f.id = ca.finding_id and f.workspace_id = ca.workspace_id
    where ca.id = public.corrective_action_document_references.corrective_action_id
      and ca.workspace_id = public.corrective_action_document_references.workspace_id
      and ca.finding_id = public.corrective_action_document_references.finding_id
      and ca.responsible_user_id is not null
      and ca.responsible_user_id = (select auth.uid())
      and f.workflow_status in (
        'imported_pending_review', 'not_started', 'in_progress',
        'returned_for_revision', 'reopened'
      )
  )
);

revoke all on table public.corrective_action_document_references from anon, authenticated;
grant select on table public.corrective_action_document_references to authenticated;

-- لا توجد سياسة UPDATE ولا منحة UPDATE مباشرة؛ كل كتابة تمر عبر RPC آمن.

commit;
