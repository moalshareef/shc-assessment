# مقترح ERD لمساحة الرقابة المالية

## 1. حالة الوثيقة وحدودها

- هذه وثيقة تصميم مقترحة فقط، ولا تنشئ جداول أو SQL أو migrations.
- جميع الأسماء والأنواع والعلاقات قابلة للتعديل بعد مراجعة المخطط الحالي واعتماد مالك المشروع.
- الأنواع المقترحة تفترض PostgreSQL/Supabase، لكنها لا تعد موافقة على التنفيذ.
- الأنواع المؤكدة: `workspaces.id` و`profiles.id` و`departments.id` من نوع `uuid`، و`audit_logs.id` من نوع `bigint`؛ يبقى فحص أسماء الأعمدة اللازمة قبل أي migration.

## 2. قواعد نمذجة عامة

- المفاتيح الأساسية المقترحة: `uuid` ما لم يوجد معيار مختلف في النواة الحالية.
- الوقت: `timestamptz`، والتاريخ الرسمي دون وقت: `date`.
- النسب: `numeric(5,2)` مع قيود من 0 إلى 100.
- النصوص الرسمية الطويلة: `text`.
- القيم المحددة: `text` مع `check constraint` أو جداول مرجعية بعد اعتمادها؛ لا يعتمد PostgreSQL enum قبل تثبيت دورة الحالات.
- كل جدول تابع للمساحة يحمل `workspace_id` لتبسيط العزل وRLS، حتى عند إمكان استنتاجه عبر العلاقة.
- السجلات التاريخية الحساسة append-only ولا تحذف فعليًا.
- الحذف التشغيلي المقترح soft delete أو إلغاء، مع `archived_at` و`archived_by` وسبب.
- الحقول الرسمية والتشغيلية منفصلة.
- يحفظ `assessment_rating` منفصلًا عن `workflow_status` ولا تستخدم قيم أحدهما في الآخر.
- الأدوار التشغيلية لدورة التنفيذ والقرار: `action_owner` للموظف المسند و`manager` للمدير؛ ويبقى `owner/viewer` للاطلاع أو التصعيد وفق النطاق.
- `system_admin` دور عام داخل `profiles` ولا يمنح اعتماد الملاحظات.
- يسمح بأكثر من `corrective_action` للملاحظة، ولكل إجراء مسؤول واستحقاق وإنجاز وحالة وأدلة مستقلة.
- الاسم الرسمي للوحدة المالية هو «إدارة الشؤون المالية»، وتحفظ المسميات القديمة كaliases للاستيراد.

## 3. الجداول المقترحة

### 3.0 القائمة النهائية المقترحة

- `financial_control_members`.
- `financial_control_source_documents`.
- `financial_control_unit_aliases`.
- `financial_control_escalation_rules`.
- `financial_control_findings`.
- `financial_control_finding_versions`.
- `corrective_actions`.
- `corrective_action_document_references` — مقترح غير منفذ.
- `finding_assignments`.
- `finding_comments`.
- `finding_messages`.
- `finding_attachments`.
- `finding_status_history`.
- `corrective_action_status_history`.
- `extension_requests`.
- `escalations`.
- `approvals`.

المجموع **17 جدولًا** عند اعتماد جدول المستندات المرجعية المقترح. ترتبط بالنواة الحالية: `workspaces` و`profiles` و`departments`، وتستخدم `audit_logs` المشترك دون تعديله. يبقى `workspace_members` قائمًا دون تعديل أو تغيير قيد أدواره.

### 3.0A `financial_control_members`

**الغرض:** فصل أدوار الرقابة المالية المتخصصة عن قيد `workspace_members.role` القائم.

**الحقول الأساسية:** `id uuid` PK، و`workspace_id uuid` FK إلى `workspaces.id`، و`user_id uuid` FK إلى `profiles.id`، و`role text`، و`is_active`، و`starts_at/ends_at`، و`created_by`، وحقول الإنشاء والتحديث. تستخدم الدورة التشغيلية الجديدة `action_owner/manager` فقط، مع بقاء أدوار الاطلاع والتصعيد منفصلة.

**القيود:** فريد على `(workspace_id, user_id, role)`، ولا يعدل `workspace_members` أو يستنتج دورًا من `user_metadata`.

### 3.1 `financial_control_source_documents`

**الغرض:** توثيق HTML وPDF وأي إصدار رسمي لاحق ومصدر الاستيراد.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `document_type text` — `official_report` أو `functional_reference` أو نوع معتمد.
- `file_name text`، `storage_path text`.
- `classification text`، `issuer text`.
- `document_version text`، `issued_at date`.
- `coverage_start date`، `coverage_end date`.
- `checksum text` — بصمة الأصل.
- `is_authoritative boolean`.
- `metadata jsonb` — للبيانات غير المهيكلة غير المستخدمة في التفويض.
- `created_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`.

**التدقيق/versioning:** لا يستبدل الملف؛ كل إصدار سجل جديد. يمنع تحديث `checksum` و`storage_path` بعد الاعتماد.

### 3.1A `financial_control_unit_aliases`

**الغرض:** توحيد أسماء الوحدات أثناء الاستيراد دون إنشاء وحدات مكررة.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `canonical_unit_id uuid` — FK إلى جدول الوحدات التنظيمية المعتمد.
- `canonical_name text` — يتضمن الاسم الرسمي «إدارة الشؤون المالية».
- `alias_name text` — مثل «الإدارة المالية» أو أي مسمى تاريخي.
- `source_document_id uuid` — FK إلى `financial_control_source_documents.id`، nullable.
- `normalized_alias text`.
- `is_active boolean`.
- `created_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`.

**القيود:** Unique على `(workspace_id, normalized_alias)`، ولا يستخدم alias كاسم عرض رسمي بعد الترحيل.

### 3.1B `financial_control_escalation_rules`

**الغرض:** جعل مدد التنبيه والتصعيد قابلة للتهيئة مستقبلًا مع الاحتفاظ بالإصدارات السابقة.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `rule_version integer`.
- `pre_due_notice_days integer default 7`.
- `manager_escalation_overdue_days integer default 0`.
- `owner_escalation_overdue_days integer default 7`.
- `higher_level_escalation_overdue_days integer default 30`.
- `higher_level_target_label text` — هدف قابل للتهيئة، ولا يربط بمسمى إداري ثابت في الكود أو القيد.
- `effective_from timestamptz`، `effective_to timestamptz`.
- `is_active boolean`.
- `created_by uuid`، `approved_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`، `approved_at timestamptz`.

