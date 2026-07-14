-- ============================================================================
-- DRAFT ONLY — FINANCIAL CONTROL SEED
-- هذه المسودة غير مطبقة ومقصود أن تتوقف حاليًا قبل أي INSERT دائم.
--
-- المصدر الرسمي للنصوص: تقرير تقييم مستوى الكفاءة الرقابية PDF.
-- المصدر الوظيفي للحقول التشغيلية: منصة متابعة الكفاءة الرقابية HTML.
-- لا تستخدم هذه المسودة بيانات Git التجريبية ذات 31 ملاحظة.
-- لا توجد UUIDs ثابتة؛ جميع المعرفات تولدها قاعدة البيانات أو تسترجع باستعلام.
--
-- مهم: حقول النص الرسمي أدناه NULL عمدًا، باستثناء تصحيح مسؤول السجل 1.6.
-- يجب تعبئتها ومراجعتها سجلًا بسجل من PDF الرسمي. حاجز التحقق يرفع
-- EXCEPTION ويلغي المعاملة كاملة إذا بقي نقص.
-- ============================================================================

begin;

create temporary table financial_control_seed_stage (
  sequence_no integer not null,
  case_code text not null,
  reference_code text not null,
  report_page integer not null,
  assessment_rating text not null,
  assessment_rating_label text not null,
  imported_owner_alias text not null,
  official_due_date date not null,
  official_quarter text not null,
  source_image_ref text not null,
  legacy_evidence_path text,
  title text,
  assessment_axis text,
  activity_name text,
  control_reference text,
  control_summary text,
  official_finding_text text,
  official_risk_impact text,
  official_action_text text,
  official_owner_label text
) on commit drop;

