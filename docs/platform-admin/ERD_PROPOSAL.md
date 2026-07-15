# ERD المعتمد لإدارة المنصة والصلاحيات المركزية

## 1. حالة الجداول الحالية

تمت مراجعة المخطط الفعلي قراءةً فقط في 15 يوليو 2026.

| الجدول الحالي | ما يعاد استخدامه | الملاحظة التصميمية |
|---|---|---|
| `profiles` | هوية التطبيق المرتبطة بـ`auth.users.id`، الاسم، النشاط | لا يخزن الدور المنصي الجديد في `profiles.role`؛ القيد الحالي لا يحتوي `system_owner/platform_admin/auditor`. يستخدم `is_active` كإشارة تعطيل التطبيق مع إجراء Auth إضافي لإبطال الجلسات. |
| `workspaces` | المعرّف والرمز والاسم والوصف وملكية الجهة | معتمد كأساس تشغيلي. `platform_modules` امتداد حوكمة مركزي واحد إلى واحد؛ لا نكرر بيانات الأعمال. |
| `workspace_members` | طبقة توافق عامة للموديلات الحالية | قيده الحالي يسمح `owner/manager/member/viewer` ودور واحد لكل Workspace. لا يعدل في المرحلة الأولى. |
| `financial_control_members` | طبقة توافق للرقابة المالية | يحتفظ مؤقتًا بالأدوار المتخصصة الحالية. النموذج المركزي يفرض دورًا واحدًا لكل موديل وجهة عند الانتقال. |
| `departments` | المرجع القديم للجهات في الموديلات الحالية | يستمر تشغيليًا أثناء الانتقال، ويربط بـ`organizations` الجديدة عبر Mapping متحقق منه دون تخمين. |
| `audit_logs` | سجل التدقيق المركزي | بنيته الحالية تدعم `actor/table/record/action/old/new/time`. تحتاج سياقات مفهرسة لاحقًا أو عقد JSON ثابت لعرض المستخدم والموديل والجهة والسبب بكفاءة. |

## 2. العلاقات الرئيسية

```text
profiles 1 ── N platform_role_assignments
profiles N ── N organizations              عبر user_organizations
workspaces 1 ── 1 platform_modules
platform_modules 1 ── N module_role_templates
module_role_templates 1 ── N user_module_access
profiles 1 ── N user_module_access
organizations 1 ── N user_module_access
user_invitations 1 ── N invitation_access_grants
permission_change_requests N ── 1 platform_modules / organizations / profiles
user_module_access 1 ── N access_expiration_notifications
profiles 1 ── N assignment_alerts (disabled user / assignee)
audit_logs 1 ── 0..1 audit_log_contexts (اختياري بعد الاعتماد)
```

## 3. الجداول المقترحة

### 3.1 `platform_role_assignments`

**الغرض:** أدوار مستوى المنصة دون توسيع `profiles.role` أو الاعتماد على البريد.

| الحقل | النوع المعتمد مبدئيًا | القاعدة |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK إلى `profiles.id`, `ON DELETE RESTRICT` |
| `role` | `text` | `system_owner/platform_admin/auditor/viewer` |
| `status` | `text` | `active/suspended/revoked` |
| `starts_at` | `timestamptz` | مطلوب |
| `ends_at` | `timestamptz` | nullable، أكبر من البداية |
| `is_break_glass` | `boolean` | false؛ لا يستخدم إلا بسياسة مستقلة |
| `created_by/updated_by` | `uuid` | FK إلى `profiles.id` |
| `created_at/updated_at` | `timestamptz` | مطلوب |
| `disabled_at/disabled_by/disable_reason` | متنوع | soft disable |
| `lock_version` | `integer` | يبدأ 1 ويزداد ذريًا |

**القيود:** Unique جزئي لدور منصي فعال واحد لكل مستخدم. ينشأ `system_owner` لحساب إداري جديد مستقل عن الحساب التشغيلي الحالي، ويمنع تعديل أو تعطيل آخر `system_owner` دون إجراء استرداد معتمد.

### 3.2 `platform_modules`

**الغرض:** حوكمة دورة حياة الموديل مع إبقاء `workspaces` مرجع التوافق.

