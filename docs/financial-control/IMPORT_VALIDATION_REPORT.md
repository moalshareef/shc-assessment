# تقرير التحقق النهائي من Seed الرقابة المالية

## الحالة

- الحالة: مسودة Seed نهائية جاهزة للمراجعة والتطبيق بعد موافقة صريحة مستقلة.
- لم يُطبق Seed ولم يتم الاتصال بـ Supabase.
- لم يُعدّل React أو أي Migration أخرى.
- ملف المصدر النهائي في المستودع هو `data/financial-control/findings_import_review.json`.
- التقرير الموثّق المرجعي: `docs/financial-control/IMPORT_VALIDATION_REPORT_VERIFIED.md`.

## نتيجة التحقق من JSON

| الفحص | المتوقع | الفعلي | النتيجة |
|---|---:|---:|---|
| إجمالي السجلات | 33 | 33 | ناجح |
| الأكواد الفريدة | 33 | 33 | ناجح |
| `case_id` الفريدة | 33 | 33 | ناجح |
| `partially_effective` / شبه فعال | 19 | 19 | ناجح |
| `not_exists` / غير موجود | 14 | 14 | ناجح |
| تاريخ `2026-09-30` | 2 | 2 | ناجح |
| تاريخ `2026-12-31` | 3 | 3 | ناجح |
| تاريخ `2027-06-30` | 28 | 28 | ناجح |
| مسؤول السجل `1.6` | وحدة إدارة المخاطر واستمرارية الأعمال | مطابق | ناجح |

جميع السجلات تحمل `source_html_verified=true` و`source_pdf_verified=true` و`requires_manual_review=false`. كما أن العنوان والنص الرسمي والضابط أو المعيار والتوصية والمسؤول الرسمي غير فارغة في السجلات الـ33.

## البيانات التي سيضيفها Seed

- 33 سجلًا في `public.financial_control_findings` بالحالة `imported_pending_review`.
- 33 إجراءً في `public.corrective_actions`؛ لأن `corrective_plan` موثقة وغير فارغة في جميع السجلات. قاعدة الإدخال لا تنشئ إجراءً عندما تكون الخطة `null` أو فارغة.
- سجل Audit تأسيسي من نوع `INSERT` لكل ملاحظة ولكل إجراء في `public.audit_logs`، مع `actor_user_id=null` لأن Migration ليست جلسة مستخدم، وإضافة `_seed_source=findings_import_review_v1` داخل `new_data`.
- سجل واحد لمصدر التقرير الرسمي في `public.financial_control_source_documents` عند عدم وجوده.

لا ينشئ Seed Workspace جديدًا؛ بل يشترط وجود Workspace واحد فقط بالرمز `financial-control` ويتوقف إذا كان مفقودًا أو مكررًا.

## مطابقة JSON مع المخطط

| حقل JSON | حقل قاعدة البيانات |
|---|---|
| `code` | `reference_code` |
| `case_id` | `case_code` |
| `official_title` | `title` |
| `control_or_standard` | `control_reference` و`control_summary` |
| `official_finding_text` | `official_finding_text` و`official_risk_impact` |
| `official_responsible_unit` | `official_owner_label` |
| `responsible_unit_html_value` | `imported_owner_alias` |
| `target_date` | `official_due_date` و`current_due_date` |
| `corrective_plan` | `corrective_actions.official_action_text` |

تكرار النص نفسه في `control_reference/control_summary` و`official_finding_text/official_risk_impact` مقصود للحفاظ على النص الموثق دون تقسيم لغوي تخميني؛ يمكن فصل الأجزاء لاحقًا في مراجعة لغوية مستقلة مع versioning وAudit.

## الذرية ومنع التكرار

- الملف محاط بـ `BEGIN` و`COMMIT` ويستخدم `RAISE EXCEPTION` لإلغاء المعاملة كاملة عند أول عدم تطابق.
- لا يحتوي على UUIDs ثابتة؛ تعتمد المعرفات على القيم الافتراضية للجداول.
- يمنع تكرار الملاحظات باستخدام `workspace_id` مع `reference_code`، ويتحقق كذلك من `case_code`.
- يتوقف إذا كان code أو case_id قائمًا لكنه يشير إلى سجل مختلف.
- يمنع تكرار الإجراءات باستخدام `(finding_id, action_no)`، ويستخدم `action_no=1` للخطة الرسمية الموثقة.
- Audit يكتب فقط للصفوف التي أُنشئت في التنفيذ نفسه، ولذلك لا يتكرر عند إعادة تشغيل Seed.

## حواجز التحقق داخل SQL

قبل أي إدخال دائم يتحقق Seed من:

1. العدد 33، وفرادة 33 code و33 case_id.
2. توزيع التقييمات 19 و14.
3. توزيع التواريخ 2 و3 و28.
4. المسؤول الرسمي للسجل 1.6.
5. اكتمال أعلام التحقق والحقول الرسمية.
6. وجود Workspace واحد بالرمز `financial-control`.
7. عدم وجود تعارضات بين code وcase_id والسجلات القائمة.

بعد الإدخال يتحقق من وجود 33 ملاحظة، وعدد الإجراءات المطابق للخطط الموثقة، وسجلات Audit التأسيسية. أي فشل يلغي المعاملة كاملة.

## الجاهزية

- السجلات الجاهزة: **33 من 33**.
- الإجراءات التصحيحية الجاهزة: **33 من 33**.
- Seed جاهز للتطبيق من ناحية المحتوى والبنية والفحوص الساكنة، لكنه ما زال **غير مطبق** ويحتاج موافقة تنفيذ صريحة منفصلة.
- اسم ملف JSON واسم مرجع PDF موحدان مع الأسماء النهائية المعتمدة.