-- البيانات الآتية مستخرجة من INITIAL_DATA في HTML فقط.
-- لا تعد العناوين والنصوص الرسمية مكتملة حتى تعبأ الحقول NULL من PDF.
insert into financial_control_seed_stage (
  sequence_no,
  case_code,
  reference_code,
  report_page,
  assessment_rating,
  assessment_rating_label,
  imported_owner_alias,
  official_due_date,
  official_quarter,
  source_image_ref,
  legacy_evidence_path
)
values
  (1, 'FC-2026-001', '1.1', 14, 'partially_effective', 'شبه فعال', 'إدارة المراجعة الداخلية', '2026-09-30', 'الربع 3 2026', '15', 'Evidence/1.1'),
  (2, 'FC-2026-002', '1.2', 15, 'partially_effective', 'شبه فعال', 'إدارة المراجعة الداخلية', '2027-06-30', 'الربع 2 2027', '16', 'Evidence/1.2'),
  (3, 'FC-2026-003', '1.3', 16, 'not_exists', 'غير موجود', 'إدارة التميز المؤسسي', '2027-06-30', 'الربع 2 2027', '17', 'Evidence/1.3'),
  (4, 'FC-2026-004', '1.6', 17, 'partially_effective', 'شبه فعال', 'غير محدد', '2027-06-30', 'الربع 2 2027', '18', 'Evidence/1.6'),
  (5, 'FC-2026-005', '1.7', 18, 'partially_effective', 'شبه فعال', 'إدارة الالتزام', '2027-06-30', 'الربع 2 2027', '19', 'Evidence/1.7'),
  (6, 'FC-2026-006', '1.8', 19, 'partially_effective', 'شبه فعال', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '20', 'Evidence/1.8'),
  (7, 'FC-2026-007', '1.9', 20, 'partially_effective', 'شبه فعال', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '21', 'Evidence/1.9'),
  (8, 'FC-2026-008', '1.11', 21, 'not_exists', 'غير موجود', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '22', 'Evidence/1.11'),
  (9, 'FC-2026-009', '1.12', 22, 'not_exists', 'غير موجود', 'إدارة الأمن السيبراني', '2027-06-30', 'الربع 2 2027', '23', 'Evidence/1.12'),
  (10, 'FC-2026-010', '1.14', 24, 'not_exists', 'غير موجود', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '25', 'Evidence/1.14'),
  (11, 'FC-2026-011', '1.15', 26, 'not_exists', 'غير موجود', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '27', 'Evidence/1.15'),
  (12, 'FC-2026-012', '1.16', 27, 'partially_effective', 'شبه فعال', 'إدارة الأمن السيبراني', '2026-12-31', 'الربع 4 2026', '28', 'Evidence/1.16'),
  (13, 'FC-2026-013', '1.17', 28, 'partially_effective', 'شبه فعال', 'إدارة الأمن السيبراني', '2026-12-31', 'الربع 4 2026', '29', 'Evidence/1.17'),
  (14, 'FC-2026-014', '1.18', 29, 'partially_effective', 'شبه فعال', 'إدارة الأمن السيبراني', '2026-09-30', 'الربع 3 2026', '30', 'Evidence/1.18'),
  (15, 'FC-2026-015', '1.20', 30, 'partially_effective', 'شبه فعال', 'إدارة تقنية المعلومات', '2026-12-31', 'الربع 4 2026', '31', 'Evidence/1.20'),
  (16, 'FC-2026-016', '1.21', 31, 'not_exists', 'غير موجود', 'إدارة تقنية المعلومات', '2027-06-30', 'الربع 2 2027', '32', 'Evidence/1.21'),
  (17, 'FC-2026-017', '2.2', 33, 'partially_effective', 'شبه فعال', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '34', 'Evidence/2.2'),
  (18, 'FC-2026-018', '2.3', 34, 'not_exists', 'غير موجود', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '35', 'Evidence/2.3'),
  (19, 'FC-2026-019', '2.4', 35, 'not_exists', 'غير موجود', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '36', 'Evidence/2.4'),
  (20, 'FC-2026-020', '2.5', 36, 'not_exists', 'غير موجود', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '37', 'Evidence/2.5'),
  (21, 'FC-2026-021', '2.6', 37, 'not_exists', 'غير موجود', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '38', 'Evidence/2.6'),
  (22, 'FC-2026-022', '2.8', 38, 'partially_effective', 'شبه فعال', 'إدارة الشؤون المالية', '2027-06-30', 'الربع 2 2027', '39', 'Evidence/2.8'),
  (23, 'FC-2026-023', '2.9', 39, 'partially_effective', 'شبه فعال', 'إدارة المشتريات', '2027-06-30', 'الربع 2 2027', '40', 'Evidence/2.9'),
  (24, 'FC-2026-024', '2.11', 40, 'partially_effective', 'شبه فعال', 'إدارة المشتريات', '2027-06-30', 'الربع 2 2027', '41', 'Evidence/2.11'),
  (25, 'FC-2026-025', '2.12', 41, 'partially_effective', 'شبه فعال', 'إدارة المشتريات', '2027-06-30', 'الربع 2 2027', '42', 'Evidence/2.12'),
  (26, 'FC-2026-026', '2.13', 42, 'partially_effective', 'شبه فعال', 'إدارة المشتريات', '2027-06-30', 'الربع 2 2027', '43', 'Evidence/2.13'),
  (27, 'FC-2026-027', '2.15', 43, 'partially_effective', 'شبه فعال', 'إدارة الخدمات العامة', '2027-06-30', 'الربع 2 2027', '44', 'Evidence/2.15'),
  (28, 'FC-2026-028', '2.16', 44, 'not_exists', 'غير موجود', 'إدارة الخدمات العامة', '2027-06-30', 'الربع 2 2027', '45', 'Evidence/2.16'),
  (29, 'FC-2026-029', '2.17', 45, 'not_exists', 'غير موجود', 'إدارة الخدمات العامة', '2027-06-30', 'الربع 2 2027', '46', 'Evidence/2.17'),
  (30, 'FC-2026-030', '2.18', 46, 'not_exists', 'غير موجود', 'إدارة الخدمات العامة', '2027-06-30', 'الربع 2 2027', '47', 'Evidence/2.18'),
  (31, 'FC-2026-031', '2.19', 47, 'partially_effective', 'شبه فعال', 'إدارة الموارد البشرية', '2027-06-30', 'الربع 2 2027', '48', 'Evidence/2.19'),
  (32, 'FC-2026-032', '2.20', 48, 'partially_effective', 'شبه فعال', 'إدارة الموارد البشرية', '2027-06-30', 'الربع 2 2027', '49', 'Evidence/2.20'),
  (33, 'FC-2026-033', '2.22', 49, 'not_exists', 'غير موجود', 'إدارة الموارد البشرية', '2027-06-30', 'الربع 2 2027', '50', 'Evidence/2.22');

