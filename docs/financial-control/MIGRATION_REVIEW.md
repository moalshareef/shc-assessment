# مراجعة حزمة Migration لمساحة الرقابة المالية

## 1. حالة الحزمة

هذه الحزمة **مسودة غير مطبقة**. لم يُشغّل أي SQL على Supabase أو قاعدة محلية، ولم تُنشأ migration فعلية عبر CLI.

الملفات المشمولة:

- `supabase/migrations/financial_control_schema_draft.sql`.
- `supabase/migrations/financial_control_seed_draft.sql`.
- `docs/financial-control/MIGRATION_REVIEW.md`.

لا يجوز تغيير اسم الملف إلى migration زمنية أو تشغيله قبل إغلاق الموانع والقرارات الواردة في هذه الوثيقة والحصول على موافقة صريحة من مالك المشروع.

## 2. المبادئ المطبقة

- لا تعديل أو حذف لأي جدول قائم.
- لا تعديل لقيد `workspace_members.role` الحالي.
- استخدام `financial_control_members` للأدوار: `owner`، `manager`، `specialist`، `action_owner`، `viewer`.
- ربط كل سجل رقابة مالية بـ`workspace_id`.
- إبقاء `assessment_rating` منفصلًا عن `workflow_status`.
- الحالة الابتدائية للسجلات الـ33: `imported_pending_review` — «مستورد – بانتظار المراجعة».
- عدم استخدام بيانات Git التجريبية ذات 31 ملاحظة.
- حفظ Metadata المرفقات فقط؛ لا bucket ولا Storage policies في هذه الحزمة.
- عدم إنشاء triggers تخمينية.
- عدم منح أي DELETE policy أو DELETE grant على جداول الرقابة المالية.

## 3. أنواع وعلاقات الجداول المشتركة المعتمدة

- `public.workspaces.id`: `uuid`.
- `public.profiles.id`: `uuid`، وهو مرتبط أصلًا بـ`auth.users.id`.
- `public.departments.id`: `uuid`.
- `public.audit_logs.id`: `bigint`.
- تستخدم جميع مفاتيح المستخدم التشغيلية `public.profiles(id)`، بينما تستخدم RLS هوية الجلسة `(select auth.uid())`.
- `workspace_members` قائم ولا تعدله الحزمة، ولا تغير قيد `workspace_members.role`.
- لا تعدل الحزمة أي جدول مشترك أو سياساته أو قيوده.

بنية `audit_logs` المعتمدة: `id bigint identity`، و`actor_user_id uuid`، و`table_name text`، و`record_id text`، و`action text` بقيم `INSERT/UPDATE/DELETE`، و`old_data/new_data jsonb`، و`created_at timestamptz`. يبقى قبل التطبيق التحقق من أسماء أعمدة `workspaces` التي يستخدمها Seed فقط؛ لا تستخدم casts أو أعمدة تخمينية.

## 4. الجداول المقترح إنشاؤها

1. `financial_control_members`.
2. `financial_control_source_documents`.
3. `financial_control_unit_aliases`.
4. `financial_control_escalation_rules`.
5. `financial_control_findings`.
6. `financial_control_finding_versions`.
7. `corrective_actions`.
8. `finding_assignments`.
9. `finding_comments`.
10. `finding_messages`.
11. `finding_attachments`.
12. `finding_status_history`.
13. `corrective_action_status_history`.
14. `extension_requests`.
15. `escalations`.
16. `approvals`.

المجموع **16 جدولًا جديدًا**. لا ينشأ جدول تدقيق خاص؛ يستخدم `audit_logs` المشترك. يحتوي `private` ثلاث دوال تنفيذ انتقال داخلي فقط، بينما توجد أربع دوال تحقق RLS غير معدِّلة وRPCs الثلاثة في `public` بصلاحيات صريحة. لا تنشئ الحزمة bucket أو view أو trigger.

## 5. ترتيب التنفيذ المقترح

### 5.1 فحوص ما قبل التنفيذ

1. تصوير Schema الجداول المشتركة وأعمدتها وقيودها وفهارسها وسياسات RLS الحالية.
2. التحقق من أسماء أعمدة `workspaces` وبنية أعمدة `audit_logs` الفعلية.
3. التحقق من أن `workspaces.code = 'financial-control'` غير مستخدم لمساحة أخرى.
4. التحقق من Data API grants الحالية ونسخة PostgreSQL.
5. اعتماد آلية Audit/transition transactions قبل السماح بالكتابة التشغيلية.
6. إكمال النصوص الرسمية الـ33 في seed ومراجعتها ثنائيًا.

### 5.2 ترتيب Schema

1. إنشاء `private` للدوال المساعدة.
2. إنشاء `financial_control_members`.
3. إنشاء المصادر وaliases وقواعد التصعيد.
4. إنشاء الملاحظات وإصداراتها.
5. إنشاء الإجراءات والإسنادات.
6. إنشاء التعليقات والمراسلات وMetadata المرفقات.
7. إنشاء سجلات الحالات والتمديدات والتصعيدات والاعتمادات.
8. إنشاء دوال التحقق من العضوية والوصول في `public` بصلاحيات قراءة منضبطة، ثم دوال التنفيذ داخل `private` والـWrappers العامة.
9. تفعيل وفرض RLS.
10. إنشاء السياسات.
11. ضبط Grants وعدم منح شيء إلى `anon`.