**التدقيق/versioning:** لا تعدل القاعدة السارية؛ ينشأ إصدار جديد. كل تصعيد يحفظ `rule_id` المستخدم وقت إنشائه.

### 3.2 `financial_control_findings`

**الغرض:** السجل الرئيسي للملاحظة، ويجمع الهوية الرسمية مع الحالة التشغيلية الحالية دون خلط دلالتهما.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `source_document_id uuid` — FK إلى `financial_control_source_documents.id`.
- `sequence_no integer` — من 1 إلى 33 للإصدار الحالي.
- `case_code text` — مثل `FC-2026-001` إذا اعتمد رسميًا داخل المنصة.
- `reference_code text` — مثل `1.6`.
- `report_page integer`.
- `assessment_axis text`، `activity_name text`.
- `title text`.
- `assessment_rating text` — `partially_effective` أو `not_exists` فقط للإصدار الحالي.
- `assessment_rating_label text` — «شبه فعال» أو «غير موجود» كما يعتمد للعرض.
- `control_reference text`.
- `control_summary text`.
- `official_finding_text text`.
- `official_risk_impact text`.
- `official_owner_unit_id uuid` — FK إلى جدول الوحدات التنظيمية المشترك إن وجد؛ وإلا يحسم قبل التنفيذ.
- `official_owner_label text` — الاسم الرسمي؛ يستخدم «إدارة الشؤون المالية» عند انطباقه.
- `imported_owner_alias text` — المسمى القديم الوارد في المصدر الوظيفي لأغراض المطابقة فقط.
- `official_due_date date`.
- `official_quarter text`.
- `source_image_page integer` أو `source_image_ref text`.
- `workflow_status text default 'imported_pending_review'` — منفصل عن `assessment_rating`.
- `progress_percent numeric(5,2)`.
- `current_due_date date` — يتغير فقط بتمديد معتمد.
- `latest_update_summary text`، `last_activity_at timestamptz`.
- `closed_at timestamptz`، `reopened_at timestamptz`.
- `official_content_version integer`، `lock_version integer`.
- `created_by uuid`، `updated_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`، `updated_at timestamptz`، `archived_at timestamptz`.

**القيود المقترحة:**

- Unique على `(workspace_id, source_document_id, reference_code)`.
- Unique على `(workspace_id, source_document_id, sequence_no)`.
- `progress_percent` بين 0 و100.
- `assessment_rating` ضمن `partially_effective` و`not_exists` للإصدار الحالي.
- `workflow_status` ضمن حالات الملاحظة المعتمدة في `FUNCTIONAL_SPEC.md`.
- الإغلاق يتطلب 100% وقرار اعتماد نهائي، ويفضل فرضه بمعاملة موحدة بعد اعتماد الآلية.

**التدقيق/versioning:** النصوص الرسمية، المسؤول الرسمي، التاريخ الرسمي، التقييم، والصفحة تحتاج versioning ولا تستبدل مباشرة.

### 3.3 `financial_control_finding_versions`

**الغرض:** حفظ نسخة غير قابلة للتعديل من الحقول الرسمية كلما تم تصحيح استخراج أو اعتماد إصدار تقرير جديد.

**الحقول الأساسية:**

- `id uuid` — PK.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `version_no integer`.
- الحقول الرسمية المنسوخة: الرمز، الصفحة، العنوان، `assessment_rating`، مرجع وملخص الضابط، نص الملاحظة، الخطر، المسؤول، التاريخ، الربع، ومرجع المصدر.
- `change_reason text`.
- `approved_by uuid` — FK إلى `profiles.id`.
- `approved_at timestamptz`.
- `created_at timestamptz`.

**العلاقة:** Finding واحد إلى إصدارات رسمية متعددة، وإصدار واحد فقط موسوم كحالي في السجل الرئيسي.

### 3.4 `corrective_actions`

**الغرض:** تمثيل خطط العمل وتنفيذها التشغيلي. يسمح نهائيًا بأكثر من إجراء تصحيحي للملاحظة الواحدة، مع مسؤول واستحقاق وإنجاز وحالة وأدلة مستقلة لكل إجراء.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `action_no integer`.
- `official_action_text text`.
- `execution_details text`.
- `responsible_unit_id uuid` — FK إلى الوحدة التنظيمية المعتمدة.
- `responsible_profile_id uuid` — FK إلى `profiles.id`، وهو `action_owner` للإجراء وnullable حتى الإسناد.
- `official_due_date date`.
- `current_due_date date`.
- `workflow_status text` — `not_started/in_progress/submitted_for_manager_review/completed` في الدورة المقترحة.
- `progress_percent numeric(5,2)`.
- `completion_summary text`، `completed_at timestamptz`.
- `version_no integer`، `lock_version integer`.
- `created_by uuid`، `updated_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`، `updated_at timestamptz`.

**القيود:** Unique على `(finding_id, action_no)`، ونطاق الإنجاز 0–100.

- لا يسمح باعتماد الملاحظة إذا وجد مستند مرجعي `pending` أو `rejected`؛ وعند الاعتماد تحول الإجراءات المقدمة إلى `completed` ذريًا.
- كل مرفق من النوع `evidence` يجب أن يحمل `corrective_action_id`.

**التدقيق/versioning:** النص الرسمي والمسؤول الرسمي والاستحقاق الرسمي؛ وكل تغيير معتمد على الخطة أو تاريخها.

### 3.5 `finding_assignments`

**الغرض:** حفظ تاريخ إسناد الملاحظة أو الإجراء إلى المستخدم والوحدة والدور، بدل تخزين المسند الحالي فقط.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `profile_id uuid` — FK إلى `profiles.id`.
- `user_id uuid` — FK إلى `profiles.id`، مع التحقق من عضويته النشطة في `financial_control_members`.
- `unit_id uuid` — FK إلى الوحدة التنظيمية المعتمدة، nullable.
- `assignment_role text` — `action_owner` للموظف المسند؛ أما صلاحيات `manager` و`owner` و`viewer` فتأتي من عضوية Workspace.
- `starts_at timestamptz`، `ends_at timestamptz`.
- `is_primary boolean`.
- `assigned_by uuid` — FK إلى `profiles.id`.
- `assignment_reason text`.
- `created_at timestamptz`.