| الحقل | النوع | القاعدة |
|---|---|---|
| `id` | `uuid` | PK |
| `workspace_id` | `uuid` | FK فريد إلى `workspaces.id` |
| `route_path` | `text` | فريد، يبدأ `/` |
| `status` | `text` | `draft/active/disabled` |
| `settings` | `jsonb` | إعدادات غير سرية، schema-versioned |
| `configuration_version` | `integer` | يبدأ 1 |
| `activated_at/activated_by` | وقت/UUID | nullable |
| `disabled_at/disabled_by/disable_reason` | متنوع | سبب التعطيل مطلوب |
| `created_by/updated_by` | `uuid` | FK إلى `profiles.id` |
| `created_at/updated_at` | `timestamptz` | مطلوب |
| `lock_version` | `integer` | optimistic concurrency |

**القيود:** `workspace_id` فريد. لا حذف. لا تفعيل قبل وجود قالب دور واحد على الأقل واكتمال اختبارات القبول.

### 3.3 `module_role_templates`

**الغرض:** تعريف أدوار خاصة بكل موديل.

الحقول: `id uuid PK`، `module_id uuid FK`، `role_code text`، `name_ar text`، `description text`، `is_manager_role boolean`، `is_read_only boolean`، `status active/disabled`، `template_version integer`، `created_by/updated_by`، التواريخ، `lock_version`.

**القيود:** Unique `(module_id, role_code)`، ولا يعدل قالب مستخدم فعليًا بأثر رجعي؛ ينشأ إصدار جديد أو يعتمد تحويل صريح.

### 3.4 `permission_definitions`

**الغرض:** قاموس إجراءات مستقر مثل `users.invite` و`module.records.read` و`module.records.approve`.

الحقول: `id uuid PK`، `permission_code text UNIQUE`، `scope platform/module`، `description`، `is_sensitive`، `status`، التواريخ.

### 3.5 `module_role_template_permissions`

جدول ربط بين القالب والإجراء: `role_template_id`، `permission_id`، `effect allow/deny`، `created_by`، `created_at`. PK مركب `(role_template_id, permission_id)`. لا يوجد Allow افتراضي؛ الغياب يعني المنع.

### 3.6 `organizations` — معتمد

**الغرض:** المرجع المؤسسي المستقبلي للهيكل التنظيمي الهرمي، مع استمرار `departments` في التشغيل خلال الانتقال.

الحقول: `id uuid PK`، `code text UNIQUE`، `name text`، `parent_id uuid self-FK`، `organization_type text`، `status active/disabled`، `path_cache text` اختياري للقراءة، `created_by/updated_by`، `disabled_at/reason`، التواريخ، `lock_version`.

**القيود:** منع الحلقة في التسلسل الهرمي عبر RPC، وUnique للاسم ضمن الأب `(parent_id, name)` مع معالجة `NULL` صراحة.

### 3.7 `organization_department_mappings`

طبقة التوافق المعتمدة: `organization_id uuid UNIQUE FK`، `department_id uuid UNIQUE FK`، `mapping_status proposed/verified/rejected`، `verified_by/at`، `verification_note`. لا ينشأ Mapping بالتخمين، ولا يستخدم في القرار التشغيلي قبل `verified`.

### 3.8 `user_organizations`

**الغرض:** ربط المستخدم بأكثر من جهة مع جهة رئيسية واحدة.

الحقول: `id uuid PK`، `user_id uuid FK`، `organization_id uuid FK`، `is_primary boolean`، `status active/disabled`، `starts_at/ends_at`، `created_by/updated_by`، التواريخ، `lock_version`.

**القيود:** Unique `(user_id, organization_id)`، وفهرس Unique جزئي على `user_id WHERE is_primary AND status='active'`. لا يسمح Grant لجهة لا يملك المستخدم ارتباطًا فعالًا بها.

### 3.9 `user_invitations`

**الغرض:** سجل دورة الدعوة دون تخزين كلمة مرور أو Token خام.

الحقول:

- `id uuid PK`.
- `email_normalized text` و`display_name text`.
- `status draft/sent/accepted/active/expired/cancelled`.
- `auth_invited_user_id uuid nullable` بعد إرسال Auth.
- `provider_invitation_reference text nullable`، ولا يخزن Token صالح للاستخدام.
- `expires_at/sent_at/accepted_at/activated_at/cancelled_at timestamptz`.
- `cancel_reason text`.
- `created_by/sent_by/cancelled_by uuid`.
- `created_at/updated_at` و`lock_version`.

**القيود:** Unique جزئي على البريد للحالات `draft/sent/accepted`. الإرسال لا يتكرر إذا كان `sent_at` موجودًا أو Provider reference مستهلكًا.

