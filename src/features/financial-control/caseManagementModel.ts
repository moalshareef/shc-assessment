import type {
  FinancialControlFindingStatus,
  FinancialControlRole,
} from '../../types/financialControl'

export type CaseWorkQueueKey =
  | 'needs_action_today'
  | 'needs_start'
  | 'awaiting_reply'
  | 'due_soon'
  | 'overdue'
  | 'stale'
  | 'returned'
  | 'ready_to_submit'
  | 'manager_waiting'
  | 'manager_returned'
  | 'manager_overdue'
  | 'ready_to_close'

export type CaseNextActionCode =
  | 'send_official_email'
  | 'record_follow_up_or_reply'
  | 'update_progress'
  | 'submit_to_manager'
  | 'start_manager_review'
  | 'approve'
  | 'complete_return_requirements'
  | 'close'
  | 'readonly'

export interface CaseSnapshot {
  workflowStatus: FinancialControlFindingStatus
  currentDueDate: string
  progress: number
  openActionDueDates: string[]
  sentEmailDates: string[]
  officialReplyDates: string[]
  lastActivityAt: string
}

export interface CaseNextAction {
  code: CaseNextActionCode
  label: string
  reason: string
}

export const STALE_DAYS = 14
const DAY_MS = 86_400_000

export const operationalStatusLabels: Record<FinancialControlFindingStatus, string> = {
  imported_pending_review: 'لم تبدأ المتابعة',
  not_started: 'لم تبدأ المتابعة',
  in_progress: 'قيد التنفيذ',
  awaiting_action_owner: 'بانتظار مسؤول الإجراء',
  submitted_for_manager_review: 'مرسلة لمراجعة المدير',
  under_manager_review: 'تحت مراجعة المدير',
  returned_for_revision: 'معادة للتعديل',
  approved: 'معتمدة',
  closed: 'مغلقة',
  reopened: 'معاد فتحها',
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function localDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateOnlyTimestamp(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

export function daysUntilCaseDue(snapshot: CaseSnapshot, now = new Date()) {
  return Math.round((dateOnlyTimestamp(snapshot.currentDueDate) - startOfLocalDay(now)) / DAY_MS)
}

export function daysWithoutCaseUpdate(snapshot: CaseSnapshot, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(snapshot.lastActivityAt).getTime()) / DAY_MS))
}

export function hasOfficialEmail(snapshot: CaseSnapshot) {
  return snapshot.sentEmailDates.length > 0
}

export function hasUnansweredOfficialEmail(snapshot: CaseSnapshot) {
  const sentDates = [...snapshot.sentEmailDates].sort()
  const lastSent = sentDates[sentDates.length - 1]
  if (!lastSent) return false
  const replyDates = [...snapshot.officialReplyDates].sort()
  const lastReply = replyDates[replyDates.length - 1]
  return !lastReply || new Date(lastSent).getTime() > new Date(lastReply).getTime()
}

export function operationalStatusLabel(snapshot: CaseSnapshot) {
  if (snapshot.workflowStatus === 'imported_pending_review') {
    if (!hasOfficialEmail(snapshot)) return 'لم تبدأ المتابعة'
    if (hasUnansweredOfficialEmail(snapshot)) return 'بانتظار رد رسمي'
    return 'قيد المتابعة'
  }
  return operationalStatusLabels[snapshot.workflowStatus]
}

export function caseWorkflowStage(snapshot: CaseSnapshot) {
  if (snapshot.workflowStatus === 'closed') return 4
  if (['submitted_for_manager_review', 'under_manager_review', 'approved'].includes(snapshot.workflowStatus)) return 3
  if (snapshot.progress > 0 || ['in_progress', 'returned_for_revision'].includes(snapshot.workflowStatus)) return 2
  if (hasOfficialEmail(snapshot)) return 1
  return 0
}

export function caseWorkQueues(snapshot: CaseSnapshot, now = new Date()): CaseWorkQueueKey[] {
  const queues: CaseWorkQueueKey[] = []
  const dueDays = daysUntilCaseDue(snapshot, now)
  const open = snapshot.workflowStatus !== 'closed'

  const today = localDateKey(now)
  if (open && snapshot.openActionDueDates.includes(today)) queues.push('needs_action_today')
  if (!hasOfficialEmail(snapshot) && open) queues.push('needs_start')
  if (hasUnansweredOfficialEmail(snapshot) && open) queues.push('awaiting_reply')
  if (dueDays > 0 && dueDays <= 30 && open) queues.push('due_soon')
  if (dueDays < 0 && open) queues.push('overdue', 'manager_overdue')
  if (open && daysWithoutCaseUpdate(snapshot, now) >= STALE_DAYS) queues.push('stale')
  if (snapshot.workflowStatus === 'returned_for_revision') queues.push('returned', 'manager_returned')
  if (snapshot.progress === 100 && ['in_progress', 'returned_for_revision'].includes(snapshot.workflowStatus)) {
    queues.push('ready_to_submit')
  }
  if (['submitted_for_manager_review', 'under_manager_review'].includes(snapshot.workflowStatus)) {
    queues.push('manager_waiting')
  }
  if (snapshot.workflowStatus === 'approved') queues.push('ready_to_close')
  return queues
}