### 5.3 ترتيب Seed

1. بناء staging مؤقت للـ33 سجلًا من HTML.
2. التحقق من العدد والرموز والتقييمات والمواعيد.
3. التحقق من اكتمال النص الرسمي لكل سجل من PDF.
4. عند وجود نقص: `RAISE EXCEPTION` وإلغاء المعاملة كاملة.
5. عند اكتمال الاعتماد فقط: إنشاء Workspace إن لم يوجد.
6. إدخال مرجعي PDF وHTML.
7. إدخال aliases وقاعدة التصعيد الافتراضية.
8. إدخال الملاحظات بحالة `imported_pending_review`.
9. إدخال الإصدار الرسمي الأول.
10. إدخال إجراء تصحيحي رسمي أول لكل ملاحظة؛ يسمح بإضافة إجراءات أخرى لاحقًا.
11. إدخال حركة الاستيراد، ثم كتابة Audit تأسيسي في `audit_logs` ضمن المعاملة نفسها وفق البنية المعتمدة.
12. التحقق النهائي من العدد 33 قبل `commit`.

## 6. سياسات RLS المقترحة

### 6.1 قواعد عامة

- جميع الجداول الجديدة عليها `ENABLE ROW LEVEL SECURITY` و`FORCE ROW LEVEL SECURITY`.
- لا صلاحيات لـ`anon`.
- العضوية النشطة في `financial_control_members` شرط للوصول.
- تستخدم السياسات `TO authenticated` و`USING` و`WITH CHECK` حيث يلزم.
- حقول `workspace_id` وفاتيح الهوية غير قابلة للتحديث عبر Grants الوظيفية.
- لا توجد DELETE policies أو DELETE grants.
- لا تعتمد الصلاحيات على `user_metadata`.

### 6.2 دوال RLS المساعدة

- `public.financial_control_has_role(workspace_id, roles)`:
  يتحقق من عضوية المستخدم الحالي ودوره ونشاط العضوية.
- `public.financial_control_user_has_role(workspace_id, user_id, roles)`:
  يتحقق من أن مستخدمًا محددًا يحمل دورًا؛ يستخدم للتحقق من المدير المسند للاعتماد.
- `public.financial_control_can_read_finding(workspace_id, finding_id)`:
  يسمح بالرؤية العامة لأدوار `owner/manager/specialist/viewer`، ويقيد `action_owner` بالملاحظات التي يملك فيها إجراءً.
- `public.financial_control_can_read_item(workspace_id, finding_id, corrective_action_id)`:
  يقيد عناصر الإجراء لمسؤوله، مع الرؤية العامة للأدوار المخولة.

دوال RLS `SECURITY DEFINER` عامة لأنها مستخدمة مباشرة في تعبيرات السياسات التي تعمل بصلاحيات المستخدم؛ `search_path` فارغ، و`EXECUTE` مسحوب من `PUBLIC/anon` وممنوح فقط لـ`authenticated`. لا تعدل هذه الدوال بيانات، ولا تمنح أي انتقال حالة.

### 6.3 قائمة السياسات

#### `financial_control_members`

- SELECT: المستخدم يرى عضويته؛ `owner/manager` يريان أعضاء Workspace.
- INSERT: `owner` فقط من العميل؛ `system_admin` عبر مسار إداري موثوق.
- UPDATE: `owner` فقط، وعلى أعمدة الدور والنشاط والتواريخ المحددة.
- DELETE: ممنوع.

#### المصادر وaliases وقواعد التصعيد

- SELECT: جميع أعضاء الرقابة المالية النشطين.
- INSERT/UPDATE/DELETE: غير ممنوحة للعميل؛ migration أو مسار إداري معتمد فقط.

#### `financial_control_findings`

- SELECT: `owner/manager/specialist/viewer` داخل Workspace؛ `action_owner` للملاحظات المرتبطة بإجراء مسؤول عنه.
- UPDATE: `manager/specialist`، وعلى الحقول التشغيلية الممنوحة فقط.
- INSERT/DELETE: غير ممنوحة للعميل.
- `workflow_status` غير ممنوح للتحديث المباشر؛ يحتاج معاملة انتقال معتمدة.

#### `financial_control_finding_versions`

- SELECT: من يستطيع قراءة الملاحظة.
- الكتابة والحذف: غير ممنوحة للعميل.

#### `corrective_actions`

- SELECT: `owner/manager/specialist/viewer` داخل Workspace؛ `action_owner` لإجراءاته فقط.
- INSERT: `manager`.
- UPDATE: `manager/specialist` أو مسؤول الإجراء نفسه، وعلى حقول التنفيذ الممنوحة.
- `workflow_status` و`current_due_date` غير ممنوحين للتحديث المباشر.
- DELETE: ممنوع.