**التدقيق:** لا يحذف الإسناد السابق؛ يحدد `ends_at` وينشأ سجل جديد.

### 3.6 `finding_comments`

**الغرض:** الملاحظات والتحديثات النصية وأسباب الإرجاع والاعتماد، مع نطاق رؤية واضح.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `parent_comment_id uuid` — FK ذاتي، nullable.
- `comment_type text` — `internal`، `execution_update`، `return_reason`، `approval_note`.
- `visibility text` — داخلية أو مشتركة مع مسؤول الإجراء وفق سياسة معتمدة.
- `body text`.
- `author_profile_id uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`، `edited_at timestamptz`.
- `supersedes_comment_id uuid` — FK ذاتي، nullable.

**التدقيق/versioning:** يفضل إنشاء نسخة/تعليق مصحح بدل استبدال النص؛ يمنع الحذف الفعلي بعد دخوله في مراجعة أو اعتماد.

### 3.7 `finding_messages`

**الغرض:** سجل البريد والردود والمراسلات والتذكيرات، سواء كانت مسجلة يدويًا أو مرتبطة بتكامل مستقبلي.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `parent_message_id uuid` — FK ذاتي، nullable.
- `message_type text`، `direction text`، `channel text`.
- `sent_at timestamptz`.
- `sender_profile_id uuid` — FK إلى `profiles.id`، nullable للمصدر الخارجي.
- `sender_label text`.
- `to_recipients jsonb`، `cc_recipients jsonb` — أو جدول مستلمين منفصل إذا اعتمد.
- `subject text`، `body text`.
- `external_message_id text`.
- `recorded_by uuid` — FK إلى `profiles.id`.
- `created_at timestamptz`.

**التدقيق/versioning:** الرسالة المرسلة/المستلمة غير قابلة للتعديل؛ أي تصحيح يسجل كقيد جديد.

### 3.7A `financial_control_follow_ups`

**الغرض:** تخزين المتابعات التشغيلية البسيطة للمدير دون تغيير حالة الملاحظة أو استخدام نصوص حرة لحفظ metadata.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id` مع قيد نطاق Workspace مركب.
- `follow_up_type text` — `reminder` أو `employee_direction`.
- `target_organization_id uuid` — FK nullable إلى `organizations.id`.
- `target_user_id uuid` — FK nullable إلى `profiles.id`.
- `title text` — عنوان اختياري على مستوى الجدول وإلزامي للتذكير عبر RPC.
- `body text` — النص التشغيلي غير الفارغ.
- `priority text` — `normal` أو `urgent`.
- `due_at timestamptz` — موعد المتابعة أو الموعد المطلوب.
- `status text` — `open` أو `completed` أو `cancelled`.
- `created_by` و`created_at` و`updated_at` و`lock_version`.
- بيانات الإنجاز: `completed_by` و`completed_at`.
- بيانات الإلغاء: `cancelled_by` و`cancelled_at`.

**قواعد الاتساق:**

- التذكير يتطلب منظمة مستهدفة أو مستخدمًا إداريًا صالحًا.
- توجيه الموظف يتطلب `target_user_id`، وتتحقق RPC من أنه مسند إلى إجراء داخل الملاحظة.
- الإنجاز والإلغاء يتطلبان هوية المنفذ ووقت العملية، ولا يجتمعان في سجل واحد.
- لا DELETE ولا إعادة فتح في المرحلة الثانية.
- لا يحدّث الجدول أو RPCs أي حالة في `financial_control_findings`.

**RLS/Audit:** المدير أو المالك يقرأ ويكتب عبر RPCs فقط. الموظف يقرأ توجيه الموظف الموجه إليه وضمن نطاقه فقط. يسجل Trigger كل إنشاء أو تحديث أو إنجاز أو إلغاء في `audit_logs`.

### 3.8 `finding_attachments`

**الغرض:** البيانات الوصفية للأدلة والمرفقات المخزنة في حاوية خاصة داخل Supabase Storage، مع أدلة مستقلة لكل إجراء تصحيحي.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `comment_id uuid` — FK إلى `finding_comments.id`، nullable.
- `message_id uuid` — FK إلى `finding_messages.id`، nullable.
- `attachment_kind text` — دليل، مراسلة، صفحة مصدر، مرفق تمديد.
- `evidence_description text`.
- `storage_bucket text`، `storage_path text`.
- `original_file_name text`، `mime_type text`، `file_size_bytes bigint`.
- `checksum text`، `version_no integer`.
- `review_status text`، `reviewed_by uuid`، `reviewed_at timestamptz`، `review_note text`.
- `uploaded_by uuid` — FK إلى `profiles.id`.
- `uploaded_at timestamptz`.
- `supersedes_attachment_id uuid` — FK ذاتي، nullable.
- `archived_at timestamptz`.

**القيود:** `finding_id` إلزامي؛ و`corrective_action_id` إلزامي عندما يكون `attachment_kind = 'evidence'`. تراجع قاعدة ربط السياق لمنع ارتباطات متعارضة. لا يخزن رابط عام أو Signed URL دائم؛ يولد Signed URL قصير الصلاحية عند الطلب وبعد التحقق من الصلاحية.

**التدقيق/versioning:** الملف والبصمة والإصدار وحالة المراجعة؛ الاستبدال ينشئ إصدارًا جديدًا. لا حذف تلقائي قبل اعتماد سياسة الاحتفاظ.

### 3.9 `finding_status_history`

**الغرض:** سجل غير قابل للفقد لكل انتقال حالة ولقطة القيم المرتبطة به.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `from_status text`، `to_status text`.
- `transition_code text`.
- `reason text`.
- `progress_before numeric(5,2)`، `progress_after numeric(5,2)`.
- `due_date_before date`، `due_date_after date`.
- `snapshot_version integer`.
- `changed_by uuid` — FK إلى `profiles.id`.
- `changed_at timestamptz`.
- `correlation_id uuid`.

**التدقيق:** append-only؛ يمنع `update` و`delete` للمستخدمين.

### 3.9A `corrective_action_status_history`

**الغرض:** حفظ انتقالات كل إجراء تصحيحي بصورة مستقلة عن تاريخ حالة الملاحظة.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`.
- `from_status text`، `to_status text`.
- `progress_before numeric(5,2)`، `progress_after numeric(5,2)`.
- `due_date_before date`، `due_date_after date`.
- `reason text`.
- `changed_by uuid` — FK إلى `profiles.id`.
- `changed_at timestamptz`.
- `correlation_id uuid`.