export function nextCaseAction(snapshot: CaseSnapshot, roles: FinancialControlRole[]): CaseNextAction {
  const canManage = roles.some((role) => role === 'owner' || role === 'manager')
  const canWork = roles.some((role) => ['owner', 'specialist', 'action_owner'].includes(role))

  if (snapshot.workflowStatus === 'closed') {
    return {
      code: 'readonly',
      label: 'الملاحظة مغلقة — عرض فقط',
      reason: 'اكتمل مسار المتابعة والاعتماد والإغلاق. يمكن للمدير إعادة فتحها من الإجراءات الأخرى مع تسجيل سبب.',
    }
  }
  if (snapshot.workflowStatus === 'approved' && canManage) {
    return { code: 'close', label: 'إغلاق الملاحظة', reason: 'اعتمدت الملاحظة ولم تنفذ خطوة الإغلاق بعد.' }
  }
  if (snapshot.workflowStatus === 'submitted_for_manager_review' && canManage) {
    return { code: 'start_manager_review', label: 'بدء مراجعة المدير', reason: 'رفع الموظف الملاحظة وتنتظر بدء مراجعة المدير.' }
  }
  if (snapshot.workflowStatus === 'under_manager_review' && canManage) {
    return { code: 'approve', label: 'اعتماد الملاحظة', reason: 'الملاحظة تحت مراجعة المدير؛ يمكن اعتمادها أو إعادتها بسبب من الإجراءات الأخرى.' }
  }
  if (snapshot.workflowStatus === 'reopened' && canWork) {
    return { code: 'update_progress', label: 'استكمال المتابعة بعد إعادة الفتح', reason: 'أعيد فتح الملاحظة بسبب مسجل وتحتاج تحديث التنفيذ قبل إعادة الرفع.' }
  }
  if (snapshot.workflowStatus === 'returned_for_revision' && canWork) {
    return { code: 'complete_return_requirements', label: 'استكمال المطلوب', reason: 'أعاد المدير الملاحظة للتعديل؛ حدّث التقدم وفق سبب الإعادة قبل رفعها مجددًا.' }
  }
  if (!hasOfficialEmail(snapshot) && canWork) {
    return { code: 'send_official_email', label: 'إرسال بريد رسمي', reason: 'لا يوجد إرسال رسمي مسجل لهذه الملاحظة حتى الآن.' }
  }
  if (hasUnansweredOfficialEmail(snapshot) && canWork) {
    return { code: 'record_follow_up_or_reply', label: 'تسجيل متابعة أو رد', reason: 'يوجد إرسال رسمي ولم يسجل رد أحدث منه.' }
  }
  if (snapshot.progress < 100 && canWork) {
    return { code: 'update_progress', label: 'تحديث التقدم', reason: 'سُجل الرد لكن تنفيذ الإجراء التصحيحي لم يكتمل.' }
  }
  if (snapshot.progress === 100 && canWork && ['in_progress', 'returned_for_revision'].includes(snapshot.workflowStatus)) {
    return { code: 'submit_to_manager', label: 'رفع للمدير', reason: 'اكتمل التنفيذ بنسبة 100% ولم ترفع الملاحظة للمدير بعد.' }
  }
  return {
    code: 'readonly',
    label: 'عرض الملاحظة',
    reason: canWork || canManage ? 'لا يوجد إجراء تالٍ متاح من الحالة الحالية.' : 'صلاحيتك الحالية للاطلاع فقط.',
  }
}

export function validateCaseTransition(
  from: FinancialControlFindingStatus,
  to: FinancialControlFindingStatus,
  reason = '',
) {
  if (to === 'closed' && from !== 'approved') return 'لا يمكن الإغلاق قبل اعتماد المدير.'
  if ((to === 'returned_for_revision' || to === 'reopened') && !reason.trim()) {
    return 'السبب إلزامي للإعادة أو إعادة الفتح.'
  }
  return null
}