#### `finding_assignments`

- SELECT: `owner/manager/specialist/viewer`، والمستخدم لإسناداته.
- INSERT/UPDATE: `manager`.
- DELETE: ممنوع؛ ينتهي الإسناد بواسطة `ends_at`.

#### `finding_comments` و`finding_messages`

- SELECT: حسب صلاحية الملاحظة والإجراء.
- INSERT: `manager/specialist`، و`action_owner` في إجراءاته فقط.
- UPDATE/DELETE: غير ممنوحة؛ التصحيح بسجل جديد.

#### `finding_attachments`

- SELECT: حسب صلاحية الملاحظة والإجراء.
- INSERT: `manager/specialist`، و`action_owner` لإجراءاته، مع حالة مراجعة ابتدائية `pending`.
- UPDATE مراجعة Metadata: `manager/specialist` فقط.
- DELETE: ممنوع.
- لا توجد سياسات `storage.objects` لأن bucket غير منشأ في هذه المرحلة.

#### سجلات الحالات

- SELECT: حسب صلاحية الملاحظة/الإجراء.
- INSERT/UPDATE/DELETE: غير ممنوحة من Data API؛ يجب أن تكتبها معاملة انتقال موثوقة.

#### `extension_requests`

- SELECT: حسب الملاحظة والإجراء.
- INSERT: `specialist/action_owner/manager` ضمن نطاقهم وبحالة `draft/submitted` فقط.
- UPDATE القرار: `manager`.
- DELETE: ممنوع.

#### `escalations`

- SELECT: من يستطيع قراءة الملاحظة.
- INSERT/UPDATE: `manager/owner`.
- التصعيد الآلي يحتاج Scheduler/وظيفة موثوقة غير موجودة في هذه المسودة.
- DELETE: ممنوع.

#### `approvals`

- SELECT: من يستطيع قراءة الملاحظة.
- INSERT طلب: `specialist/manager`، مع مدير مسند يحمل دور `manager`.
- UPDATE القرار: `manager`.
- DELETE: ممنوع.

#### `audit_logs` المشترك

- لا تنشئ الحزمة جدول تدقيق بديلًا ولا تعدل `audit_logs` أو سياساته.
- تكتب دوال الانتقال المعتمدة القيم السابقة والجديدة والمستخدم والوقت والسبب في `audit_logs` داخل المعاملة نفسها.
- عدم نجاح كتابة Audit يلغي انتقال الحالة كاملًا.

### 6.4 RPCs الانتقال الذرية المنشأة داخل المسودة

تحتوي مسودة Schema على Wrappers عامة `SECURITY DEFINER` وثلاث دوال تنفيذ داخل `private` بـ`SECURITY DEFINER`، وجميعها تستخدم `SET search_path = ''` ومراجع مؤهلة باسم schema. كل Wrapper يتحقق بنفسه من `auth.uid()`، ويستخرج `workspace_id` من السجل، ويجمع أدوار المستخدم من `public.financial_control_members` مع شرط العضوية النشطة، ثم يستدعي التنفيذ الداخلي. يعيد التنفيذ التحقق من الدور المحدد للانتقال والحالة الحالية و`lock_version`، ثم يقفل السجل بـ`FOR UPDATE` ويحدثه ويضيف التاريخ ويكتب التدقيق. أي خطأ يلغي العملية كاملة داخل معاملة الاستدعاء نفسها.

1. `public.financial_control_transition_finding(p_finding_id uuid, p_to_status text, p_reason text, p_expected_lock_version integer)`:
   يستدعي `private.financial_control_transition_finding_tx(...)` لتحديث الملاحظة، وإضافة `finding_status_history`، وكتابة `audit_logs` ذريًا.
2. `public.financial_control_transition_action(p_corrective_action_id uuid, p_to_status text, p_reason text, p_expected_lock_version integer)`:
   يستدعي `private.financial_control_transition_action_tx(...)` لتحديث الإجراء، وإضافة `corrective_action_status_history`، وكتابة `audit_logs` ذريًا.
3. `public.financial_control_decide_extension(p_extension_request_id uuid, p_decision text, p_decision_note text, p_expected_action_lock_version integer)`:
   يستدعي `private.financial_control_decide_extension_tx(...)` لتسجيل قرار المدير، وإنشاء سجل قرار في `approvals`، وتحديث تاريخ استحقاق الإجراء عند الموافقة، وإضافة تاريخ تغيير الاستحقاق، وكتابة التدقيق في معاملة واحدة.

#### انتقالات الملاحظة المتحققة

- `imported_pending_review → not_started`: `specialist/manager`، مع إسناد مختص نشط وإجراء واحد على الأقل.
- `not_started → in_progress`: `specialist/manager`، بعد بدء إجراء واحد على الأقل.
- `in_progress → awaiting_action_owner → in_progress`: `specialist`.
- `in_progress/returned_for_revision → submitted_for_manager_review`: `specialist`، بعد تحقق الإجراءات.
- `reopened → in_progress`: `specialist/manager`.
- `submitted_for_manager_review → under_manager_review`: `manager`.
- `under_manager_review → returned_for_revision/approved`: `manager`؛ سبب الإرجاع إلزامي، والاعتماد يتطلب اكتمال الإجراءات وقبول الأدلة.
- `approved → closed`: `manager` مع إنجاز 100%.
- `closed → reopened`: `manager` مع سبب إلزامي.