**التدقيق:** append-only ودائم؛ يمنع التعديل والحذف.

### 3.10 `extension_requests`

**الغرض:** إدارة طلبات تمديد تواريخ تنفيذ الخطط التصحيحية دون فقد التاريخ الرسمي أو السابق.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`.
- `request_no integer`.
- `current_due_date date`، `requested_due_date date`.
- `reason text`، `mitigation_plan text`.
- `status_code text`.
- `requested_by uuid` — FK إلى `profiles.id`.
- `requested_at timestamptz`.
- `reviewed_by uuid`، `reviewed_at timestamptz`، `review_note text`.
- `decided_by uuid`، `decided_at timestamptz`، `decision_note text`.
- `approved_due_date date`، nullable.
- `created_at timestamptz`، `updated_at timestamptz`.

**القيود:** التاريخ المطلوب بعد التاريخ الحالي؛ لا يحدث `current_due_date` إلا بعد قرار معتمد.

- `decided_by` يجب أن يكون عضو Workspace بدور `manager` وقت القرار.

**التدقيق/versioning:** الطلب ومرفقاته والقرار والتاريخ قبل/بعد.

### 3.11 `escalations`

**الغرض:** تسجيل التصعيد اليدوي أو الآلي ومستواه والجهة الموجه إليها ونتيجته.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `extension_request_id uuid` — FK إلى `extension_requests.id`، nullable.
- `escalation_rule_id uuid` — FK إلى `financial_control_escalation_rules.id`.
- `level_code text`، `trigger_type text`.
- `overdue_days_at_trigger integer` — `-7` للتنبيه السابق، `0` لتصعيد المدير، `7` للمالك، و`30` للمستوى الأعلى وفق القواعد الافتراضية.
- `reason text`، `required_action text`.
- `status_code text`.
- `escalated_to_profile_id uuid` — FK إلى `profiles.id`، nullable.
- `escalated_to_unit_id uuid` — FK إلى الوحدة التنظيمية، nullable.
- `triggered_by uuid` — FK إلى `profiles.id`، nullable عند التشغيل الآلي.
- `triggered_at timestamptz`، `acknowledged_at timestamptz`.
- `response_due_at timestamptz`.
- `resolution text`، `resolved_by uuid`، `resolved_at timestamptz`.
- `parent_escalation_id uuid` — FK ذاتي، nullable للمستوى التالي.

**التدقيق:** append-oriented؛ لا يحذف التصعيد حتى بعد الحل.

**قواعد الوجهة الافتراضية:** تنبيه قبل الاستحقاق بـ7 أيام، `manager` عند التجاوز، `owner` بعد 7 أيام تأخير، ومستوى أعلى بعد 30 يومًا. تستمد القيم من إصدار فعال في `financial_control_escalation_rules`.

### 3.12 `approvals`

**الغرض:** حفظ طلبات وقرارات المدير للمراجعة والاعتماد والإغلاق وقرار التمديد. إعادة الفتح ينفذها المدير بسبب إلزامي وتسجل كتاريخ حالة وAudit Event.

**الحقول الأساسية:**

- `id uuid` — PK.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلى `corrective_actions.id`، nullable.
- `extension_request_id uuid` — FK إلى `extension_requests.id`، nullable.
- `approval_type text` — مراجعة، اعتماد، إغلاق، تمديد. إعادة الفتح ليست طلب اعتماد مستقلًا؛ هي انتقال ينفذه المدير بسبب إلزامي.
- `stage_no integer`.
- `status_code text` — `pending`، `approved`، `rejected`، `returned`، `cancelled`.
- `requested_by uuid`، `requested_at timestamptz`.
- `assigned_approver_id uuid` — FK إلى `profiles.id`، ويجب أن يحمل دور `manager` في Workspace.
- `decided_by uuid` — FK إلى `profiles.id`.
- `decided_at timestamptz`.
- `decision_note text`.
- `submitted_snapshot jsonb` أو FK إلى إصدار متابعة معتمد بعد تحديد نموذج versioning.
- `correlation_id uuid`.

**القيود:** الاعتماد والإغلاق وقرار التمديد للـ`manager` فقط. `owner` ليس اعتمادًا إلزاميًا، و`system_admin` لا يعتمد. القرار بعد صدوره غير قابل للتعديل؛ التصحيح قرار جديد.

### 3.13 `audit_logs` المشترك — جدول قائم لا تنشئه الحزمة

هو سجل التدقيق المركزي الوحيد، و`id` فيه `bigint`. لا ينشأ `financial_control_audit_log`. يجب أن تكتب RPCs الانتقال الذرية القيم السابقة والجديدة والمستخدم والوقت والسبب فيه ضمن المعاملة نفسها، بعد اعتماد Mapping أعمدته الفعلية، من دون تعديل الجدول أو سياساته في هذه الحزمة.

## 4. العلاقات الرئيسية

- `workspaces` 1 ← N `financial_control_source_documents`.
- `workspaces` 1 ← N جميع جداول الرقابة المالية لعزل المساحات.
- `workspaces` 1 ← N `financial_control_members`، و`profiles` 1 ← N عضويات الرقابة المالية.
- `financial_control_source_documents` 1 ← N `financial_control_findings`.
- `workspaces` 1 ← N `financial_control_unit_aliases` و`financial_control_escalation_rules`.
- `financial_control_findings` 1 ← N `financial_control_finding_versions`.
- `financial_control_findings` 1 ← N `corrective_actions`.
- `financial_control_findings` 1 ← N `finding_assignments` و`finding_comments` و`finding_messages` و`financial_control_follow_ups` و`finding_attachments` و`finding_status_history` و`extension_requests` و`escalations` و`approvals`.
- `workspaces` 1 ← N `financial_control_follow_ups`، و`organizations` و`profiles` 1 ← N كجهات أو مستخدمين مستهدفين.
- `corrective_actions` 1 ← N الإسنادات والتعليقات والرسائل والمرفقات والتاريخ والتمديدات والتصعيدات والاعتمادات.
- `corrective_actions` 1 ← N `finding_attachments` من نوع الدليل و`corrective_action_status_history`، بما يضمن أدلة وحالة مستقلة لكل إجراء.
- `finding_messages` 1 ← N رسائل الرد عبر `parent_message_id`.
- `finding_comments` 1 ← N الردود/الإصدارات عبر المفاتيح الذاتية.
- `finding_attachments` N → 1 ملاحظة، ويمكن ربطه بسياق فرعي واحد.
- `extension_requests` 1 ← N `approvals` أو يعتمد قرار واحد نهائي وفق النموذج المعتمد.
- `escalations` 1 ← N مستويات لاحقة عبر `parent_escalation_id`.
- `profiles` 1 ← N كل حقول المنفذ والمسند والمراجع والمعتمد والرافع.

## 5. العلاقة مع `workspaces` و`profiles` و`workspace_members`

### `workspaces`

- كل سجل رقابة مالية يجب أن يحمل `workspace_id`.
- Workspace المستهدف: `name = 'تقرير الكفاءة الرقابية'` و`code = 'financial-control'`.
- يمنع نقل ملاحظة بين Workspaces بتحديث عادي.

### `profiles`

- تستخدم `profiles.id` لهوية المستخدم الظاهرة في الإسناد والتعليقات والقرارات والتدقيق.
- `profiles.id` من نوع `uuid` ومرتبط أصلًا بـ`auth.users.id`؛ تستخدم FKs `profiles.id` وتستخدم RLS `(select auth.uid())`.
- لا تستخدم بيانات الملف الشخصي القابلة للتعديل ذاتيًا لمنح الصلاحية.
- يحفظ `system_admin` كدور عام مؤسسي داخل `profiles`، ويحدد اسم الحقل ونوعه بعد فحص المخطط الحالي. لا يمنح هذا الدور اعتمادًا أو إغلاقًا للملاحظات.

### `workspace_members`

- الجدول قائم ولا يعدل، ويبقى قيد أدواره `owner/manager/member/viewer` كما هو.
- مصدر أدوار الرقابة المالية هو `financial_control_members` المستقل بأدواره الخمسة المعتمدة.
- انتهاء عضوية الرقابة المالية النشطة يمنع الوصول الجديد، مع بقاء هوية صاحب الحركات التاريخية.

## 6. الحقول التي تحتاج versioning أو Audit

### Versioning إلزامي

- النص الرسمي للملاحظة والخطر والخطة.
- الرمز والصفحة والتقييم والمسؤول والتاريخ الرسمي.
- إصدارات الملفات والأدلة.
- لقطة البيانات المرسلة لكل مراجعة أو اعتماد.
- أي تصحيح لاستخراج PDF أو تغيير ناتج عن إصدار تقرير رسمي جديد.

### Audit إلزامي

- الإسناد وإعادة الإسناد.
- الحالة والإنجاز والاستحقاق الحالي.
- التعليقات والمراسلات.
- رفع الملف ومراجعته وإلغاؤه.
- الإرسال والإرجاع والاعتماد والإغلاق وإعادة الفتح.
- طلب التمديد وقراره.
- إنشاء التصعيد ورفعه وحله.
- تغيير العضويات أو الأدوار المؤثرة.
- الاستيراد والتصدير والنسخ والاستعادة.
- أي إجراء إداري على سجل رسمي.

## 7. متطلبات RLS وRBAC المبدئية

هذه المتطلبات تصميمية وتحتاج سياسات تفصيلية واختبارات قبل التنفيذ:

- تفعيل RLS على كل جدول في schema معروض عبر Data API.
- السماح للمستخدم المصادق فقط إذا كانت له عضوية نشطة في `financial_control_members` لنفس `workspace_id`.
- لا يكفي `TO authenticated` وحده؛ يجب إضافة شرط العضوية والدور ونطاق السجل.
- سياسات `update` تحتاج `USING` و`WITH CHECK` لمنع تغيير `workspace_id` أو الإسناد خارج النطاق.
- مسؤول الإجراء يرى ويحدث السجلات المرتبطة به أو بوحدته فقط وفق قرار المالك.
- الموظف المسند يحدث إجراءاته ومراجعها فقط، بينما المدير يرى نطاق المساحة ويملك قرارات المراجعة.
- المعتمد وحده يكتب قرارات الاعتماد والإغلاق وإعادة الفتح النهائية.
- مدير النظام يدير الإعداد والعضويات والاستيراد، ولا تمنحه RLS صلاحية اعتماد تلقائية.
- النصوص الرسمية لا تحدث عبر سياسة عامة؛ تحتاج مسار تصحيح بإصدار واعتماد.
- جداول التاريخ تمنع `update/delete` للمستخدمين، ويستخدم التدقيق جدول `audit_logs` المركزي دون جدول مكرر.
- `action_owner` ينفذ الإجراء ويسجل المراجع ويرفع الملاحظة مباشرة للمدير، و`manager` يراجع ويعتمد أو يعيد.
- `manager` وحده يعيد الملاحظة ويعتمدها ويغلقها ويعيد فتحها ويقرر التمديد.
- `owner` للقراءة والتقارير وإدارة التصعيد، وليس حلقة اعتماد إلزامية.
- `viewer` للقراءة فقط دون تصدير.
- `system_admin` العام ينفذ الاستيراد والنسخ الاحتياطي والاستعادة دون اعتماد الملاحظات.
- تصدير PDF وExcel مسموح للموظف ضمن نطاق إجراءاته، ولـ`manager` و`owner` ضمن نطاق Workspace.
- النسخ الاحتياطي والاستعادة محصورتان في `system_admin` عبر مسار إداري موثوق، لا من صلاحيات العميل العامة.
- لا تستخدم `user_metadata` في قرارات التفويض. مصدر الدور هو العضوية/البيانات المؤسسية المعتمدة.
- لا يستخدم `service_role` أو secret key في تطبيق React العام.
- أي view معروض للمستخدم يجب أن يحترم RLS، ويفضل `security_invoker` عند ملاءمته.
- منح الوصول إلى Data API منفصل عن RLS ويجب مراجعته صراحة.
- لا يحدث العميل `workflow_status` مباشرة؛ تمر الانتقالات عبر RPCs ذرية تضيف History وتكتب `audit_logs` في المعاملة نفسها.
- أي `SECURITY DEFINER` function تكون داخل `private` وبـ`search_path` فارغ أو محدد، ويسحب تنفيذها من `PUBLIC/anon` ويمنح لـ`authenticated` عند الحاجة فقط.

### Storage

- مسار مقترح: `<workspace_id>/<finding_id>/<attachment_id>/<version>/<file>`.
- تستخدم حاوية خاصة فقط، ولا يسمح بالوصول العام.
- سياسات Storage تتحقق من عضوية Workspace وربط المرفق بالملاحظة.
- دليل الإجراء يستخدم مسارًا يتضمن `corrective_action_id` أو يتحقق منه عبر سجل المرفق.
- الوصول للملف يتم عبر Signed URL مدته المقترحة **10 دقائق** بعد التحقق من الدور؛ لا يخزن Signed URL.
- يطبق Versioning بإنشاء مسار/سجل جديد لكل إصدار، ولا يستخدم overwrite افتراضيًا.
- لا حذف تلقائي قبل اعتماد سياسة الاحتفاظ، ويمنع إنشاء روابط عامة دائمة للملفات المقيدة.

## 8. خطة ترحيل السجلات الـ33

### المرحلة 1: تثبيت المصادر

- حساب بصمة HTML وPDF وتسجيل الإصدار والتصنيف.
- اعتماد PDF رسميًا وHTML وظيفيًا.
- عدم استخدام بيانات Git ذات 31 ملاحظة.

### المرحلة 2: استخراج مجموعة مطابقة خارج قاعدة البيانات

- استخراج 33 سجلًا من `INITIAL_DATA`.
- استخراج النصوص الرسمية لكل بطاقة من PDF.
- إنشاء سجل مطابقة لكل رمز: التسلسل، الصفحة، التقييم، العنوان، المرجع، الملخص، الملاحظة، الخطر، الخطة، المسؤول، التاريخ، والربع.
- التحقق من وجود 33 رمزًا فريدًا.

### المرحلة 3: حل الفروقات واعتماد القاموس

- استبدال `غير محدد` في `1.6` بالقيمة الرسمية «وحدة إدارة المخاطر واستمرارية الأعمال».
- استخدام «إدارة الشؤون المالية» اسمًا رسميًا، وتسجيل «الإدارة المالية» والمسميات التاريخية كaliases للاستيراد.
- ترحيل التقييم إلى `assessment_rating` بقيمتي `partially_effective` و`not_exists` مع حفظ النص العربي، دون خلطه مع `workflow_status`.
- اعتماد الفرق بين `report_page` و`imageKey`.

### المرحلة 4: اختبار جاف قبل migration

- التحقق من العدد 33.
- التقييمات: 19 شبه فعّال و14 غير موجود.
- المواعيد: 2 في 30-09-2026، و3 في 31-12-2026، و28 في 30-06-2027.
- التحقق من جميع الحقول الرسمية وعدم الاعتماد على الصور فقط.
- إنتاج تقرير أخطاء دون كتابة إلى قاعدة البيانات.

### المرحلة 5: التنفيذ بعد الاعتمادات فقط

- إنشاء سجل المصدر الرسمي والمرجع الوظيفي.
- إدخال 33 ملاحظة و33 خطة تصحيحية على الأقل داخل Workspace الصحيح.
- بدء جميع السجلات الـ33 بالحالة `imported_pending_review`، واسمها العربي «مستورد – بانتظار المراجعة».
- الانتقال إلى `not_started` لا يتم إلا بعد مراجعة `manager` لفروقات الاستيراد واستكمال إسناد الإجراءات.
- لا تنشأ مستخدمون أو إسنادات شخصية وهمية للحقول الفارغة في HTML.
- ربط الوحدات الرسمية، ثم الإسنادات الفعلية من أعضاء Workspace.
- يسمح بإنشاء أكثر من `corrective_action` للملاحظة وفق المطابقة الرسمية والتجزئة المعتمدة، ولكل إجراء مسؤول واستحقاق وإنجاز وحالة وأدلة مستقلة.
- حفظ صور الصفحات كمراجع مصدر اختيارية، لا كنص وحيد.

### المرحلة 6: تحقق ما بعد الترحيل

- مطابقة ثنائية الاتجاه للـ33 سجلًا مع PDF وHTML.
- اختبار العزل بين Workspaces والأدوار الخمسة.
- اختبار الحالات والاعتماد والإرجاع والإغلاق وإعادة الفتح.
- اختبار التمديد والتصعيد والأدلة والتدقيق.
- اختبار التصدير والطباعة دون تسريب بيانات.
- توثيق نتيجة التحقق واعتمادها قبل تشغيل الكتابة للمستخدمين.

## 9. ما يجب اعتماده قبل تنفيذ migrations

1. اعتماد `FUNCTIONAL_SPEC.md` وهذه الوثيقة.
2. اعتماد الأسماء النهائية للجداول والحقول وحالة استخدام schema مستقل أو `public`.
3. فحص أسماء أعمدة `workspaces` وMapping أعمدة `audit_logs`؛ أنواع المفاتيح المشتركة معتمدة.
4. اعتماد قاموس الوحدات التنظيمية وعلاقة الوحدة بالمستخدمين.
5. تثبيت مسؤول `1.6` من PDF، والاسم الرسمي «إدارة الشؤون المالية» مع aliases للاستيراد.
6. تثبيت الحالات والانتقالات والحالات الموازية الواردة في `FUNCTIONAL_SPEC.md`.
7. تنفيذ الأدوار المعتمدة وفصل `system_admin` العام عن أدوار Workspace والاعتماد.
8. تطبيق صلاحية `manager` للإرجاع والاعتماد والإغلاق وإعادة الفتح والتمديد، وصلاحية `owner` للاطلاع والتصعيد.
9. اعتماد نموذج versioning: جداول إصدارات منفصلة أو نموذج آخر.
10. اعتماد RPCs الانتقال الذرية وMapping الكتابة في `audit_logs` المركزي.
11. اعتماد Storage bucket والتصنيف والاحتفاظ وإصدارات الملفات.
12. اعتماد سياسات RLS/RBAC تفصيليًا واختبارات السماح والمنع.
13. اعتماد Data API grants وأي views أو functions مطلوبة.
14. اعتماد خطة الترحيل وسجل المطابقة الجاف للـ33.
15. اعتماد سياسة النسخ الاحتياطي والاستعادة والتصدير.
16. إنشاء migration فقط بعد موافقة صريحة منفصلة من مالك المشروع.

## 10. القرارات التصميمية المعتمدة في هذه المرحلة

- الأدوار التشغيلية: `action_owner` للموظف و`manager` للمدير؛ و`owner/viewer` أدوار اطلاع أو تصعيد خارج مسار القرار.
- `system_admin` دور عام في `profiles`، للعمليات الإدارية والنسخ والاستعادة، ولا يعتمد الملاحظات.
- `manager` يعيد للتعديل ويعتمد ويغلق ويوافق على التمديد ويعيد الفتح بسبب إلزامي.
- `owner` للاطلاع والتصعيد، وليس اعتمادًا إلزاميًا لكل ملاحظة.
- يسمح بأكثر من إجراء تصحيحي للملاحظة، ولكل إجراء مسؤول واستحقاق وإنجاز وحالة وأدلة مستقلة.
- مدد التصعيد الافتراضية: تنبيه قبل 7 أيام، المدير عند التجاوز، المالك بعد 7 أيام تأخير، ومستوى أعلى بعد 30 يومًا، مع قابلية التهيئة بإصدارات قواعد.
- الاسم الرسمي «إدارة الشؤون المالية»، والمسميات القديمة aliases للاستيراد.
- `audit_logs` المشترك هو سجل التدقيق المركزي الدائم؛ لا ينشأ جدول مكرر، وتكتب فيه RPCs القيم السابقة والجديدة والمستخدم والوقت والسبب ذريًا.
- المرفقات في Supabase Storage خاص، عبر Signed URLs، مع Versioning ودون حذف تلقائي قبل سياسة الاحتفاظ.
- تصدير PDF وExcel للموظف ضمن نطاق إجراءاته، ولـ`manager` و`owner` ضمن نطاق Workspace.
- النسخ الاحتياطي والاستعادة لـ`system_admin` فقط.
- حالة السجلات الـ33 بعد الاستيراد `imported_pending_review` — «مستورد – بانتظار المراجعة».
- `assessment_rating` بقيمتي «شبه فعال/غير موجود» منفصل عن `workflow_status`.

## 11. قرارات تقنية متبقية قبل migrations

- أسماء أعمدة `workspaces` و`audit_logs` اللازمة للـSeed وRPCs؛ الأنواع المؤكدة هي `uuid` للمفاتيح المشتركة و`bigint` لـ`audit_logs.id`.
- اسم وجدول الوحدات التنظيمية المشترك الذي سترتبط به aliases.
- آلية حساب نسبة إنجاز الملاحظة من عدة إجراءات تصحيحية.
- قيمة هدف المستوى الأعلى بعد 30 يومًا لكل قاعدة؛ تبقى قابلة للتهيئة ولا تربط بمسمى ثابت.
- سياسة الاحتفاظ والحذف؛ مدة Signed URL المقترحة 10 دقائق.
- Mapping أعمدة `audit_logs` وتنفيذ RPCs الذرية ومنع تجاوزها.
- `case_code` النهائي وصيغة ترقيم الإجراءات التصحيحية.

## 12. مواءمة النسخة التشغيلية المبسطة مع الجداول الحالية

لا تتطلب النسخة المبسطة جدولًا جديدًا أو Migration جديدة، وتستخدم البنية الحالية كما يلي:

| الوظيفة | الجدول الحالي | طريقة الاستخدام |
|---|---|---|
| البريد الرسمي والردود | `finding_messages` | سجلات append-only من نوع `sent_email` أو `department_reply` مع `manual_log` ومرجع المعاملة في `external_message_id` |
| ملاحظة المتابعة | `finding_comments` | تعليق `internal` ظاهر على مستوى Workspace |
| تقدم التنفيذ | `corrective_actions` | تحديث `progress_percent` و`execution_details` و`updated_by/updated_at/lock_version` دون تحديث الحالة مباشرة |
| رفع الملاحظة وقرارات المدير | `financial_control_findings` + RPC | انتقالات ذرية فقط عبر `financial_control_transition_finding` |
| تاريخ الحالة | `finding_status_history` | قراءة السجلات التي ينشئها RPC، دون إدخال مباشر من العميل |

السجل الزمني الموحد في هذه المرحلة نموذج قراءة في التطبيق يجمع السجلات السابقة زمنيًا، وليس جدولًا مكررًا. أسماء المستخدمين تُقرأ من `profiles.full_name` عبر المفاتيح الموجودة في `recorded_by` و`author_user_id` و`changed_by` و`updated_by`.

### 12.1 قيود موثقة للنسخة الأولى

- `finding_comments` لا يحتوي تاريخ حدث مستقلًا عن `created_at`؛ تستخدم النسخة الأولى التاريخ المدخل كتاريخ التعليق، ويجب تقييم فصل `activity_date` عن وقت التسجيل في إصدار لاحق قبل أي Migration.
- وصف التقدم والعوائق يخزنان نصيًا داخل `corrective_actions.execution_details` بصيغة واضحة، دون إضافة حقول جديدة في هذه المرحلة.
- الصور المرجعية أصول تطبيق ثابتة وليست مرفقات ولا تحفظ في Supabase أو داخل حقول Base64.
- لا تستخدم `finding_attachments` في النسخة الأولى، ولا توجد واجهة رفع ملفات.

### 12.2 مقترح مستندات الإجراء المرجعية — غير منفذ

يقترح، بعد اعتماد Migration مستقلة، جدولًا وصفيًا باسم مبدئي `corrective_action_document_references`. لا يخزن الجدول ملفًا أو Base64 أو رابطًا عامًا؛ بل يربط الإجراء التصحيحي بمرجع مستند محفوظ أصلًا في قناة مؤسسية.

**الحقول المقترحة:**

- `id uuid` — مفتاح أساسي.
- `workspace_id uuid` — FK إلى `workspaces.id`.
- `finding_id uuid` — FK إلى `financial_control_findings.id`.
- `corrective_action_id uuid` — FK إلزامي إلى `corrective_actions.id`.
- `document_number text` — رقم المستند.
- `document_name text` — اسم المستند.
- `document_type text` — نوعه.
- `document_date date` — تاريخه.
- `issuing_entity text` — الجهة المصدرة.
- `storage_location text` — محصور في `share_folder/official_email/internal_system/other`.
- `location_reference text` — المسار أو المرجع المؤسسي، دون رابط وصول عام.
- `description text` — وصف مختصر غير حساس.
- `manager_verification_status text` — محصور في `pending/approved/rejected`.
- `manager_decision_note text` — إلزامي عند `rejected` فقط، واختياري عند `approved`.
- `manager_verified_by uuid` — FK إلى `profiles.id`، ويجب أن يكون مديرًا مخولًا وقت القرار.
- `manager_verified_at timestamptz`.
- `created_by uuid` — FK إلى `profiles.id`، ويجب أن يطابق الموظف المسند إليه الإجراء.
- `created_at timestamptz`، `updated_at timestamptz`، `lock_version integer`.

**العلاقات والقيود المقترحة:**

- `corrective_actions` 1 ← N `corrective_action_document_references`.
- تطابق `workspace_id/finding_id/corrective_action_id` إلزامي ويحمى بمفتاح أجنبي مركب.
- الموظف المسند إليه الإجراء وحده ينشئ المرجع ويعدله ويحذفه قبل الرفع، أو بعد إعادة الملاحظة رسميًا.
- تقفل مراجع الملاحظة على الموظف في حالتي `submitted_for_manager_review` و`under_manager_review`، وكذلك بعد الاعتماد والإغلاق.
- المدير وحده يكتب قرار التحقق؛ لا يثق RPC في دور يرسله العميل، بل يقرأ العضوية الفعلية ونطاق الملاحظة.
- سبب الرفض إلزامي، وملاحظة الاعتماد اختيارية، ويكتب القرار والقيم السابقة والجديدة في `audit_logs` ذريًا.
- لا تعتمد الملاحظة إذا كان أي مرجع مطلوب `pending` أو `rejected`.
- لا ينفذ العميل تحديث حالة التحقق مباشرة؛ يقترح RPC ذري مستقل لقرار المدير مع `lock_version`.

**المسار التشغيلي:** الموظف المسند ينفذ ويسجل المراجع ← يرفع الملاحظة للمدير ← المدير يراجع كل مرجع ويعتمده بملاحظة اختيارية أو يرفضه بسبب إلزامي ← عند الرفض تعاد الملاحظة للموظف ← بعد استيفاء المراجع يعتمد المدير الملاحظة ثم يغلقها.

هذا التصميم ممثل في ثلاث مسودات مستقلة وغير مطبقة: Schema، وRPCs للكتابة، ومسار الموظف ثم المدير. لا تعد أي منها تصريحًا بالتطبيق.

### 12.3 تعديلات RPC المقترحة لإلغاء الطرف الوسيط — غير منفذة

#### `financial_control_transition_action`

- تبقى التوقيعات الحالية ومعالجة `lock_version` وHistory و`audit_logs`.
- تحصر انتقالات الموظف المسند في `not_started → in_progress → submitted_for_manager_review`.
- يتطلب الانتقال إلى `submitted_for_manager_review`: أن يكون المنفذ هو `responsible_user_id` وله عضوية `action_owner` نشطة، وأن تكون النسبة 100%، وتوجد تفاصيل تنفيذ ومرجع مستند واحد على الأقل.
- تحذف فروع حالات المراجعة الوسيطة من منطق السماح بعد اعتماد Migration الحالات المنفصلة.
- لا يمنح `manager` انتقال الموظف؛ انتقالات المدير على الإجراءات تنفذ تبعًا لقرار الملاحظة في المعاملة نفسها.

#### `financial_control_transition_finding`

- يسمح للموظف المسند برفع الملاحظة `in_progress → submitted_for_manager_review` فقط إذا كانت جميع إجراءاتها `submitted_for_manager_review`.
- ينفذ المدير `submitted_for_manager_review → under_manager_review`.
- عند `under_manager_review → returned_for_revision` يكون السبب إلزاميًا، وتعود الإجراءات المقدمة إلى `in_progress` ذريًا مع تاريخ وتدقيق لكل إجراء.
- عند `under_manager_review → approved` يرفض RPC القرار إذا وجد أي مرجع `pending` أو `rejected`، ثم يحول الإجراءات المقدمة إلى `completed` ذريًا مع تاريخ وتدقيق.
- يبقى `approved → closed` للمدير، ولا تسمح نسبة الإنجاز وحدها بالاعتماد أو الإغلاق.

#### RPCs المستندات المرجعية الجديدة

- `financial_control_add_document_reference(...)`: يستخرج نطاق الإجراء من قاعدة البيانات، ويتحقق من الموظف المسند وحالة الملاحظة، ثم يضيف المرجع ويسجل `audit_logs`.
- `financial_control_update_document_reference(..., integer)`: يعدل الحقول الوصفية فقط، ويتطلب `expected_lock_version` مطابقًا، ويعيد قرار المرجع إلى `pending` بعد الإرجاع عند تعديل الموظف.
- `financial_control_decide_document_reference(uuid, text, text, integer)`: قرار المدير؛ سبب الرفض إلزامي وملاحظة الاعتماد اختيارية.
- `financial_control_delete_document_reference(uuid, integer)`: حذف الموظف المسند قبل الرفع أو بعد الإرجاع، مع فحص `lock_version`.
- لا توجد منحة `UPDATE` أو `INSERT` أو `DELETE` مباشرة إلى `authenticated`. تمنح له قراءة الصفوف المسموحة وتنفيذ RPCs العامة الأربع فقط، وتبقى سياسات الإدخال والحذف دفاعًا إضافيًا.
- كل RPC كتابة يسجل القيم السابقة والجديدة، أو قيمة الإدخال/الحذف، في `audit_logs` داخل المعاملة نفسها.

### 12.4 أثر مقترح الحالات على البيانات الحالية

- `not_started` و`in_progress` متوافقتان مباشرة مع الدورة الجديدة ولا تحتاجان Mapping.
- تضاف `submitted_for_manager_review` إلى قيد حالات `corrective_actions` قبل تفعيل RPC الجديد.
- يجب إيقاف التنفيذ إذا وجدت إجراءات في حالات الدورة الوسيطة القديمة، وإنتاج تقرير Mapping واعتماده بدل تحويلها تلقائيًا.
- لا تنفذ الحزمة أي إسناد تلقائي أو Data Migration. المدير يحدد `responsible_user_id` لكل إجراء وفق الصلاحيات المعتمدة، ويبقى الإجراء غير المسند غير قابل للانتقال أو إضافة المراجع.
- ترتيب التطبيق المقترح بعد الموافقة: `financial_control_document_references_schema_draft.sql` ثم `financial_control_document_references_rpc_draft.sql` ثم `financial_control_manager_workflow_draft.sql`.