-- --------------------------------------------------------------------------
-- TODO رسمي قبل السماح بالتنفيذ
-- يجب إضافة UPDATE موثق لكل سجل لملء الحقول الآتية من PDF:
--   title, assessment_axis, activity_name, control_reference, control_summary,
--   official_finding_text, official_risk_impact, official_action_text,
--   official_owner_label.
--
-- تصحيح إلزامي للسجل 1.6:
--   official_owner_label = 'وحدة إدارة المخاطر واستمرارية الأعمال'
-- مع إبقاء imported_owner_alias = 'غير محدد' لأثر المطابقة فقط.
-- --------------------------------------------------------------------------

update financial_control_seed_stage
set official_owner_label = 'وحدة إدارة المخاطر واستمرارية الأعمال'
where reference_code = '1.6';

-- تحقق العدد والتوزيعات التشغيلية قبل التحقق من النص الرسمي.
do $$
declare
  v_count integer;
  v_refs integer;
  v_partially_effective integer;
  v_not_exists integer;
  v_q3 integer;
  v_q4 integer;
  v_q2_2027 integer;
begin
  select count(*), count(distinct reference_code)
    into v_count, v_refs
  from financial_control_seed_stage;

  select count(*) filter (where assessment_rating = 'partially_effective'),
         count(*) filter (where assessment_rating = 'not_exists'),
         count(*) filter (where official_due_date = date '2026-09-30'),
         count(*) filter (where official_due_date = date '2026-12-31'),
         count(*) filter (where official_due_date = date '2027-06-30')
    into v_partially_effective, v_not_exists, v_q3, v_q4, v_q2_2027
  from financial_control_seed_stage;

  if v_count <> 33 or v_refs <> 33 then
    raise exception 'Financial control seed must contain exactly 33 unique findings; rows=%, refs=%', v_count, v_refs;
  end if;

  if v_partially_effective <> 19 or v_not_exists <> 14 then
    raise exception 'Unexpected rating distribution: partially_effective=%, not_exists=%', v_partially_effective, v_not_exists;
  end if;

  if v_q3 <> 2 or v_q4 <> 3 or v_q2_2027 <> 28 then
    raise exception 'Unexpected due-date distribution: 2026-Q3=%, 2026-Q4=%, 2027-Q2=%', v_q3, v_q4, v_q2_2027;
  end if;
end;
$$;

-- حاجز الثقة: هذه الكتلة تفشل حاليًا عمدًا لأن النصوص الرسمية لم تعبأ.
do $$
declare
  v_missing integer;
  v_missing_refs text;
begin
  select count(*), string_agg(reference_code, ', ' order by sequence_no)
    into v_missing, v_missing_refs
  from financial_control_seed_stage
  where nullif(btrim(title), '') is null
     or nullif(btrim(control_reference), '') is null
     or nullif(btrim(control_summary), '') is null
     or nullif(btrim(official_finding_text), '') is null
     or nullif(btrim(official_risk_impact), '') is null
     or nullif(btrim(official_action_text), '') is null
     or nullif(btrim(official_owner_label), '') is null;

  if v_missing > 0 then
    raise exception using
      message = format(
        'DRAFT BLOCKED: %s official records are incomplete. No permanent financial-control seed was applied. Missing refs: %s',
        v_missing,
        v_missing_refs
      );
  end if;
end;
$$;

-- لن يصل التنفيذ إلى هذا القسم إلا بعد تعبئة النصوص الرسمية واعتمادها.

