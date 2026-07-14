-- ============================================================================
-- DRAFT ONLY — FINANCIAL CONTROL SCHEMA
-- هذه المسودة غير مطبقة، ولا يجوز تشغيلها قبل اعتماد MIGRATION_REVIEW.md.
-- لا تعدل أي جدول قائم، ولا تغير قيد public.workspace_members.role.
--
-- افتراضات يجب التحقق منها قبل التطبيق:
--   public.workspaces.id    uuid
--   public.departments.id   uuid
--   public.profiles.id      uuid (مرتبط أصلًا بـ auth.users.id)
--
-- لا تنشئ هذه المسودة Storage bucket أو Storage policies أو triggers.
-- كتابة Audit Log تلقائيًا تحتاج مسار معاملات/دوال معتمد قبل التطبيق.
-- ============================================================================

begin;

create schema if not exists private;

revoke all on schema private from public;
revoke usage on schema private from anon;

-- --------------------------------------------------------------------------
-- 1. عضويات الرقابة المالية المستقلة
-- --------------------------------------------------------------------------

create table if not exists public.financial_control_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner', 'manager', 'specialist', 'action_owner', 'viewer')),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_control_members_dates_check
    check (ends_at is null or ends_at >= starts_at),
  constraint financial_control_members_unique_role
    unique (workspace_id, user_id, role)
);

create index if not exists financial_control_members_workspace_idx
  on public.financial_control_members (workspace_id);
create index if not exists financial_control_members_user_idx
  on public.financial_control_members (user_id);
create index if not exists financial_control_members_active_lookup_idx
  on public.financial_control_members (workspace_id, user_id, role)
  where is_active and ends_at is null;

-- --------------------------------------------------------------------------
-- 2. المصادر، aliases، وقواعد التصعيد
-- --------------------------------------------------------------------------

create table if not exists public.financial_control_source_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_type text not null check (document_type in ('official_report', 'functional_reference')),
  file_name text not null,
  storage_path text,
  classification text,
  issuer text,
  document_version text,
  issued_at date,
  coverage_start date,
  coverage_end date,
  checksum text,
  is_authoritative boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_control_source_documents_coverage_check
    check (coverage_end is null or coverage_start is null or coverage_end >= coverage_start),
  constraint financial_control_source_documents_unique
    unique (workspace_id, document_type, file_name, document_version)
);

create index if not exists financial_control_source_documents_workspace_idx
  on public.financial_control_source_documents (workspace_id);

create table if not exists public.financial_control_unit_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  canonical_department_id uuid references public.departments(id) on delete set null,
  canonical_name text not null,
  alias_name text not null,
  normalized_alias text not null,
  source_document_id uuid references public.financial_control_source_documents(id) on delete restrict,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financial_control_unit_aliases_unique
    unique (workspace_id, normalized_alias)
);

create index if not exists financial_control_unit_aliases_department_idx
  on public.financial_control_unit_aliases (canonical_department_id);

create table if not exists public.financial_control_escalation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  rule_version integer not null check (rule_version > 0),
  pre_due_notice_days integer not null default 7 check (pre_due_notice_days >= 0),
  manager_escalation_overdue_days integer not null default 0 check (manager_escalation_overdue_days >= 0),
  owner_escalation_overdue_days integer not null default 7 check (owner_escalation_overdue_days >= 0),
  higher_level_escalation_overdue_days integer not null default 30 check (higher_level_escalation_overdue_days >= 0),
  higher_level_target_label text,
  effective_from timestamptz not null,
  effective_to timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint financial_control_escalation_rules_dates_check
    check (effective_to is null or effective_to > effective_from),
  constraint financial_control_escalation_rules_levels_check
    check (
      manager_escalation_overdue_days <= owner_escalation_overdue_days
      and owner_escalation_overdue_days <= higher_level_escalation_overdue_days
    ),
  constraint financial_control_escalation_rules_unique
    unique (workspace_id, rule_version)
);

create unique index if not exists financial_control_escalation_rules_one_active_idx
  on public.financial_control_escalation_rules (workspace_id)
  where is_active and effective_to is null;

-- --------------------------------------------------------------------------
-- 3. الملاحظات وإصداراتها
-- --------------------------------------------------------------------------

create table if not exists public.financial_control_findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  source_document_id uuid not null references public.financial_control_source_documents(id) on delete restrict,
  sequence_no integer not null check (sequence_no > 0),
  case_code text,
  reference_code text not null,
  report_page integer not null check (report_page > 0),
  assessment_axis text,
  activity_name text,
  title text not null,
  assessment_rating text not null check (assessment_rating in ('partially_effective', 'not_exists')),
  assessment_rating_label text not null check (assessment_rating_label in ('شبه فعال', 'غير موجود')),
  control_reference text not null,
  control_summary text not null,
  official_finding_text text not null,
  official_risk_impact text not null,
  official_owner_department_id uuid references public.departments(id) on delete set null,
  official_owner_label text not null,
  imported_owner_alias text,
  official_due_date date not null,
  official_quarter text not null,
  source_image_page integer,
  source_image_ref text,
  workflow_status text not null default 'imported_pending_review'
    check (workflow_status in (
      'imported_pending_review',
      'not_started',
      'in_progress',
      'awaiting_action_owner',
      'submitted_for_manager_review',
      'under_manager_review',
      'returned_for_revision',
      'approved',
      'closed',
      'reopened'
    )),
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  current_due_date date not null,
  latest_update_summary text,
  last_activity_at timestamptz,
  approved_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  official_content_version integer not null default 1 check (official_content_version > 0),
  lock_version integer not null default 1 check (lock_version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint financial_control_findings_reference_unique
    unique (workspace_id, source_document_id, reference_code),
  constraint financial_control_findings_sequence_unique
    unique (workspace_id, source_document_id, sequence_no),
  constraint financial_control_findings_case_unique
    unique nulls not distinct (workspace_id, case_code),
  constraint financial_control_findings_due_check
    check (current_due_date >= official_due_date or current_due_date = official_due_date),
  constraint financial_control_findings_closed_check
    check (workflow_status <> 'closed' or (progress_percent = 100 and closed_at is not null))
);