#### انتقالات الإجراء المتحققة

- `not_started → in_progress`: `action_owner` المسؤول أو `specialist`.
- `in_progress → blocked` و`blocked → in_progress`: المسؤول أو `specialist` مع سبب إلزامي.
- `in_progress/returned_for_revision → submitted_for_specialist_review`: `action_owner` المسؤول، مع تفاصيل تنفيذ ودليل.
- `submitted_for_specialist_review → under_specialist_review`: `specialist`.
- `under_specialist_review → returned_for_revision/specialist_verified`: `specialist`؛ الإرجاع بسبب إلزامي والتحقق يحتاج دليلًا مقبولًا بلا مراجعة معلقة.
- `specialist_verified → completed`: `specialist` مع إنجاز 100%.
- `completed → in_progress`: `manager` مع سبب إعادة فتح إلزامي.

#### قرار التمديد

- يقبل فقط طلبًا بحالة `submitted` وقرارًا `approved/rejected` من `manager`.
- الرفض يحتاج سببًا إلزاميًا.
- الموافقة تحدث `current_due_date` و`lock_version` للإجراء، وتضيف سجلًا في `corrective_action_status_history`؛ القراران يسجلان في `approvals`.

لا يمنح العميل UPDATE مباشرًا لعمودي `workflow_status`. تكتب الدوال في `audit_logs` باستخدام اسم الجدول الفعلي وUUID كنص و`action = 'UPDATE'` ولقطتي الصف قبل/بعد؛ يحفظ السبب أيضًا داخل History ويضاف إلى `new_data` باسم تقني يبدأ بشرطة سفلية.

استخدام `SECURITY DEFINER` في الـWrappers **مقصود**: يسمح لمالك Wrapper وحده باستدعاء دوال `private` دون منح `authenticated` أي `USAGE` على schema أو `EXECUTE` على التنفيذ الداخلي. سحب الصلاحيات من `PUBLIC/anon/authenticated` يمنع استدعاء دوال `private` مباشرة، بينما لا يمنح التنفيذ إلا للـWrappers العامة الثلاثة. لا تقبل RPCs دورًا من العميل؛ الأدوار تُقرأ من جدول العضوية فقط.

## 7. الاستفادة من البنية الحالية

### `workspaces`

- FK لجميع الجداول عبر `workspace_id`.
- Seed يستخدم `code = 'financial-control'` ويضيف Workspace فقط إذا لم يوجد.
- لا يعدل سجل Workspace قائمًا.

### `workspace_members`

- لا يعدل الجدول أو قيد أدواره الحالي: `owner, manager, member, viewer`.
- لا يستخدم لمنح أدوار الرقابة المالية المتخصصة.

### `profiles`

- يبقى مصدر بيانات العرض ودور `system_admin` العام.
- تستخدم جميع FKs للمستخدم `profiles.id` المعتمد، وهو مرتبط أصلًا بـ`auth.users.id`.
- تستخدم سياسات RLS `(select auth.uid())` لمطابقة `profiles.id`، ولا تعتمد على `user_metadata`.
- لا يفترض SQL اسم عمود `system_admin` ولا يمنحه اعتماد الملاحظات.

### `departments`

- تستخدمه الملاحظات والإجراءات والإسنادات وaliases عند توفر القسم المطابق.
- يمكن بقاء FK فارغًا مع حفظ الاسم الرسمي إلى أن يكتمل قاموس المطابقة.
- الاسم الرسمي المالي «إدارة الشؤون المالية»، و«الإدارة المالية» alias استيراد.

### `audit_logs`

- لا يعدل ولا يحذف ولا تضاف له سياسات في المسودة.
- هو سجل التدقيق المركزي الوحيد، و`id` فيه من نوع `bigint`.
- لا ينشأ `financial_control_audit_log` ولا يوجد سجل مكرر أو مزامنة مزدوجة.
- Mapping أعمدته معتمد ومستخدم في RPCs. يبقى Seed محظورًا لأنه خارج نطاق هذا التحديث ولم تضاف إليه كتابة التدقيق التأسيسية.

## 8. Seed وحالة البيانات الرسمية

- staging يحتوي **33 سجلًا** مستخرجًا من `INITIAL_DATA`.
- التقييم: 19 `partially_effective` و14 `not_exists`.
- المواعيد: 2 في 30 سبتمبر 2026، و3 في 31 ديسمبر 2026، و28 في 30 يونيو 2027.
- جميع السجلات المستوردة تبدأ `imported_pending_review` بعد نجاح الاستيراد.
- السجل `1.6` يجب أن يستخدم رسميًا «وحدة إدارة المخاطر واستمرارية الأعمال»، مع إبقاء alias HTML «غير محدد» للمطابقة.
- «إدارة الشؤون المالية» الاسم الرسمي، والمسميات السابقة aliases.