### 3.10 `invitation_access_grants`

**الغرض:** تطبيع الصلاحيات التي تراجع قبل إرسال الدعوة.

الحقول: `id`، `invitation_id FK`، `module_id FK`، `organization_id FK`، `role_template_id FK`، `access_scope`، `starts_at/ends_at`، `created_by`، التواريخ، `lock_version`.

**القيود:** Unique `(invitation_id, module_id, organization_id)`، وتحقق أن قالب الدور يتبع الموديل.

### 3.11 `user_module_access`

**الغرض:** مصدر المنح المركزية لكل مستخدم وموديل وجهة.

| الحقل | النوع | القاعدة |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK إلى `profiles.id` |
| `module_id` | `uuid` | FK إلى `platform_modules.id` |
| `organization_id` | `uuid` | FK إلى `organizations.id` |
| `role_template_id` | `uuid` | FK إلى `module_role_templates.id` |
| `access_scope` | `text` | `all_records/organization_records/assigned_records` |
| `status` | `text` | `scheduled/active/expired/revoked` |
| `starts_at/ends_at` | `timestamptz` | نهاية nullable وأكبر من البداية |
| `source` | `text` | `invitation/request/manual_migration` |
| `source_request_id` | `uuid` | nullable FK للطلب |
| `revoked_at/by/reason` | متنوع | مطلوب عند الإلغاء |
| `created_by/updated_by` | `uuid` | FK إلى `profiles.id` |
| `created_at/updated_at` | `timestamptz` | مطلوب |
| `lock_version` | `integer` | مطلوب |

**القيود:** Unique `(user_id, module_id, organization_id)` للسجل غير الملغى. FK مركب أو تحقق RPC يضمن أن `role_template_id` يتبع `module_id`. لا يسمح بدور ثان داخل المجموعة نفسها.

### 3.12 `user_access_permission_overrides` — مرحلة لاحقة

تخصيص استثنائي: `access_id`، `permission_id`، `effect allow/deny`، `reason`، `approved_by`، `starts_at/ends_at`، `status`، `lock_version`. كل Override مؤقت ومدقق؛ لا يسمح بتجاوز صلاحيات المنصة المحجوزة.

### 3.13 `permission_change_requests`

الحقول: `id uuid PK`، `request_no bigint identity UNIQUE`، `request_type add_user/change_role/change_scope/extend/revoke`، `target_user_id nullable`، `target_email nullable`، `module_id`، `organization_id`، `current_access_id nullable`، `requested_role_template_id`، `requested_scope`، `requested_starts_at/ends_at`، `business_justification`، `status new/under_review/approved/rejected/executed`، `requested_by`، `reviewed_by/at`، `decision_reason_code`، `decision_note`، `executed_by/at`، `result_access_id`، التواريخ، `lock_version`.

**القيود:** المستخدم أو البريد مطلوب، لا كلاهما فارغًا. سبب الرفض مطلوب عند `rejected`. `executed` لا يأتي إلا من `approved`. التنفيذ Idempotent باستخدام `result_access_id` وUnique على الطلب المنفذ.

### 3.14 `permission_rejection_reasons`

قائمة أسباب جاهزة: `code PK`، `label_ar`، `is_active`، `sort_order`، التواريخ. لا تحذف الأسباب المستخدمة.

### 3.15 `assignment_alerts`

الحقول: `id uuid PK`، `module_id`، `organization_id`، `disabled_user_id`، `resource_type text`، `resource_id text`، `current_assignee_id`، `status open/acknowledged/reassigned/dismissed`، `detected_at`، `assigned_to_owner_id`، `resolved_at/by`، `resolution_note`، `source_snapshot jsonb`، التواريخ، `lock_version`.

**ملاحظة:** `resource_id` عام لأن جداول الأعمال تختلف بين الموديلات. لا تنفذ إعادة الإسناد من هذا الجدول؛ يستخدم Adapter/RPC خاص بالموديل ويتحقق من المورد. يسمح RPC لمدير الموديل بالإسناد اليومي داخل نطاقه، ولـ`system_owner` بالإسناد وإعادة الإسناد عبر جميع الموديلات عند الحاجة، ويسجل نوع التدخل والسبب في Audit.

### 3.16 `access_expiration_notifications`