create index if not exists financial_control_findings_workspace_idx
  on public.financial_control_findings (workspace_id);
create index if not exists financial_control_findings_status_idx
  on public.financial_control_findings (workspace_id, workflow_status);
create index if not exists financial_control_findings_due_idx
  on public.financial_control_findings (workspace_id, current_due_date);
create index if not exists financial_control_findings_owner_department_idx
  on public.financial_control_findings (official_owner_department_id);

create table if not exists public.financial_control_finding_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  source_document_id uuid not null references public.financial_control_source_documents(id) on delete restrict,
  version_no integer not null check (version_no > 0),
  reference_code text not null,
  report_page integer not null check (report_page > 0),
  title text not null,
  assessment_rating text not null check (assessment_rating in ('partially_effective', 'not_exists')),
  assessment_rating_label text not null,
  control_reference text not null,
  control_summary text not null,
  official_finding_text text not null,
  official_risk_impact text not null,
  official_owner_label text not null,
  official_due_date date not null,
  official_quarter text not null,
  change_reason text not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint financial_control_finding_versions_unique
    unique (finding_id, version_no)
);

create index if not exists financial_control_finding_versions_workspace_idx
  on public.financial_control_finding_versions (workspace_id);

-- --------------------------------------------------------------------------
-- 4. الإجراءات والإسنادات
-- --------------------------------------------------------------------------

create table if not exists public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  action_no integer not null check (action_no > 0),
  official_action_text text not null,
  execution_details text,
  responsible_department_id uuid references public.departments(id) on delete set null,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  official_due_date date not null,
  current_due_date date not null,
  workflow_status text not null default 'not_started'
    check (workflow_status in (
      'not_started',
      'in_progress',
      'blocked',
      'submitted_for_specialist_review',
      'under_specialist_review',
      'returned_for_revision',
      'specialist_verified',
      'completed'
    )),
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  completion_summary text,
  completed_at timestamptz,
  version_no integer not null default 1 check (version_no > 0),
  lock_version integer not null default 1 check (lock_version > 0),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corrective_actions_unique unique (finding_id, action_no),
  constraint corrective_actions_due_check check (current_due_date >= official_due_date),
  constraint corrective_actions_completed_check
    check (workflow_status <> 'completed' or (progress_percent = 100 and completed_at is not null))
);

create index if not exists corrective_actions_workspace_idx
  on public.corrective_actions (workspace_id);
create index if not exists corrective_actions_finding_idx
  on public.corrective_actions (finding_id);
create index if not exists corrective_actions_responsible_user_idx
  on public.corrective_actions (workspace_id, responsible_user_id);
create index if not exists corrective_actions_status_due_idx
  on public.corrective_actions (workspace_id, workflow_status, current_due_date);

create table if not exists public.finding_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  department_id uuid references public.departments(id) on delete set null,
  assignment_role text not null check (assignment_role in ('specialist', 'action_owner')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_primary boolean not null default false,
  assigned_by uuid references public.profiles(id) on delete set null,
  assignment_reason text,
  created_at timestamptz not null default now(),
  constraint finding_assignments_dates_check check (ends_at is null or ends_at >= starts_at),
  constraint finding_assignments_action_owner_check check (
    assignment_role <> 'action_owner' or corrective_action_id is not null
  )
);

create index if not exists finding_assignments_workspace_idx
  on public.finding_assignments (workspace_id);
create index if not exists finding_assignments_finding_idx
  on public.finding_assignments (finding_id);
create index if not exists finding_assignments_user_idx
  on public.finding_assignments (workspace_id, user_id, assignment_role);
create unique index if not exists finding_assignments_one_primary_specialist_idx
  on public.finding_assignments (finding_id)
  where assignment_role = 'specialist' and is_primary and ends_at is null;
create unique index if not exists finding_assignments_one_primary_action_owner_idx
  on public.finding_assignments (corrective_action_id)
  where assignment_role = 'action_owner' and is_primary and ends_at is null;

-- --------------------------------------------------------------------------
-- 5. التعليقات والمراسلات والمرفقات metadata فقط
-- --------------------------------------------------------------------------

create table if not exists public.finding_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  parent_comment_id uuid references public.finding_comments(id) on delete restrict,
  comment_type text not null check (comment_type in ('internal', 'execution_update', 'return_reason', 'approval_note')),
  visibility text not null default 'workspace' check (visibility in ('workspace', 'action_participants', 'managers')),
  body text not null,
  author_user_id uuid references public.profiles(id) on delete set null,
  supersedes_comment_id uuid references public.finding_comments(id) on delete restrict,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists finding_comments_finding_idx
  on public.finding_comments (workspace_id, finding_id, created_at desc);

create table if not exists public.finding_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  parent_message_id uuid references public.finding_messages(id) on delete restrict,
  message_type text not null check (message_type in ('sent_email', 'department_reply', 'internal_message', 'reminder')),
  direction text not null check (direction in ('outbound', 'inbound', 'internal')),
  channel text not null default 'manual_log',
  sent_at timestamptz not null,
  sender_user_id uuid references public.profiles(id) on delete set null,
  sender_label text,
  to_recipients jsonb not null default '[]'::jsonb,
  cc_recipients jsonb not null default '[]'::jsonb,
  subject text,
  body text not null,
  external_message_id text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists finding_messages_finding_idx
  on public.finding_messages (workspace_id, finding_id, sent_at desc);