### مانع التنفيذ الحالي

عدد النصوص الرسمية المكتملة والمراجعة في Seed هو **0 من أصل 33**. أمكن استخراج طبقة نص من PDF، لكنها تحتوي استبدالات وأخطاء ترميز عربية جوهرية داخل النص الرسمي، مثل ظهور «المخاار» بدل «المخاطر» و«الاوابط» بدل «الضوابط». لذلك لا تعد أي بطاقة مكتملة بثقة، ولا تنقل الصور بدل النصوص ولا تصحح النصوص بالتخمين.

السجلات غير المكتملة بوضوح هي:

`1.1`، `1.2`، `1.3`، `1.6`، `1.7`، `1.8`، `1.9`، `1.11`، `1.12`، `1.14`، `1.15`، `1.16`، `1.17`، `1.18`، `1.20`، `1.21`، `2.2`، `2.3`، `2.4`، `2.5`، `2.6`، `2.8`، `2.9`، `2.11`، `2.12`، `2.13`، `2.15`، `2.16`، `2.17`، `2.18`، `2.19`، `2.20`، `2.22`.

الحقول الرسمية الناقصة في staging:

- العنوان.
- محور التقييم والنشاط عند توفرهما.
- مرجع الضابط.
- ملخص الضابط.
- نص الملاحظة الرسمي.
- الأثر/الخطر.
- خطة العمل الرسمية.
- المسؤول الرسمي لكل سجل.

لذلك يرفع Seed حاليًا `RAISE EXCEPTION` قبل إنشاء Workspace أو أي INSERT دائم، ثم يحتوي حاجز تدقيق قديمًا لم يُعدّل في هذه المرحلة التزامًا بمنع تعديل Seed. لا يزال المسؤول الرسمي للسجل `1.6` مصححًا إلى «وحدة إدارة المخاطر واستمرارية الأعمال»، مع الاحتفاظ بـalias HTML «غير محدد». يجب استكمال النصوص الـ33 بمراجعة بشرية موثقة وتحديث كتابة التدقيق التأسيسية في مرحلة Seed مستقلة قبل إزالة الحاجزين.

## 9. التعارضات والمخاطر المحتملة

1. **أسماء أعمدة Workspace:** أنواع المفاتيح وبنية `audit_logs` معتمدة؛ تبقى أسماء أعمدة `workspaces` المستخدمة في Seed بحاجة تحقق فعلي.
2. **مطابقة الهوية:** FKs تستخدم `profiles.id` وRLS يستخدم `auth.uid()` بناء على العلاقة المؤكدة؛ يجب اختبار المستخدم غير ذي Profile كحالة منع.
3. **RPCs تحتاج اختبار قاعدة فعلية:** التنفيذ الذري مكتمل ساكنًا، لكنه لم يطبق أو يختبر على PostgreSQL/Supabase تنفيذًا لحدود هذه المرحلة.
4. **انتقالات الحالات:** التحديث المباشر لـ`workflow_status` غير ممنوح، وتتحقق RPCs من المصفوفة والـ`lock_version`.
5. **Storage:** لا bucket ولا `storage.objects` policies؛ Metadata لا يثبت وجود الملف حتى المرحلة اللاحقة.
6. **مالك دوال SECURITY DEFINER:** يجب أن يكون دورًا موثوقًا غير قابل لانتحال أو إنشاء كائنات من العميل، مع إبقاء `search_path` فارغًا.
8. **Data API grants:** يجب التأكد أن schema `public` معروض وأن Grants المطلوبة مناسبة لإعداد المشروع.
9. **تعدد الأدوار:** `financial_control_members` يسمح بأكثر من دور للمستخدم؛ يجب أن تتعامل الواجهة مع تجميع الصلاحيات.
10. **القسم المالي:** alias يمنع التكرار، لكن ربط `departments.id` يحتاج مطابقة فعلية.
11. **استخراج PDF:** طبقة النص الحالية لا تحفظ بعض الحروف العربية بثقة، لذلك لا يوجد نص رسمي مكتمل في Seed.
12. **Seed غير مكتمل عمدًا:** تشغيله الآن يفشل ويعمل rollback كامل؛ هذه حماية مقصودة.

## 10. قرارات ما زالت تحتاج موافقة

1. اعتماد أسماء أعمدة `workspaces` بعد فحص Schema الحقيقي.
2. اعتماد الصلاحية الدقيقة لمالك Workspace في إدارة `financial_control_members` مقابل `system_admin`.
3. اعتماد آلية حساب تقدم الملاحظة من عدة إجراءات.
4. اعتماد قيمة `higher_level_target_label` لكل قاعدة تصعيد؛ تبقى قابلة للتهيئة ولا تربط بمسمى ثابت.
5. اعتماد النصوص الرسمية المستخرجة والمراجعة للسجلات الـ33 قبل إزالة حاجز Seed.
6. اعتماد سياسة الاحتفاظ قبل حزمة Storage اللاحقة. مدة Signed URL المقترحة والمعتمدة للتصميم **10 دقائق**.

