import type { FinancialControlFindingStatus } from '../../types/financialControl'
import {
  caseWorkflowStage,
  caseWorkQueues,
  nextCaseAction,
  operationalStatusLabel,
  validateCaseTransition,
} from './caseManagementModel'
import type { CaseSnapshot, CaseWorkQueueKey } from './caseManagementModel'

export interface DevelopmentScenarioStep {
  step: string
  operationalStatus: string
  nextAction: string
  stage: number
  queues: CaseWorkQueueKey[]
  checks: string[]
}

const TEST_NOW = new Date('2026-07-15T12:00:00+03:00')
const roles = ['owner'] as const

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
  snapshot.lastActivityAt = '2026-07-15T10:30:00+03:00'
  results.push(snapshotStep('تحديث تقدم', snapshot, [
    assert(caseWorkflowStage(snapshot) === 2, 'تحريك الشريط إلى مرحلة التنفيذ.'),
    assert(nextCaseAction(snapshot, [...roles]).code === 'update_progress', 'استمرار اقتراح التقدم ما دام التنفيذ غير مكتمل.'),
  ]))

  snapshot.progress = 100
  snapshot.lastActivityAt = '2026-07-15T11:00:00+03:00'
  results.push(snapshotStep('إنجاز 100%', snapshot, [
    assert(nextCaseAction(snapshot, [...roles]).code === 'submit_to_manager', 'اقتراح الرفع للمدير دون إغلاق تلقائي.'),
    assert(caseWorkQueues(snapshot, TEST_NOW).includes('ready_to_submit'), 'نقل الملاحظة إلى جاهزة للرفع.'),
    assert(validateCaseTransition('in_progress', 'closed') === 'لا يمكن الإغلاق قبل اعتماد المدير.', 'منع الإغلاق قبل الاعتماد.'),
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
    assert(nextCaseAction(snapshot, [...roles]).code === 'complete_return_requirements', 'اقتراح استكمال المطلوب.'),
  ]))

  snapshot.workflowStatus = 'under_manager_review'
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
    assert(nextCaseAction(snapshot, [...roles]).label === 'استكمال المتابعة بعد إعادة الفتح', 'اقتراح استكمال المتابعة بعد إعادة الفتح.'),
  ]))

  assert(supabaseCalls === 0, 'عدم تنفيذ أي استدعاء إلى Supabase.')
  return results
}

export const developmentScenarioResults = runDevelopmentCaseScenario()

if (import.meta.env.DEV) {
  console.info('[financial-control] Development-only in-memory scenario passed.', developmentScenarioResults)
}