create index if not exists finding_messages_external_id_idx
  on public.finding_messages (external_message_id)
  where external_message_id is not null;

create table if not exists public.finding_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  comment_id uuid references public.finding_comments(id) on delete restrict,
  message_id uuid references public.finding_messages(id) on delete restrict,
  extension_request_id uuid,
  attachment_kind text not null check (attachment_kind in ('evidence', 'message', 'source_page', 'extension_support')),
  evidence_description text,
  storage_bucket text not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  checksum text not null,
  version_no integer not null default 1 check (version_no > 0),
  review_status text not null default 'pending' check (review_status in ('pending', 'accepted', 'rejected', 'superseded')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  supersedes_attachment_id uuid references public.finding_attachments(id) on delete restrict,
  archived_at timestamptz,
  constraint finding_attachments_storage_unique unique (storage_bucket, storage_path),
  constraint finding_attachments_evidence_action_check check (
    attachment_kind <> 'evidence' or corrective_action_id is not null
  ),
  constraint finding_attachments_extension_scope_check check (
    extension_request_id is null or corrective_action_id is not null
  )
);

create index if not exists finding_attachments_finding_idx
  on public.finding_attachments (workspace_id, finding_id);
create index if not exists finding_attachments_action_idx
  on public.finding_attachments (corrective_action_id);
create index if not exists finding_attachments_review_idx
  on public.finding_attachments (workspace_id, review_status);

-- --------------------------------------------------------------------------
-- 6. سجلات الحالات، التمديد، التصعيد، والاعتمادات
-- --------------------------------------------------------------------------

create table if not exists public.finding_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  from_status text,
  to_status text not null,
  transition_code text not null,
  reason text,
  progress_before numeric(5,2),
  progress_after numeric(5,2),
  due_date_before date,
  due_date_after date,
  snapshot_version integer,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid()
);

create index if not exists finding_status_history_finding_idx
  on public.finding_status_history (workspace_id, finding_id, changed_at desc);

create table if not exists public.corrective_action_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid not null references public.corrective_actions(id) on delete restrict,
  from_status text,
  to_status text not null,
  progress_before numeric(5,2),
  progress_after numeric(5,2),
  due_date_before date,
  due_date_after date,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  correlation_id uuid not null default gen_random_uuid()
);

create index if not exists corrective_action_status_history_action_idx
  on public.corrective_action_status_history (workspace_id, corrective_action_id, changed_at desc);