## 11. طريقة التراجع المقترحة

### قبل التطبيق

لا يلزم تراجع؛ الملفات مسودات فقط ولم تطبق.

### إذا اعتمدت الحزمة وطبقت لاحقًا

- ينشأ ملف rollback مستقل بعد أخذ نسخة احتياطية والتحقق من عدم وجود بيانات تشغيلية جديدة.
- يحذف فقط كائنات الرقابة المالية التي أنشأتها الحزمة، بترتيب عكسي للعلاقات.
- لا يحذف أو يعدل `workspaces` أو `workspace_members` أو `profiles` أو `departments` أو `audit_logs`.
- لا يحذف Workspace قائمًا قبل الحزمة.
- إذا أنشأ seed Workspace جديدًا، لا يحذف إلا بعد إثبات أنه أنشئ بالحزمة وأنه خالٍ من علاقات أخرى.
- يحفظ تصدير Audit وبيانات الرقابة قبل أي إسقاط.

الترتيب العكسي العام:

1. إلغاء Grants وسياسات RLS الجديدة.
2. إسقاط دوال `private` الخاصة بالرقابة المالية.
3. إسقاط الاعتمادات والتصعيدات والمرفقات والرسائل والتعليقات وسجلات الحالات والتمديدات؛ لا يمس `audit_logs` المشترك.
4. إسقاط الإسنادات والإجراءات والإصدارات والملاحظات.
5. إسقاط القواعد وaliases والمصادر والعضويات.
6. إسقاط schema `private` فقط إذا لم يحتو أي كائن آخر.

لا تنفذ عملية التراجع تلقائيًا أو داخل هذه المسودة.

## 12. اختبارات التحقق بعد التنفيذ المستقبلي

### 12.1 اختبارات Schema

- وجود الجداول الجديدة الـ16 فقط بالأسماء المعتمدة.
- وجود كل PK/FK/Check/Unique index.
- تطابق أنواع FKs مع الجداول المشتركة.
- عدم تغير تعريف أو قيود الجداول المشتركة.
- بقاء `workspace_members.role` كما هو.
- عدم إنشاء bucket أو trigger.

### 12.2 اختبارات RLS والمنع

- المستخدم غير المصادق لا يرى أي سجل.
- `viewer` يقرأ ولا يكتب ولا يصدر حسب التطبيق.
- `action_owner` يرى إجراءاته ولا يرى إجراءات غيره.
- `specialist` يراجع ويحدث الحقول التشغيلية دون تعديل النص الرسمي.
- `manager` يدير الإسناد والقرارات ضمن Workspace فقط.
- `owner` يرى ويصعد ولا يعتمد الملاحظات من التطبيق.
- مستخدم Workspace آخر لا يستطيع الوصول عبر UUID معروف.
- محاولات UPDATE/DELETE على سجلات الحالات تفشل، ولا تمنح الحزمة أي صلاحية على `audit_logs`.
- محاولات تغيير `workspace_id` أو حقول النص الرسمي تفشل.
- محاولات INSERT approval بمدير غير صالح تفشل.

### 12.3 اختبارات Seed

- تشغيل المسودة الحالية يفشل عند حاجز النص الرسمي ولا يترك Workspace أو بيانات جزئية؛ عدد النصوص المكتملة حاليًا 0/33.
- بعد تعبئة النصوص واعتمادها: العدد النهائي 33 والرموز فريدة.
- التقييمات 19/14.
- توزيع المواعيد 2/3/28.
- الحالة لكل سجل `imported_pending_review`.
- وجود إصدار رسمي أول وإجراء رسمي أول لكل ملاحظة.
- مسؤول `1.6` مطابق للـPDF.
- لا توجد أي قيمة من بيانات Git التجريبية ذات 31 ملاحظة.
- إعادة تشغيل seed لا تنشئ Workspace أو مصادر أو ملاحظات أو إجراءات مكررة.

### 12.4 اختبارات Audit والمعاملات — مانع قبل الإطلاق

- كل انتقال حالة يكتب القيم السابقة والجديدة والمستخدم والوقت والسبب في المعاملة نفسها.
- فشل كتابة Audit يلغي التغيير التشغيلي كاملًا.
- يفشل UPDATE المباشر لـ`financial_control_findings.workflow_status` و`corrective_actions.workflow_status` من العميل.
- لا يستطيع `anon` تنفيذ أي Helper أو RPC، ولا يملك `authenticated` أي `USAGE/EXECUTE` على `private`؛ تنفيذ الانتقال ممنوح للـWrappers العامة فقط.
- قرار التمديد يحدث الاستحقاق ويكتب History وAudit ذريًا.
- الإغلاق وإعادة الفتح يطبقان شروطهما ويحتفظان بالتاريخ السابق.
- لا يستطيع `system_admin` تعديل أو حذف Audit أو اعتماد ملاحظة.