insert into public.workspaces (name, code, description)
select
  'تقرير الكفاءة الرقابية',
  'financial-control',
  'مساحة مؤسسية لمتابعة ملاحظات وخطط تقرير تقييم مستوى الكفاءة الرقابية'
where not exists (
  select 1 from public.workspaces where code = 'financial-control'
);

insert into public.financial_control_source_documents (
  workspace_id,
  document_type,
  file_name,
  classification,
  issuer,
  document_version,
  issued_at,
  coverage_start,
  coverage_end,
  is_authoritative,
  metadata
)
select
  w.id,
  'official_report',
  'تقرير تقييم مستوى الكفاءة الرقابية.pdf',
  'مقيّد',
  'وزارة المالية',
  '2026-05-01',
  date '2026-05-01',
  date '2025-01-01',
  date '2025-12-31',
  true,
  jsonb_build_object('expected_findings', 33, 'seed_status', 'verified_before_insert')
from public.workspaces w
where w.code = 'financial-control'
  and not exists (
    select 1
    from public.financial_control_source_documents d
    where d.workspace_id = w.id
      and d.document_type = 'official_report'
      and d.file_name = 'تقرير تقييم مستوى الكفاءة الرقابية.pdf'
      and d.document_version = '2026-05-01'
  );

insert into public.financial_control_source_documents (
  workspace_id,
  document_type,
  file_name,
  document_version,
  is_authoritative,
  metadata
)
select
  w.id,
  'functional_reference',
  'منصة متابعة الكفاءة الرقابية.html',
  'recovered-functional-reference',
  false,
  jsonb_build_object('initial_data_count', 33)
from public.workspaces w
where w.code = 'financial-control'
  and not exists (
    select 1
    from public.financial_control_source_documents d
    where d.workspace_id = w.id
      and d.document_type = 'functional_reference'
      and d.file_name = 'منصة متابعة الكفاءة الرقابية.html'
      and d.document_version = 'recovered-functional-reference'
  );

-- aliases لا تفترض أعمدة public.departments غير id؛ الربط بالقسم يتم لاحقًا.
insert into public.financial_control_unit_aliases (
  workspace_id,
  canonical_name,
  alias_name,
  normalized_alias,
  is_active
)
select w.id, x.canonical_name, x.alias_name, x.normalized_alias, true
from public.workspaces w
cross join (
  values
    ('إدارة الشؤون المالية', 'إدارة الشؤون المالية', 'إدارة الشؤون المالية'),
    ('إدارة الشؤون المالية', 'الإدارة المالية', 'الإدارة المالية')
) as x(canonical_name, alias_name, normalized_alias)
where w.code = 'financial-control'
  and not exists (
    select 1
    from public.financial_control_unit_aliases a
    where a.workspace_id = w.id
      and a.normalized_alias = x.normalized_alias
  );

insert into public.financial_control_escalation_rules (
  workspace_id,
  rule_version,
  pre_due_notice_days,
  manager_escalation_overdue_days,
  owner_escalation_overdue_days,
  higher_level_escalation_overdue_days,
  effective_from,
  is_active
)
select w.id, 1, 7, 0, 7, 30, now(), true
from public.workspaces w
where w.code = 'financial-control'
  and not exists (
    select 1
    from public.financial_control_escalation_rules r
    where r.workspace_id = w.id and r.rule_version = 1
  );

with target as (
  select
    w.id as workspace_id,
    d.id as source_document_id
  from public.workspaces w
  join public.financial_control_source_documents d
    on d.workspace_id = w.id
   and d.document_type = 'official_report'
   and d.document_version = '2026-05-01'
  where w.code = 'financial-control'
)
insert into public.financial_control_findings (
  workspace_id,
  source_document_id,
  sequence_no,
  case_code,
  reference_code,
  report_page,
  assessment_axis,
  activity_name,
  title,
  assessment_rating,
  assessment_rating_label,
  control_reference,
  control_summary,
  official_finding_text,
  official_risk_impact,
  official_owner_label,
  imported_owner_alias,
  official_due_date,
  official_quarter,
  source_image_ref,
  workflow_status,
  progress_percent,
  current_due_date,
  latest_update_summary
)
select
  t.workspace_id,
  t.source_document_id,
  s.sequence_no,
  s.case_code,
  s.reference_code,
  s.report_page,
  s.assessment_axis,
  s.activity_name,
  s.title,
  s.assessment_rating,
  s.assessment_rating_label,
  s.control_reference,
  s.control_summary,
  s.official_finding_text,
  s.official_risk_impact,
  s.official_owner_label,
  s.imported_owner_alias,
  s.official_due_date,
  s.official_quarter,
  s.source_image_ref,
  'imported_pending_review',
  0,
  s.official_due_date,
  null