create table if not exists public.extension_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid not null references public.corrective_actions(id) on delete restrict,
  request_no integer not null check (request_no > 0),
  current_due_date date not null,
  requested_due_date date not null,
  reason text not null,
  mitigation_plan text not null,
  status_code text not null default 'draft' check (status_code in ('draft', 'submitted', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  approved_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extension_requests_due_check check (requested_due_date > current_due_date),
  constraint extension_requests_unique unique (corrective_action_id, request_no),
  constraint extension_requests_decision_check check (
    (status_code in ('draft', 'submitted', 'withdrawn') and decided_at is null)
    or (status_code in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
  )
);

create index if not exists extension_requests_workspace_status_idx
  on public.extension_requests (workspace_id, status_code);

alter table public.finding_attachments drop constraint if exists finding_attachments_extension_request_fk;
alter table public.finding_attachments
  add constraint finding_attachments_extension_request_fk
  foreign key (extension_request_id) references public.extension_requests(id) on delete restrict;

create table if not exists public.escalations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  extension_request_id uuid references public.extension_requests(id) on delete restrict,
  escalation_rule_id uuid not null references public.financial_control_escalation_rules(id) on delete restrict,
  level_code text not null check (level_code in ('pre_due_notice', 'manager', 'owner', 'higher_level')),
  trigger_type text not null check (trigger_type in ('automatic', 'manual')),
  overdue_days_at_trigger integer not null,
  reason text not null,
  required_action text,
  status_code text not null default 'open' check (status_code in ('scheduled', 'open', 'acknowledged', 'resolved', 'cancelled')),
  escalated_to_user_id uuid references public.profiles(id) on delete set null,
  escalated_to_department_id uuid references public.departments(id) on delete set null,
  triggered_by uuid references public.profiles(id) on delete set null,
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  response_due_at timestamptz,
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  parent_escalation_id uuid references public.escalations(id) on delete restrict,
  constraint escalations_extension_scope_check check (
    extension_request_id is null or corrective_action_id is not null
  )
);

create index if not exists escalations_workspace_status_idx
  on public.escalations (workspace_id, status_code, level_code);
create index if not exists escalations_finding_idx
  on public.escalations (finding_id, triggered_at desc);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  finding_id uuid not null references public.financial_control_findings(id) on delete restrict,
  corrective_action_id uuid references public.corrective_actions(id) on delete restrict,
  extension_request_id uuid references public.extension_requests(id) on delete restrict,
  approval_type text not null check (approval_type in ('review', 'approval', 'closure', 'extension')),
  stage_no integer not null default 1 check (stage_no > 0),
  status_code text not null default 'pending' check (status_code in ('pending', 'approved', 'rejected', 'returned', 'cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  assigned_manager_id uuid not null references public.profiles(id) on delete restrict,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  submitted_snapshot jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  constraint approvals_extension_scope_check check (
    approval_type <> 'extension'
    or (extension_request_id is not null and corrective_action_id is not null)
  ),
  constraint approvals_decision_check check (
    (status_code = 'pending' and decided_at is null)
    or (status_code <> 'pending' and decided_by is not null and decided_at is not null)
  )
);

create index if not exists approvals_workspace_status_idx
  on public.approvals (workspace_id, status_code, approval_type);
create index if not exists approvals_finding_idx
  on public.approvals (finding_id, requested_at desc);

-- سجل التدقيق المركزي هو public.audit_logs القائم، ولا تعدله هذه المسودة.
-- ستكتب RPCs الانتقال الذرية فيه بعد اعتماد أعمدته الفعلية؛ لا ينشأ سجل مكرر.

-- --------------------------------------------------------------------------
-- 7A. قيود اتساق Workspace المركبة
-- تمنع ربط سجل في Workspace بملاحظة/إجراء من Workspace آخر.
-- --------------------------------------------------------------------------

alter table public.financial_control_source_documents drop constraint if exists financial_control_source_documents_workspace_id_unique;
alter table public.financial_control_source_documents
  add constraint financial_control_source_documents_workspace_id_unique
  unique (workspace_id, id);

alter table public.financial_control_findings drop constraint if exists financial_control_findings_workspace_id_unique;
alter table public.financial_control_findings
  add constraint financial_control_findings_workspace_id_unique
  unique (workspace_id, id);

alter table public.corrective_actions drop constraint if exists corrective_actions_workspace_finding_id_unique;
alter table public.corrective_actions
  add constraint corrective_actions_workspace_finding_id_unique
  unique (workspace_id, finding_id, id);

alter table public.financial_control_escalation_rules drop constraint if exists financial_control_escalation_rules_workspace_id_unique;
alter table public.financial_control_escalation_rules
  add constraint financial_control_escalation_rules_workspace_id_unique
  unique (workspace_id, id);

alter table public.extension_requests drop constraint if exists extension_requests_workspace_action_id_unique;
alter table public.extension_requests
  add constraint extension_requests_workspace_action_id_unique
  unique (workspace_id, finding_id, corrective_action_id, id);

alter table public.financial_control_unit_aliases drop constraint if exists financial_control_unit_aliases_source_workspace_fk;
alter table public.financial_control_unit_aliases
  add constraint financial_control_unit_aliases_source_workspace_fk
  foreign key (workspace_id, source_document_id)
  references public.financial_control_source_documents(workspace_id, id)
  on delete restrict;

alter table public.financial_control_findings drop constraint if exists financial_control_findings_source_workspace_fk;
alter table public.financial_control_findings
  add constraint financial_control_findings_source_workspace_fk
  foreign key (workspace_id, source_document_id)
  references public.financial_control_source_documents(workspace_id, id)
  on delete restrict;

alter table public.financial_control_finding_versions drop constraint if exists financial_control_finding_versions_finding_workspace_fk;
alter table public.financial_control_finding_versions
  add constraint financial_control_finding_versions_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.financial_control_finding_versions drop constraint if exists financial_control_finding_versions_source_workspace_fk;
alter table public.financial_control_finding_versions
  add constraint financial_control_finding_versions_source_workspace_fk
  foreign key (workspace_id, source_document_id)
  references public.financial_control_source_documents(workspace_id, id)
  on delete restrict;

alter table public.corrective_actions drop constraint if exists corrective_actions_finding_workspace_fk;
alter table public.corrective_actions
  add constraint corrective_actions_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.finding_assignments drop constraint if exists finding_assignments_finding_workspace_fk;
alter table public.finding_assignments
  add constraint finding_assignments_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.finding_assignments drop constraint if exists finding_assignments_action_scope_fk;
alter table public.finding_assignments
  add constraint finding_assignments_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.finding_comments drop constraint if exists finding_comments_finding_workspace_fk;
alter table public.finding_comments
  add constraint finding_comments_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.finding_comments drop constraint if exists finding_comments_action_scope_fk;
alter table public.finding_comments
  add constraint finding_comments_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.finding_messages drop constraint if exists finding_messages_finding_workspace_fk;
alter table public.finding_messages
  add constraint finding_messages_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.finding_messages drop constraint if exists finding_messages_action_scope_fk;
alter table public.finding_messages
  add constraint finding_messages_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.finding_attachments drop constraint if exists finding_attachments_finding_workspace_fk;
alter table public.finding_attachments
  add constraint finding_attachments_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.finding_attachments drop constraint if exists finding_attachments_action_scope_fk;
alter table public.finding_attachments
  add constraint finding_attachments_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.finding_attachments drop constraint if exists finding_attachments_extension_scope_fk;
alter table public.finding_attachments
  add constraint finding_attachments_extension_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id, extension_request_id)
  references public.extension_requests(workspace_id, finding_id, corrective_action_id, id)
  on delete restrict;

alter table public.finding_status_history drop constraint if exists finding_status_history_finding_workspace_fk;
alter table public.finding_status_history
  add constraint finding_status_history_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.corrective_action_status_history drop constraint if exists corrective_action_status_history_action_scope_fk;
alter table public.corrective_action_status_history
  add constraint corrective_action_status_history_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.extension_requests drop constraint if exists extension_requests_action_scope_fk;
alter table public.extension_requests
  add constraint extension_requests_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.escalations drop constraint if exists escalations_finding_workspace_fk;
alter table public.escalations
  add constraint escalations_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.escalations drop constraint if exists escalations_action_scope_fk;
alter table public.escalations
  add constraint escalations_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.escalations drop constraint if exists escalations_extension_scope_fk;
alter table public.escalations
  add constraint escalations_extension_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id, extension_request_id)
  references public.extension_requests(workspace_id, finding_id, corrective_action_id, id)
  on delete restrict;

alter table public.escalations drop constraint if exists escalations_rule_workspace_fk;
alter table public.escalations
  add constraint escalations_rule_workspace_fk
  foreign key (workspace_id, escalation_rule_id)
  references public.financial_control_escalation_rules(workspace_id, id)
  on delete restrict;

