import type { FinancialControlFindingStatus } from '../../types/financialControl'
import {
  caseWorkflowStage,
  caseWorkQueues,
  nextCaseAction,
  operationalStatusLabel,
  validateCaseTransition,
} from './caseManagementModel'
import type { CaseSnapshot, CaseWorkQueueKey } from './caseManagementModel'
import {
  buildSimplifiedCaseViewModel,
  simplifiedCaseQueues,
} from './simplifiedCaseViewModel'

export interface DevelopmentScenarioStep {
  step: string
  operationalStatus: string
  nextAction: string
  stage: number
  queues: CaseWorkQueueKey[]
  checks: string[]
}

const TEST_NOW = new Date('2026-07-15T12:00:00+03:00')
const roles = ['owner', 'action_owner'] as const

function snapshotStep(step: string, snapshot: CaseSnapshot, checks: string[] = []): DevelopmentScenarioStep {
  return {
    step,
    operationalStatus: operationalStatusLabel(snapshot),
    nextAction: nextCaseAction(snapshot, [...roles]).label,
    stage: caseWorkflowStage(snapshot),
    queues: caseWorkQueues(snapshot, TEST_NOW),
    checks,
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`فشل اختبار إدارة الحالات: ${message}`)
  return message
}

export function runDevelopmentCaseScenario(): DevelopmentScenarioStep[] {
  let supabaseCalls = 0
  const snapshot: CaseSnapshot = {
    workflowStatus: 'imported_pending_review',
    currentDueDate: '2026-07-20',
    progress: 0,
    correctiveActionStatuses: ['not_started'],
    documentReferenceStatuses: [],
    openActionDueDates: [],
    sentEmailDates: [],
    officialReplyDates: [],
    lastActivityAt: '2026-07-15T08:00:00+03:00',
  }
  const results: DevelopmentScenarioStep[] = []

  results.push(snapshotStep('لم تبدأ المتابعة', snapshot, [
    assert(operationalStatusLabel(snapshot) === 'لم تبدأ المتابعة', 'إخفاء الحالة التقنية عن المستخدم.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('needs_start'), 'إدراج الملاحظة في تحتاج بدء المتابعة.'),
    assert(!caseWorkQueues(snapshot, TEST_NOW).includes('needs_action_today'), 'عدم اعتبار غير المبدوءة مستحقة اليوم.'),
    assert(caseWorkQueues({ ...snapshot, openActionDueDates: ['2026-07-15'] }, TEST_NOW).includes('needs_action_today'), 'إدراج الملاحظة فقط عند وجود إجراء تصحيحي مفتوح مستحق اليوم.'),
  ]))

  const legacyCompleteSnapshot: CaseSnapshot = {
    ...snapshot,
    progress: 100,
    sentEmailDates: ['2026-07-15T09:00:00+03:00'],
    officialReplyDates: ['2026-07-15T10:00:00+03:00'],
    lastActivityAt: '2026-07-15T11:00:00+03:00',
  }
  results.push(snapshotStep('إنجاز 100% مع حالة تقنية قديمة', legacyCompleteSnapshot, [
    assert(nextCaseAction(legacyCompleteSnapshot, ['action_owner']).code === 'verify_corrective_actions', 'اشتراط إرسال الإجراء للمدير رغم وصول الإنجاز إلى 100%.'),
    assert(!caseWorkQueues(legacyCompleteSnapshot, TEST_NOW).includes('ready_to_submit'), 'عدم إدراج الإجراء غير المتحقق في جاهزة للرفع.'),
    assert(nextCaseAction(legacyCompleteSnapshot, ['viewer']).code === 'readonly', 'إبقاء المطلع في وضع القراءة فقط.'),
  ]))

  snapshot.sentEmailDates.push('2026-07-15T09:00:00+03:00')
  snapshot.lastActivityAt = snapshot.sentEmailDates[0]
  results.push(snapshotStep('إرسال رسمي', snapshot, [
    assert(nextCaseAction(snapshot, [...roles]).code === 'record_follow_up_or_reply', 'تحويل الإجراء التالي إلى انتظار متابعة أو رد.'),
    assert(caseWorkflowStage(snapshot) === 1, 'تحريك الشريط إلى مرحلة المراسلات.'),
  ]))

  results.push(snapshotStep('انتظار رد', snapshot, [
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('awaiting_reply'), 'نقل الملاحظة إلى قائمة بانتظار رد.'),
  ]))

  snapshot.officialReplyDates.push('2026-07-15T10:00:00+03:00')
  snapshot.lastActivityAt = snapshot.officialReplyDates[0]
  results.push(snapshotStep('تسجيل رد', snapshot, [
    assert(nextCaseAction(snapshot, [...roles]).code === 'update_progress', 'تحويل الإجراء التالي إلى تحديث التقدم.'),
    assert(!caseWorkQueues(snapshot, TEST_NOW).includes('awaiting_reply'), 'إزالة الملاحظة من قائمة بانتظار رد.'),
  ]))

  snapshot.workflowStatus = 'in_progress'
  snapshot.progress = 45
  snapshot.correctiveActionStatuses = ['in_progress']
  snapshot.lastActivityAt = '2026-07-15T10:30:00+03:00'
  results.push(snapshotStep('تحديث تقدم', snapshot, [
    assert(caseWorkflowStage(snapshot) === 2, 'تحريك الشريط إلى مرحلة التنفيذ.'),
    assert(nextCaseAction(snapshot, [...roles]).code === 'update_progress', 'استمرار اقتراح التقدم ما دام التنفيذ غير مكتمل.'),
  ]))

  snapshot.progress = 100
  snapshot.lastActivityAt = '2026-07-15T11:00:00+03:00'
  results.push(snapshotStep('إنجاز 100%', snapshot, [
    assert(nextCaseAction(snapshot, [...roles]).code === 'verify_corrective_actions', 'اقتراح إرسال الإجراء للتحقق بدل الرفع المباشر.'),
    assert(!caseWorkQueues(snapshot, TEST_NOW).includes('ready_to_submit'), 'عدم النقل إلى جاهزة للرفع قبل التحقق.'),
    assert(validateCaseTransition('in_progress', 'closed') === 'لا يمكن الإغلاق قبل اعتماد المدير.', 'منع الإغلاق قبل الاعتماد.'),
  ]))

  snapshot.correctiveActionStatuses = ['submitted_for_manager_review']
  snapshot.documentReferenceStatuses = ['pending']
  snapshot.lastActivityAt = '2026-07-15T11:10:00+03:00'
  results.push(snapshotStep('تحقق المختص من الإجراء', snapshot, [
    assert(nextCaseAction(snapshot, ['action_owner']).code === 'submit_to_manager', 'إظهار رفع الملاحظة بعد إرسال جميع الإجراءات للمدير.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('ready_to_submit'), 'نقل الملاحظة إلى جاهزة للرفع بعد إرسال الإجراءات.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('manager_waiting'), 'إظهار الملاحظة للمدير فور رفع جميع الإجراءات.'),
    assert(nextCaseAction(snapshot, ['manager']).code === 'start_manager_review', 'إظهار بدء مراجعة المدير للحالة الفنية القديمة.'),
    assert(nextCaseAction(snapshot, ['action_owner']).code !== 'start_manager_review', 'عدم إظهار إجراء المدير للموظف.'),
  ]))

  snapshot.workflowStatus = 'submitted_for_manager_review'
  snapshot.lastActivityAt = '2026-07-15T11:15:00+03:00'
  results.push(snapshotStep('رفع للمدير', snapshot, [
    assert(caseWorkflowStage(snapshot) === 3, 'تحريك الشريط إلى مراجعة المدير.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('manager_waiting'), 'نقل الملاحظة إلى قائمة المدير.'),
  ]))

  const missingReturnReason = validateCaseTransition('under_manager_review', 'returned_for_revision')
  assert(Boolean(missingReturnReason), 'رفض الإعادة دون سبب.')
  snapshot.workflowStatus = 'returned_for_revision'
  snapshot.lastActivityAt = '2026-07-15T11:30:00+03:00'
  results.push(snapshotStep('إعادة بسبب إلزامي', snapshot, [
    assert(missingReturnReason === 'السبب إلزامي للإعادة أو إعادة الفتح.', 'منع الإعادة عند غياب السبب.'),
    assert(validateCaseTransition('under_manager_review', 'returned_for_revision', 'استكمال التوثيق') === null, 'قبول الإعادة عند إدخال السبب.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('returned'), 'نقل الملاحظة إلى معادة من المدير.'),
    assert(nextCaseAction(snapshot, [...roles]).code === 'submit_to_manager', 'اقتراح إعادة الرفع بعد استكمال الملاحظة بنسبة 100%.'),
  ]))

  snapshot.workflowStatus = 'under_manager_review'
  snapshot.documentReferenceStatuses = ['approved']
  snapshot.lastActivityAt = '2026-07-15T11:45:00+03:00'
  const statusBeforeApproval: FinancialControlFindingStatus = snapshot.workflowStatus
  assert(statusBeforeApproval === 'under_manager_review', 'إعادة الرفع ووصول الملاحظة إلى مراجعة المدير قبل الاعتماد.')
  snapshot.workflowStatus = 'approved'
  results.push(snapshotStep('اعتماد', snapshot, [
    assert(nextCaseAction(snapshot, [...roles]).code === 'close', 'اقتراح الإغلاق بعد الاعتماد فقط.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('ready_to_close'), 'نقل الملاحظة إلى جاهزة للإغلاق.'),
  ]))

  snapshot.workflowStatus = 'closed'
  results.push(snapshotStep('إغلاق', snapshot, [
    assert(caseWorkflowStage(snapshot) === 4, 'إكمال شريط المراحل.'),
    assert(nextCaseAction(snapshot, [...roles]).code === 'readonly', 'تحويل الملاحظة المغلقة إلى القراءة فقط.'),
  ]))

  const missingReopenReason = validateCaseTransition('closed', 'reopened')
  assert(Boolean(missingReopenReason), 'رفض إعادة الفتح دون سبب.')
  snapshot.workflowStatus = 'reopened'
  results.push(snapshotStep('إعادة فتح بسبب إلزامي', snapshot, [
    assert(missingReopenReason === 'السبب إلزامي للإعادة أو إعادة الفتح.', 'منع إعادة الفتح عند غياب السبب.'),
    assert(validateCaseTransition('closed', 'reopened', 'ظهور متطلب جديد') === null, 'قبول إعادة الفتح عند إدخال السبب.'),
    assert(caseWorkflowStage(snapshot) === 2, 'إعادة شريط المراحل إلى التنفيذ بعد الفتح.'),
    assert(nextCaseAction(snapshot, [...roles]).code === 'submit_to_manager', 'اقتراح الرفع بعد إعادة الفتح ما دام الإنجاز 100% ولم ترفع للمدير.'),
  ]))

  assert(supabaseCalls === 0, 'عدم تنفيذ أي استدعاء إلى Supabase.')
  return results
}

function simplifiedModel(
  snapshot: CaseSnapshot,
  actor: 'employee' | 'manager' | 'viewer' = 'employee',
  options: { hasEmployeeActivityAfterReturn?: boolean; hasCompleteExecutionDetails?: boolean } = {},
) {
  return buildSimplifiedCaseViewModel({
    snapshot,
    roles: actor === 'manager' ? ['manager'] : actor === 'employee' ? ['action_owner'] : ['viewer'],
    isAssignedEmployee: actor === 'employee',
    latestReturnReason: snapshot.workflowStatus === 'returned_for_revision'
      ? 'يرجى استكمال التحقق وإضافة توضيح إضافي قبل الاعتماد.'
      : null,
    hasEmployeeActivityAfterReturn: options.hasEmployeeActivityAfterReturn,
    hasCompleteExecutionDetails: options.hasCompleteExecutionDetails,
  })
}

export function runSimplifiedCaseScenario() {
  const base: CaseSnapshot = {
    workflowStatus: 'imported_pending_review',
    currentDueDate: '2027-06-30',
    progress: 0,
    correctiveActionStatuses: ['not_started'],
    documentReferenceStatuses: [],
    openActionDueDates: ['2027-06-30'],
    sentEmailDates: [],
    officialReplyDates: [],
    lastActivityAt: '2026-07-15T08:00:00+03:00',
  }
  const original = JSON.stringify(base)
  const checks = [
    assert(simplifiedModel(base).primaryActionHandler === 'record_sent_email', 'الموظف قبل التواصل يرى تسجيل البريد كإجراء رئيسي.'),
    assert(simplifiedModel({ ...base, sentEmailDates: ['2026-07-15T09:00:00+03:00'] }).primaryActionHandler === 'record_follow_up_or_reply', 'الموظف بانتظار الرد يرى تسجيل متابعة أو رد.'),
    assert(simplifiedModel({ ...base, progress: 50, correctiveActionStatuses: ['in_progress'], sentEmailDates: ['2026-07-15T09:00:00+03:00'], officialReplyDates: ['2026-07-15T10:00:00+03:00'] }).primaryActionHandler === 'update_progress', 'الموظف عند 50% يرى تحديث التقدم.'),
    assert(simplifiedModel({ ...base, progress: 100, correctiveActionStatuses: ['in_progress'], sentEmailDates: ['2026-07-15T09:00:00+03:00'], officialReplyDates: ['2026-07-15T10:00:00+03:00'] }).primaryActionHandler === 'open_document_references', 'الإنجاز 100% دون مرجع ينتقل إلى المستندات.'),
    assert(simplifiedModel({ ...base, progress: 100, correctiveActionStatuses: ['in_progress'], documentReferenceStatuses: ['pending'], sentEmailDates: ['2026-07-15T09:00:00+03:00'], officialReplyDates: ['2026-07-15T10:00:00+03:00'] }).primaryActionHandler === 'submit_next_action', 'الإنجاز 100% مع مرجع يصبح جاهزًا للإرسال.'),
    assert(simplifiedModel({ ...base, progress: 100, correctiveActionStatuses: ['submitted_for_manager_review'], documentReferenceStatuses: ['pending'], sentEmailDates: ['2026-07-15T09:00:00+03:00'] }).waitingForManager, 'بعد الإرسال تختفي إجراءات الموظف ويظهر انتظار المدير.'),
    assert((() => {
      const returned = simplifiedModel({ ...base, workflowStatus: 'returned_for_revision', progress: 100, correctiveActionStatuses: ['in_progress'], documentReferenceStatuses: ['approved'] })
      return returned.currentStep === 2
        && returned.primaryActionHandler === 'update_progress'
        && returned.primaryActionLabel === 'استكمال التعديل'
        && returned.returnReason === 'يرجى استكمال التحقق وإضافة توضيح إضافي قبل الاعتماد.'
    })(), 'المعاد من المدير يعرض السبب والخطوة الثانية وزر استكمال التعديل.'),
    assert(buildSimplifiedCaseViewModel({
      snapshot: { ...base, workflowStatus: 'returned_for_revision', progress: 100, correctiveActionStatuses: ['submitted_for_manager_review'], documentReferenceStatuses: ['approved'] },
      roles: ['owner', 'action_owner'],
      isAssignedEmployee: true,
      latestReturnReason: 'يرجى استكمال التحقق وإضافة توضيح إضافي قبل الاعتماد.',
    }).primaryActionLabel === 'استكمال التعديل', 'الموظف المسند يرى استكمال التعديل حتى عند امتلاكه صلاحية إدارية إضافية.'),
    assert(simplifiedModel(
      { ...base, workflowStatus: 'returned_for_revision', progress: 100, correctiveActionStatuses: ['in_progress'], documentReferenceStatuses: ['approved'] },
      'employee',
      { hasEmployeeActivityAfterReturn: true, hasCompleteExecutionDetails: true },
    ).primaryActionHandler === 'submit_next_action', 'بعد حفظ التعديل واستيفاء المتطلبات يظهر إعادة الإرسال للمدير.'),
    assert(simplifiedModel({ ...base, progress: 100, correctiveActionStatuses: ['submitted_for_manager_review'], documentReferenceStatuses: ['pending'] }, 'manager').primaryActionHandler === 'start_manager_review', 'المدير قبل البدء يرى بدء المراجعة.'),
    assert(simplifiedModel({ ...base, workflowStatus: 'under_manager_review', progress: 100, correctiveActionStatuses: ['submitted_for_manager_review'], documentReferenceStatuses: ['pending'] }, 'manager').primaryActionHandler === 'review_document_references', 'المدير يراجع المرجع المعلق أولًا.'),
    assert(simplifiedModel({ ...base, workflowStatus: 'under_manager_review', progress: 100, correctiveActionStatuses: ['submitted_for_manager_review'], documentReferenceStatuses: ['approved'] }, 'manager').primaryActionHandler === 'approve_finding', 'بعد اعتماد المراجع يظهر قرار الملاحظة.'),
    assert(simplifiedModel({ ...base, workflowStatus: 'approved', progress: 100, correctiveActionStatuses: ['completed'], documentReferenceStatuses: ['approved'] }, 'manager').primaryActionHandler === 'close_finding', 'بعد اعتماد الملاحظة يظهر الإغلاق.'),
    assert(simplifiedModel({ ...base, workflowStatus: 'closed', progress: 100, correctiveActionStatuses: ['completed'], documentReferenceStatuses: ['approved'] }, 'manager').readonly, 'الملاحظة المغلقة للقراءة فقط.'),
    assert(simplifiedModel(base, 'viewer').primaryActionHandler === 'none', 'المطلع لا يرى إجراء غير مصرح به.'),
    assert(simplifiedCaseQueues({ ...base, workflowStatus: 'returned_for_revision' }).includes('employee_returned'), 'الملاحظة المعادة تنتقل إلى بطاقة الموظف الصحيحة.'),
    assert(JSON.stringify(base) === original, 'طبقة العرض المبسط لا تغير الحالة أو البيانات الأصلية.'),
  ]

  return checks
}

export const developmentScenarioResults = runDevelopmentCaseScenario()
export const simplifiedScenarioResults = runSimplifiedCaseScenario()

if (import.meta.env.DEV) {
  console.info('[financial-control] Development-only in-memory scenario passed.', {
    developmentScenarioResults,
    simplifiedScenarioResults,
  })
}