### 12.5 نتيجة الفحص الساكن الحالية

- ترتيب إنشاء الجداول يسبق جميع المفاتيح المركبة التي تعتمد عليها العلاقات.
- كل FK للمستخدم يتجه إلى `public.profiles(id)`، وكل FK مشترك مطابق للأنواع المؤكدة: `uuid`؛ لا يستخدم `audit_logs.id` كـFK في الجداول الجديدة.
- لا توجد سياسة RLS دائرية: فحص العضوية داخل السياسات يمر عبر Helpers عامة `SECURITY DEFINER`، ولا تستدعي Helpers سياسات الجداول التابعة.
- دوال RLS الأربع غير المعدِّلة في `public` وممنوحة لـ`authenticated` لأن PostgreSQL يشترط وصول المستخدم إلى الدوال المستخدمة في تعبيرات السياسات؛ دوال التنفيذ الثلاث وحدها في `private`.
- لا يملك `authenticated` أو `anon` أي `USAGE` على `private` أو `EXECUTE` على دوال التنفيذ الداخلية.
- الـWrappers العامة الثلاثة `SECURITY DEFINER` هي نقاط انتقال الحالة الوحيدة الممنوحة لـ`authenticated`، وتتحقق من `auth.uid()` والعضوية وWorkspace قبل التنفيذ.
- كل الدوال تستخدم `SET search_path = ''`، وكل مراجع الجداول والدوال مؤهلة باسم schema، ولا يوجد Dynamic SQL.
- لا يوجد `TO anon` أو Grant إلى `anon`، ولا توجد DELETE policy أو DELETE grant.
- لا توجد أوامر `ALTER/UPDATE/DELETE` على `workspaces` أو `workspace_members` أو `profiles` أو `departments` أو `audit_logs`.
- قيود الجداول الجديدة تسقط بالاسم ثم تعاد إضافتها، وسياسات الجداول الجديدة تعاد إنشاؤها، لتحسين قابلية إعادة التشغيل؛ لا توجد UUIDs ثابتة.
- Schema **جاهزة كمسودة للتطبيق على قاعدة اختبار** بعد إغلاق المانع الأمني؛ لا يوجد مانع تصميمي متبقٍ في صلاحيات RPCs. يبقى parse والتنفيذ التجريبي واختبارات المعاملات/RLS وDatabase Advisors بوابة تحقق إلزامية قبل الإنتاج، ولم تنفذ في هذه المرحلة.
- Seed لا يزال **غير جاهز للتطبيق** لأن النصوص الرسمية المكتملة 0/33 ولأن كتابة `audit_logs` التأسيسية غير معتمدة.

## 13. مراجع Supabase الرسمية التي روجعت

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): تفعيل RLS على الجداول في schema معروض، واستخدام `USING` و`WITH CHECK`، وضرورة SELECT policy لعمليات UPDATE.
- [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control): سياسات Storage تعتمد على `storage.objects`، وعمليات upsert تحتاج صلاحيات إضافية؛ لم تنشأ في هذه الحزمة.
- [Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): الملفات الخاصة تخضع للتحكم بالوصول ويمكن خدمتها بروابط موقعة محدودة المدة؛ إنشاء bucket مؤجل.

## 14. مسودة التشديد الأمني لدوال RLS

الملف `supabase/migrations/financial_control_security_hardening_draft.sql` مسودة تكميلية فقط، ولم تُطبق على Supabase. نطاقها محصور في دوال RLS وسياسات جداول الرقابة المالية؛ لا تنشئ أو تعدل جدولًا، ولا تغير بيانات، ولا تمس Seed أو React أو دوال الركائز القديمة.

### 14.1 الدوال المنقولة من `public` إلى `private`

- `financial_control_has_role(uuid, text[])`
- `financial_control_user_has_role(uuid, uuid, text[])`
- `financial_control_can_read_finding(uuid, uuid)`
- `financial_control_can_read_item(uuid, uuid, uuid)`

تعاد الدوال الأربع داخل `private` بصيغة `SECURITY DEFINER` و`SET search_path = ''`، وبمراجع مؤهلة مثل `public.financial_control_members` و`public.corrective_actions` و`auth.uid()` و`pg_catalog.now()`. وبعد تحويل جميع الاعتمادات، تسحب صلاحيات النسخ العامة ثم تسقط هذه النسخ.

الدوال الداخلية التالية يعاد تعريفها دون تغيير منطقها أو توقيعاتها؛ التغيير الوحيد هو استبدال استدعاء `public.financial_control_has_role` باستدعاء `private.financial_control_has_role` حتى لا تتعطل RPCs بعد إسقاط النسخة العامة:

- `private.financial_control_transition_finding_tx`
- `private.financial_control_transition_action_tx`
- `private.financial_control_decide_extension_tx`

لا تعيد المسودة إنشاء أو تعديل RPCs العامة الثلاث: `public.financial_control_transition_finding` و`public.financial_control_transition_action` و`public.financial_control_decide_extension`.

### 14.2 السياسات المتغيرة