alter table public.approvals drop constraint if exists approvals_finding_workspace_fk;
alter table public.approvals
  add constraint approvals_finding_workspace_fk
  foreign key (workspace_id, finding_id)
  references public.financial_control_findings(workspace_id, id)
  on delete restrict;

alter table public.approvals drop constraint if exists approvals_action_scope_fk;
alter table public.approvals
  add constraint approvals_action_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id)
  references public.corrective_actions(workspace_id, finding_id, id)
  on delete restrict;

alter table public.approvals drop constraint if exists approvals_extension_scope_fk;
alter table public.approvals
  add constraint approvals_extension_scope_fk
  foreign key (workspace_id, finding_id, corrective_action_id, extension_request_id)
  references public.extension_requests(workspace_id, finding_id, corrective_action_id, id)
  on delete restrict;

-- --------------------------------------------------------------------------
-- 8. دوال RLS المساعدة
-- SECURITY DEFINER هنا موثق ومحدود بإرجاع boolean فقط، داخل schema غير معروض.
-- يجب مراجعة مالك الدوال وsearch_path وEXECUTE قبل التطبيق.
-- --------------------------------------------------------------------------

create or replace function public.financial_control_has_role(
  p_workspace_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.financial_control_members m
      where m.workspace_id = p_workspace_id
        and m.user_id = (select auth.uid())
        and m.role = any (p_roles)
        and m.is_active
        and (m.ends_at is null or m.ends_at > now())
    );
$$;