from financial_control_seed_stage s
cross join target t
on conflict (workspace_id, source_document_id, reference_code) do nothing;

insert into public.financial_control_finding_versions (
  workspace_id,
  finding_id,
  source_document_id,
  version_no,
  reference_code,
  report_page,
  title,
  assessment_rating,
  assessment_rating_label,
  control_reference,
  control_summary,
  official_finding_text,
  official_risk_impact,
  official_owner_label,
  official_due_date,
  official_quarter,
  change_reason
)
select
  f.workspace_id,
  f.id,
  f.source_document_id,
  1,
  f.reference_code,
  f.report_page,
  f.title,
  f.assessment_rating,
  f.assessment_rating_label,
  f.control_reference,
  f.control_summary,
  f.official_finding_text,
  f.official_risk_impact,
  f.official_owner_label,
  f.official_due_date,
  f.official_quarter,
  'الاستيراد التأسيسي المعتمد من التقرير الرسمي'
from public.financial_control_findings f
join public.workspaces w on w.id = f.workspace_id and w.code = 'financial-control'
where not exists (
  select 1 from public.financial_control_finding_versions v
  where v.finding_id = f.id and v.version_no = 1
);

-- ينشأ إجراء رسمي واحد مبدئيًا من خطة PDF لكل ملاحظة؛ يسمح المخطط بإضافة إجراءات أخرى.
insert into public.corrective_actions (
  workspace_id,
  finding_id,
  action_no,
  official_action_text,
  official_due_date,
  current_due_date,
  workflow_status,
  progress_percent
)
select
  f.workspace_id,
  f.id,
  1,
  s.official_action_text,
  s.official_due_date,
  s.official_due_date,
  'not_started',
  0
from financial_control_seed_stage s
join public.workspaces w on w.code = 'financial-control'
join public.financial_control_findings f
  on f.workspace_id = w.id and f.reference_code = s.reference_code
where not exists (
  select 1 from public.corrective_actions ca
  where ca.finding_id = f.id and ca.action_no = 1
);

insert into public.finding_status_history (
  workspace_id,
  finding_id,
  from_status,
  to_status,
  transition_code,
  reason,
  progress_after
)
select
  f.workspace_id,
  f.id,
  null,
  'imported_pending_review',
  'official_seed_import',
  'استيراد تأسيسي من PDF الرسمي وHTML الوظيفي بعد التحقق',
  0
from public.financial_control_findings f
join public.workspaces w on w.id = f.workspace_id and w.code = 'financial-control'
where not exists (
  select 1 from public.finding_status_history h
  where h.finding_id = f.id and h.transition_code = 'official_seed_import'
);

-- لا يكتب Seed في سجل تدقيق مكرر. يجب قبل فك الحظر إضافة كتابة ذرية في
-- public.audit_logs المشترك وفق أعمدته الفعلية المعتمدة، من دون تعديل الجدول.
-- تبقى هذه المسودة غير قابلة للتطبيق إلى أن يعتمد Mapping ذلك الجدول.
do $$
begin
  raise exception
    'DRAFT BLOCKED: public.audit_logs column mapping and atomic seed audit write are not approved.';
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.financial_control_findings f
  join public.workspaces w on w.id = f.workspace_id
  where w.code = 'financial-control';

  if v_count <> 33 then
    raise exception 'Post-seed verification failed: expected 33 findings, found %', v_count;
  end if;
end;
$$;

commit;