تعدل المسودة تعبيرات السياسات الـ33 القائمة فقط، مع الإبقاء على نوع العملية والدور `authenticated` والسلوك الوظيفي دون تغيير. تغطي الجداول الـ16 التالية:

1. `financial_control_members` — ثلاث سياسات.
2. `financial_control_source_documents` — سياسة واحدة.
3. `financial_control_unit_aliases` — سياسة واحدة.
4. `financial_control_escalation_rules` — سياسة واحدة.
5. `financial_control_findings` — سياستان.
6. `financial_control_finding_versions` — سياسة واحدة.
7. `corrective_actions` — ثلاث سياسات.
8. `finding_assignments` — ثلاث سياسات.
9. `finding_comments` — سياستان.
10. `finding_messages` — سياستان.
11. `finding_attachments` — ثلاث سياسات.
12. `finding_status_history` — سياسة واحدة.
13. `corrective_action_status_history` — سياسة واحدة.
14. `extension_requests` — ثلاث سياسات.
15. `escalations` — ثلاث سياسات.
16. `approvals` — ثلاث سياسات.

كل مرجع في هذه السياسات إلى `public.financial_control_has_role` أو `public.financial_control_user_has_role` أو `public.financial_control_can_read_finding` أو `public.financial_control_can_read_item` يتحول إلى النسخة المناظرة داخل `private`.

### 14.3 الصلاحيات النهائية المقترحة

- `anon`: لا `USAGE` على schema `private` ولا `EXECUTE` على الدوال الأربع.
- `authenticated`: يحتفظ بـ`USAGE` على `private` اللازم أيضًا لسياسات الركائز الحالية، ويمنح `EXECUTE` على دوال RLS الأربع فقط بالقدر الذي يتطلبه PostgreSQL لتقييم السياسات.
- الدوال الداخلية الثلاث `*_tx`: لا `EXECUTE` لـ`PUBLIC` أو `anon` أو `authenticated`، وتبقى قابلة للوصول من RPCs العامة ذات `SECURITY DEFINER` فقط.
- النسخ الأربع في `public`: تسحب صلاحيات `PUBLIC` و`anon` و`authenticated` ثم تسقط، ولذلك لا تظهر كنقاط RPC في Data API.
- RPCs العامة الثلاث: لا تتغير صلاحياتها أو توقيعاتها.

لا يوفر PostgreSQL صلاحية `EXECUTE` مقيدة بموقع الاستدعاء «داخل السياسة فقط». الحد الأدنى الآمن هنا هو وضع helper في schema غير معروض، ومنع `anon`، ومنح `authenticated` ما يلزم لتقييم RLS فقط، مع اقتصار نتائج الدوال على `boolean` وربط قراراتها بـ`auth.uid()` والعضوية الفعلية.

### 14.4 ترتيب التنفيذ والذرية

1. بدء معاملة واحدة وضبط مهلة الأقفال والتعليمات محليًا.
2. إنشاء دوال RLS الأربع داخل `private` وضبط صلاحياتها.
3. إعادة تعريف دوال التنفيذ الداخلية الثلاث لتستخدم helper الخاص.
4. تعديل تعبيرات السياسات الـ33 على الجداول الـ16.
5. سحب صلاحيات النسخ العامة الأربع وإسقاطها.
6. تنفيذ `COMMIT`.

أي خطأ قبل `COMMIT` يعيد جميع الخطوات تلقائيًا، فلا تبقى حالة وسطية تجمع سياسات جديدة مع دوال ناقصة.

### 14.5 خطة التراجع

بعد نجاح التطبيق مستقبلًا، يكون التراجع عبر Migration عكسية مستقلة داخل معاملة واحدة:

1. إعادة إنشاء الدوال الأربع السابقة داخل `public` مع ACL السابق.
2. إعادة تعريف الدوال الداخلية الثلاث لتستدعي `public.financial_control_has_role`.
3. إعادة تعبيرات السياسات الـ33 إلى مراجع `public.financial_control_*` السابقة.
4. سحب `EXECUTE` على دوال RLS الأربع داخل `private` ثم إسقاطها.

لا يتضمن التراجع أي تعديل للجداول أو البيانات أو RPCs العامة أو دوال الركائز. يجب اختبار مسار التراجع على بيئة اختبار قبل اعتماد تطبيق مسودة التشديد.

### 14.6 بوابة التحقق قبل التطبيق

- Parse فعلي للملف على قاعدة اختبار متطابقة.
- التأكد أن السياسات الـ33 ما زالت مرتبطة بالجداول والأوامر والأدوار نفسها.
- اختبار أدوار `owner` و`manager` و`specialist` و`action_owner` و`viewer` ومستخدم غير عضو.
- اختبار RPCs الانتقالية الثلاث بعد حذف نسخ helpers من `public`.
- التحقق أن `anon` لا يملك `USAGE` أو `EXECUTE` فعالًا.
- التأكد أن سياسات الركائز السبع ودوالها القديمة لم تتغير.
- تشغيل Database Advisors للأمان والأداء بعد التطبيق التجريبي.