create or replace function public.financial_control_can_read_finding(
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
    public.financial_control_has_role(
      p_workspace_id,
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or (
      public.financial_control_has_role(
        p_workspace_id,
        array['action_owner']::text[]
      )
      and exists (
        select 1
        from public.corrective_actions ca
        where ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
      )
    );
$$;

create or replace function public.financial_control_user_has_role(
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
    from public.financial_control_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role = any (p_roles)
      and m.is_active
      and (m.ends_at is null or m.ends_at > now())
  );
$$;

create or replace function public.financial_control_can_read_item(
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
    public.financial_control_has_role(
      p_workspace_id,
      array['owner', 'manager', 'specialist', 'viewer']::text[]
    )
    or (
      p_corrective_action_id is not null
      and public.financial_control_has_role(
        p_workspace_id,
        array['action_owner']::text[]
      )
      and exists (
        select 1
        from public.corrective_actions ca
        where ca.id = p_corrective_action_id
          and ca.workspace_id = p_workspace_id
          and ca.finding_id = p_finding_id
          and ca.responsible_user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.financial_control_has_role(uuid, text[]) from public;
revoke all on function public.financial_control_user_has_role(uuid, uuid, text[]) from public;
revoke all on function public.financial_control_can_read_finding(uuid, uuid) from public;
revoke all on function public.financial_control_can_read_item(uuid, uuid, uuid) from public;
revoke execute on function public.financial_control_has_role(uuid, text[]) from anon;
revoke execute on function public.financial_control_user_has_role(uuid, uuid, text[]) from anon;
revoke execute on function public.financial_control_can_read_finding(uuid, uuid) from anon;
revoke execute on function public.financial_control_can_read_item(uuid, uuid, uuid) from anon;
grant execute on function public.financial_control_has_role(uuid, text[]) to authenticated;
grant execute on function public.financial_control_user_has_role(uuid, uuid, text[]) to authenticated;
grant execute on function public.financial_control_can_read_finding(uuid, uuid) to authenticated;
grant execute on function public.financial_control_can_read_item(uuid, uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- 8A. انتقالات الحالة الذرية
-- الدوال الداخلية غير معروضة عبر Data API، وتنفذ التحقق والتحديث والتاريخ
-- والتدقيق كوحدة واحدة. أي EXCEPTION يلغي الاستدعاء كاملًا.
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
      and public.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'not_started' and p_to_status = 'in_progress'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'in_progress' and p_to_status = 'awaiting_action_owner'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'awaiting_action_owner' and p_to_status = 'in_progress'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status in ('in_progress','returned_for_revision') and p_to_status = 'submitted_for_manager_review'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'reopened' and p_to_status = 'in_progress'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist','manager']::text[]))
    or (v_old.workflow_status = 'submitted_for_manager_review' and p_to_status = 'under_manager_review'
      and public.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'under_manager_review' and p_to_status in ('returned_for_revision','approved')
      and public.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'approved' and p_to_status = 'closed'
      and public.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
    or (v_old.workflow_status = 'closed' and p_to_status = 'reopened'
      and public.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
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
        public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[])
        or (v_old.responsible_user_id = v_actor
          and public.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
      ))
    or (v_old.workflow_status in ('in_progress','blocked') and p_to_status in ('blocked','in_progress')
      and v_old.workflow_status <> p_to_status
      and (
        public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[])
        or (v_old.responsible_user_id = v_actor
          and public.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
      ))
    or (v_old.workflow_status in ('in_progress','returned_for_revision') and p_to_status = 'submitted_for_specialist_review'
      and v_old.responsible_user_id = v_actor
      and public.financial_control_has_role(v_old.workspace_id, array['action_owner']::text[]))
    or (v_old.workflow_status = 'submitted_for_specialist_review' and p_to_status = 'under_specialist_review'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'under_specialist_review' and p_to_status in ('returned_for_revision','specialist_verified')
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'specialist_verified' and p_to_status = 'completed'
      and public.financial_control_has_role(v_old.workspace_id, array['specialist']::text[]))
    or (v_old.workflow_status = 'completed' and p_to_status = 'in_progress'
      and public.financial_control_has_role(v_old.workspace_id, array['manager']::text[]))
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

  if not public.financial_control_has_role(v_request_old.workspace_id, array['manager']::text[]) then
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

-- Wrappers عامة SECURITY DEFINER: هي نقطة التنفيذ الوحيدة الممنوحة للمستخدم.
-- تعيد التحقق من الجلسة وWorkspace والعضوية قبل استدعاء private.
create or replace function public.financial_control_transition_finding(
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
  v_workspace_id uuid;
  v_roles text[];
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select f.workspace_id into v_workspace_id
  from public.financial_control_findings f
  where f.id = p_finding_id;

  if v_workspace_id is null then
    raise exception 'Financial-control finding was not found.' using errcode = 'P0002';
  end if;

  select pg_catalog.array_agg(m.role order by m.role) into v_roles
  from public.financial_control_members m
  where m.workspace_id = v_workspace_id
    and m.user_id = v_actor
    and m.is_active
    and (m.ends_at is null or m.ends_at > pg_catalog.now());

  if v_roles is null then
    raise exception 'An active financial-control membership is required.' using errcode = '42501';
  end if;

  return private.financial_control_transition_finding_tx(
    p_finding_id, p_to_status, p_reason, p_expected_lock_version
  );
end;
$$;

create or replace function public.financial_control_transition_action(
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
  v_workspace_id uuid;
  v_roles text[];
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select ca.workspace_id into v_workspace_id
  from public.corrective_actions ca
  where ca.id = p_corrective_action_id;

  if v_workspace_id is null then
    raise exception 'Corrective action was not found.' using errcode = 'P0002';
  end if;

  select pg_catalog.array_agg(m.role order by m.role) into v_roles
  from public.financial_control_members m
  where m.workspace_id = v_workspace_id
    and m.user_id = v_actor
    and m.is_active
    and (m.ends_at is null or m.ends_at > pg_catalog.now());

  if v_roles is null then
    raise exception 'An active financial-control membership is required.' using errcode = '42501';
  end if;

  return private.financial_control_transition_action_tx(
    p_corrective_action_id, p_to_status, p_reason, p_expected_lock_version
  );
end;
$$;

create or replace function public.financial_control_decide_extension(
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
  v_workspace_id uuid;
  v_roles text[];
begin
  if v_actor is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select er.workspace_id into v_workspace_id
  from public.extension_requests er
  where er.id = p_extension_request_id;

  if v_workspace_id is null then
    raise exception 'Extension request was not found.' using errcode = 'P0002';
  end if;

  select pg_catalog.array_agg(m.role order by m.role) into v_roles
  from public.financial_control_members m
  where m.workspace_id = v_workspace_id
    and m.user_id = v_actor
    and m.is_active
    and (m.ends_at is null or m.ends_at > pg_catalog.now());

  if v_roles is null then
    raise exception 'An active financial-control membership is required.' using errcode = '42501';
  end if;

  return private.financial_control_decide_extension_tx(
    p_extension_request_id, p_decision, p_decision_note,
    p_expected_action_lock_version
  );
end;
$$;

revoke all on function private.financial_control_transition_finding_tx(uuid, text, text, integer) from public;
revoke all on function private.financial_control_transition_action_tx(uuid, text, text, integer) from public;
revoke all on function private.financial_control_decide_extension_tx(uuid, text, text, integer) from public;
revoke execute on function private.financial_control_transition_finding_tx(uuid, text, text, integer) from anon, authenticated;
revoke execute on function private.financial_control_transition_action_tx(uuid, text, text, integer) from anon, authenticated;
revoke execute on function private.financial_control_decide_extension_tx(uuid, text, text, integer) from anon, authenticated;

revoke all on function public.financial_control_transition_finding(uuid, text, text, integer) from public;
revoke all on function public.financial_control_transition_action(uuid, text, text, integer) from public;
revoke all on function public.financial_control_decide_extension(uuid, text, text, integer) from public;
revoke execute on function public.financial_control_transition_finding(uuid, text, text, integer) from anon;
revoke execute on function public.financial_control_transition_action(uuid, text, text, integer) from anon;
revoke execute on function public.financial_control_decide_extension(uuid, text, text, integer) from anon;
grant execute on function public.financial_control_transition_finding(uuid, text, text, integer) to authenticated;
grant execute on function public.financial_control_transition_action(uuid, text, text, integer) to authenticated;
grant execute on function public.financial_control_decide_extension(uuid, text, text, integer) to authenticated;

-- --------------------------------------------------------------------------
-- 9. RLS لكل الجداول
-- --------------------------------------------------------------------------

alter table public.financial_control_members enable row level security;
alter table public.financial_control_source_documents enable row level security;
alter table public.financial_control_unit_aliases enable row level security;
alter table public.financial_control_escalation_rules enable row level security;
alter table public.financial_control_findings enable row level security;
alter table public.financial_control_finding_versions enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.finding_assignments enable row level security;
alter table public.finding_comments enable row level security;
alter table public.finding_messages enable row level security;
alter table public.finding_attachments enable row level security;
alter table public.finding_status_history enable row level security;
alter table public.corrective_action_status_history enable row level security;
alter table public.extension_requests enable row level security;
alter table public.escalations enable row level security;
alter table public.approvals enable row level security;

alter table public.financial_control_members force row level security;
alter table public.financial_control_source_documents force row level security;
alter table public.financial_control_unit_aliases force row level security;
alter table public.financial_control_escalation_rules force row level security;
alter table public.financial_control_findings force row level security;
alter table public.financial_control_finding_versions force row level security;
alter table public.corrective_actions force row level security;
alter table public.finding_assignments force row level security;
alter table public.finding_comments force row level security;
alter table public.finding_messages force row level security;
alter table public.finding_attachments force row level security;
alter table public.finding_status_history force row level security;
alter table public.corrective_action_status_history force row level security;
alter table public.extension_requests force row level security;
alter table public.escalations force row level security;
alter table public.approvals force row level security;

-- إعادة تشغيل المسودة تعيد إنشاء سياساتها هي فقط؛ لا تلمس سياسات الجداول القائمة.
drop policy if exists financial_control_members_select on public.financial_control_members;
drop policy if exists financial_control_members_insert_owner on public.financial_control_members;
drop policy if exists financial_control_members_update_owner on public.financial_control_members;
drop policy if exists financial_control_source_documents_select on public.financial_control_source_documents;
drop policy if exists financial_control_unit_aliases_select on public.financial_control_unit_aliases;
drop policy if exists financial_control_escalation_rules_select on public.financial_control_escalation_rules;
drop policy if exists financial_control_findings_select on public.financial_control_findings;
drop policy if exists financial_control_findings_update_operational on public.financial_control_findings;
drop policy if exists financial_control_finding_versions_select on public.financial_control_finding_versions;
drop policy if exists corrective_actions_select on public.corrective_actions;
drop policy if exists corrective_actions_insert_manager on public.corrective_actions;
drop policy if exists corrective_actions_update on public.corrective_actions;
drop policy if exists finding_assignments_select on public.finding_assignments;
drop policy if exists finding_assignments_insert_manager on public.finding_assignments;
drop policy if exists finding_assignments_update_manager on public.finding_assignments;
drop policy if exists finding_comments_select on public.finding_comments;
drop policy if exists finding_comments_insert on public.finding_comments;
drop policy if exists finding_messages_select on public.finding_messages;
drop policy if exists finding_messages_insert on public.finding_messages;
drop policy if exists finding_attachments_select on public.finding_attachments;
drop policy if exists finding_attachments_insert on public.finding_attachments;
drop policy if exists finding_attachments_review_update on public.finding_attachments;
drop policy if exists finding_status_history_select on public.finding_status_history;
drop policy if exists corrective_action_status_history_select on public.corrective_action_status_history;
drop policy if exists extension_requests_select on public.extension_requests;
drop policy if exists extension_requests_insert on public.extension_requests;
drop policy if exists extension_requests_update_manager on public.extension_requests;
drop policy if exists escalations_select on public.escalations;
drop policy if exists escalations_insert_manager_owner on public.escalations;
drop policy if exists escalations_update_manager_owner on public.escalations;
drop policy if exists approvals_select on public.approvals;
drop policy if exists approvals_insert on public.approvals;
drop policy if exists approvals_update_manager on public.approvals;

-- العضويات: المستخدم يرى عضويته، والمدير/المالك يرى أعضاء المساحة.
create policy financial_control_members_select
on public.financial_control_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.financial_control_has_role(workspace_id, array['owner', 'manager']::text[])
);

create policy financial_control_members_insert_owner
on public.financial_control_members for insert to authenticated
with check (
  public.financial_control_has_role(workspace_id, array['owner']::text[])
);

create policy financial_control_members_update_owner
on public.financial_control_members for update to authenticated
using (public.financial_control_has_role(workspace_id, array['owner']::text[]))
with check (public.financial_control_has_role(workspace_id, array['owner']::text[]));

-- مصادر ووحدات وقواعد: قراءة أعضاء المساحة فقط؛ الكتابة الإدارية عبر مسار موثوق.
create policy financial_control_source_documents_select
on public.financial_control_source_documents for select to authenticated
using (public.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

create policy financial_control_unit_aliases_select
on public.financial_control_unit_aliases for select to authenticated
using (public.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

create policy financial_control_escalation_rules_select
on public.financial_control_escalation_rules for select to authenticated
using (public.financial_control_has_role(workspace_id, array['owner','manager','specialist','action_owner','viewer']::text[]));

-- الملاحظات وإصداراتها.
create policy financial_control_findings_select
on public.financial_control_findings for select to authenticated
using (public.financial_control_can_read_finding(workspace_id, id));

create policy financial_control_findings_update_operational
on public.financial_control_findings for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager','specialist']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager','specialist']::text[]));

create policy financial_control_finding_versions_select
on public.financial_control_finding_versions for select to authenticated
using (public.financial_control_can_read_finding(workspace_id, finding_id));

-- الإجراءات.
create policy corrective_actions_select
on public.corrective_actions for select to authenticated
using (
  public.financial_control_has_role(workspace_id, array['owner','manager','specialist','viewer']::text[])
  or (
    public.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
);

create policy corrective_actions_insert_manager
on public.corrective_actions for insert to authenticated
with check (public.financial_control_has_role(workspace_id, array['manager']::text[]));

create policy corrective_actions_update
on public.corrective_actions for update to authenticated
using (
  public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  or (
    public.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
)
with check (
  public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  or (
    public.financial_control_has_role(workspace_id, array['action_owner']::text[])
    and responsible_user_id = (select auth.uid())
  )
);

-- الإسنادات.
create policy finding_assignments_select
on public.finding_assignments for select to authenticated
using (
  public.financial_control_has_role(workspace_id, array['owner','manager','specialist','viewer']::text[])
  or user_id = (select auth.uid())
);

create policy finding_assignments_insert_manager
on public.finding_assignments for insert to authenticated
with check (public.financial_control_has_role(workspace_id, array['manager']::text[]));

create policy finding_assignments_update_manager
on public.finding_assignments for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager']::text[]));

-- التعليقات والمراسلات.
create policy finding_comments_select
on public.finding_comments for select to authenticated
using (public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

create policy finding_comments_insert
on public.finding_comments for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (
    public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      public.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

create policy finding_messages_select
on public.finding_messages for select to authenticated
using (public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

create policy finding_messages_insert
on public.finding_messages for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and (
    public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      public.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

-- Metadata المرفقات فقط. لا توجد DELETE policy.
create policy finding_attachments_select
on public.finding_attachments for select to authenticated
using (public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

create policy finding_attachments_insert
on public.finding_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and review_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and archived_at is null
  and (
    public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      public.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

create policy finding_attachments_review_update
on public.finding_attachments for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager','specialist']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager','specialist']::text[]));

-- السجلات التاريخية: قراءة فقط من Data API؛ لا INSERT/UPDATE/DELETE policy.
create policy finding_status_history_select
on public.finding_status_history for select to authenticated
using (public.financial_control_can_read_finding(workspace_id, finding_id));

create policy corrective_action_status_history_select
on public.corrective_action_status_history for select to authenticated
using (public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

-- التمديد.
create policy extension_requests_select
on public.extension_requests for select to authenticated
using (public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id));

create policy extension_requests_insert
on public.extension_requests for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and status_code in ('draft', 'submitted')
  and decided_by is null
  and decided_at is null
  and approved_due_date is null
  and (
    public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
    or (
      public.financial_control_has_role(workspace_id, array['action_owner']::text[])
      and public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)
    )
  )
);

create policy extension_requests_update_manager
on public.extension_requests for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager']::text[]));

-- التصعيد.
create policy escalations_select
on public.escalations for select to authenticated
using (public.financial_control_can_read_finding(workspace_id, finding_id));

create policy escalations_insert_manager_owner
on public.escalations for insert to authenticated
with check (public.financial_control_has_role(workspace_id, array['manager','owner']::text[]));

create policy escalations_update_manager_owner
on public.escalations for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager','owner']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager','owner']::text[]));

-- الاعتمادات: القرار للمدير فقط.
create policy approvals_select
on public.approvals for select to authenticated
using (public.financial_control_can_read_finding(workspace_id, finding_id));

create policy approvals_insert
on public.approvals for insert to authenticated
with check (
  public.financial_control_has_role(workspace_id, array['manager','specialist']::text[])
  and status_code = 'pending'
  and decided_by is null
  and decided_at is null
  and public.financial_control_user_has_role(
    workspace_id,
    assigned_manager_id,
    array['manager']::text[]
  )
);

create policy approvals_update_manager
on public.approvals for update to authenticated
using (public.financial_control_has_role(workspace_id, array['manager']::text[]))
with check (public.financial_control_has_role(workspace_id, array['manager']::text[]));

-- --------------------------------------------------------------------------
-- 10. Grants — RLS لا يغني عن صلاحيات الجداول.
-- لا تمنح أي صلاحية إلى anon.
-- --------------------------------------------------------------------------

revoke all on table
  public.financial_control_members,
  public.financial_control_source_documents,
  public.financial_control_unit_aliases,
  public.financial_control_escalation_rules,
  public.financial_control_findings,
  public.financial_control_finding_versions,
  public.corrective_actions,
  public.finding_assignments,
  public.finding_comments,
  public.finding_messages,
  public.finding_attachments,
  public.finding_status_history,
  public.corrective_action_status_history,
  public.extension_requests,
  public.escalations,
  public.approvals
from anon, authenticated;

grant select on table
  public.financial_control_members,
  public.financial_control_source_documents,
  public.financial_control_unit_aliases,
  public.financial_control_escalation_rules,
  public.financial_control_findings,
  public.financial_control_finding_versions,
  public.corrective_actions,
  public.finding_assignments,
  public.finding_comments,
  public.finding_messages,
  public.finding_attachments,
  public.finding_status_history,
  public.corrective_action_status_history,
  public.extension_requests,
  public.escalations,
  public.approvals
to authenticated;

grant insert on public.financial_control_members to authenticated;
grant update (role, is_active, starts_at, ends_at, updated_at)
  on public.financial_control_members to authenticated;

grant update (
  progress_percent,
  latest_update_summary,
  last_activity_at,
  updated_by,
  updated_at,
  lock_version
) on public.financial_control_findings to authenticated;

grant insert on public.corrective_actions to authenticated;
grant update (
  execution_details,
  responsible_department_id,
  responsible_user_id,
  progress_percent,
  completion_summary,
  updated_by,
  updated_at,
  lock_version
) on public.corrective_actions to authenticated;

grant insert on public.finding_assignments to authenticated;
grant update (ends_at, is_primary, assignment_reason)
  on public.finding_assignments to authenticated;

grant insert on public.finding_comments to authenticated;
grant insert on public.finding_messages to authenticated;
grant insert on public.finding_attachments to authenticated;
grant update (review_status, reviewed_by, reviewed_at, review_note, supersedes_attachment_id, archived_at)
  on public.finding_attachments to authenticated;

grant insert on public.extension_requests to authenticated;
grant update (status_code, decided_by, decided_at, decision_note, approved_due_date, updated_at)
  on public.extension_requests to authenticated;

grant insert on public.escalations to authenticated;
grant update (status_code, acknowledged_at, resolution, resolved_by, resolved_at)
  on public.escalations to authenticated;

grant insert on public.approvals to authenticated;
grant update (status_code, decided_by, decided_at, decision_note)
  on public.approvals to authenticated;

-- لا GRANT للكتابة على:
--   financial_control_source_documents, financial_control_unit_aliases,
--   financial_control_escalation_rules, financial_control_finding_versions,
--   finding_status_history, corrective_action_status_history.
-- تكتب فقط عبر migration/مسار معاملات موثوق بعد اعتماده.

commit;