الحقول: `id uuid PK`، `access_id uuid FK`، `notification_type owner_warning/user_warning/expired`، `scheduled_for`، `status pending/sent/failed/cancelled`، `attempt_count`، `last_error`، `sent_at`، `created_at/updated_at`، `lock_version`.

**القيود:** Unique `(access_id, notification_type, scheduled_for)`. الإرسال Idempotent. لا تمنح المهمة المجدولة وصولًا بعد `ends_at`؛ RLS يمنعه أصلًا.

### 3.17 `audit_log_contexts` — معتمد

امتداد واحد إلى صفر/واحد لـ`audit_logs`: `audit_log_id bigint PK/FK`، `affected_user_id`، `module_id`، `organization_id`، `request_id`، `reason`، `correlation_id uuid`. يضيف فهارس للإدارة دون تغيير قيد `audit_logs.action`. يستخدم عقد JSON ثابت مؤقتًا فقط أثناء طبقة التوافق إلى أن ينفذ الامتداد المعتمد.

## 4. الفهارس المعتمدة للتنفيذ

- جميع مفاتيح FK غير المغطاة بفهرس.
- `user_module_access(user_id, module_id, organization_id)` مع فهرس جزئي للحالات الفعالة.
- `user_module_access(module_id, organization_id, status, ends_at)` للتقارير والانتهاء.
- `permission_change_requests(status, created_at)` و`(module_id, organization_id, status)`.
- `user_invitations(status, expires_at)` وUnique جزئي على `lower(email_normalized)` للحالات المفتوحة.
- `assignment_alerts(status, module_id, detected_at)`.
- `access_expiration_notifications(status, scheduled_for)` للمعالجة الدورية.
- فهارس `audit_log_contexts` على المستخدم والموديل والجهة والوقت عبر الربط بـ`audit_logs`.

## 5. قواعد الحذف والتعطيل

- FKs الإدارية تستخدم `ON DELETE RESTRICT` للمستخدم والموديل والجهة والقالب.
- لا توجد DELETE policies للمستخدمين النهائيين.
- التعطيل يملأ `status/disabled_at/disabled_by/disable_reason` ويزيد `lock_version`.
- تعطيل المستخدم لا يغير `created_by` أو `assigned_by` التاريخية.
- تعطيل الموديل لا يحذف Workspaces أو Grants أو البيانات.
- حذف مستخدم Auth غير مستخدم كمسار تشغيلي؛ التعليق وإبطال الجلسات هما المسار المعتمد.

## 6. RLS وRPC على المستوى التصميمي

- RLS مفعلة ومفروضة على جميع جداول `public` الجديدة.
- دوال التحقق الداخلية في `private`، `SECURITY DEFINER` فقط عند الحاجة، `search_path=''`، ومراجع مؤهلة.
- لا Grants لـ`anon`.
- `authenticated` يحصل على أقل صلاحية قراءة لازمة؛ الكتابات الحساسة عبر RPCs ذرية.
- RPCs تستخرج المستخدم من `(select auth.uid())` ولا تقبل دورًا من العميل.
- كل Update/Delete منطقي يستخدم `expected_lock_version` ويرفض التعارض بـ`40001`.
- التعامل مع NULL صريح باستخدام `IS NULL/IS NOT NULL/IS DISTINCT FROM`.
- عمليات الدعوة والتعطيل والمنح والقرار والتنفيذ وإعادة الإسناد تكتب Audit في المعاملة نفسها.

## 7. قرارات ERD النهائية

1. `platform_role_assignments` مستقل عن `profiles.role`، ودور منصي فعال واحد لكل مستخدم.
2. `workspaces` أساس التشغيل و`platform_modules` طبقة حوكمة واحد إلى واحد.
3. `organizations` مرجع مستقبلي مع `organization_department_mappings` انتقالية وآمنة.
4. `invitation_access_grants` يحفظ الصلاحيات المراجعة قبل قبول المستخدم.
5. قاموس Permissions normalized هو المصدر المعتمد، وليس JSON داخل قالب الدور.
6. `audit_log_contexts` امتداد معتمد مع بقاء `audit_logs` السجل المركزي.
7. `organization_records` لا يمتد إلى الجهات الفرعية إلا بعلم صريح في القالب.
8. الحساب التشغيلي الحالي لا يتحول إلى `system_owner`؛ ينشأ حساب إداري جديد ومستقل.
9. الإسناد اليومي لمدير الموديل، والتدخل الشامل عبر الموديلات لـ`system_owner` عند الحاجة.
