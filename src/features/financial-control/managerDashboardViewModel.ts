import type {
  FinancialControlFinding,
  FinancialControlFindingStatus,
} from '../../types/financialControl'
import {
  areAllCorrectiveActionsSubmitted,
  areAllDocumentReferencesApproved,
} from './caseManagementModel'

const DAY_MS = 86_400_000
export const MANAGER_STALE_DAYS = 14
export const MANAGER_REVIEW_STALE_DAYS = 7
export const MANAGER_DUE_SOON_DAYS = 14
export const MANAGER_LOW_PROGRESS_PERCENT = 50

export type ManagerDashboardFilterKey =
  | 'waiting_department_reply'
  | 'employee_execution'
  | 'ready_for_manager_submission'
  | 'manager_review'
  | 'returned_for_completion'
  | 'ready_for_closure'
  | 'alert_stale'
  | 'alert_due_low_progress'
  | 'alert_overdue'
  | 'alert_complete_not_submitted'
  | 'alert_returned_not_updated'
  | 'alert_manager_review_stale'
  | 'decision_pending_start'
  | 'decision_documents'
  | 'decision_ready_approval'
  | 'decision_ready_closure'
  | 'decision_returned'

export interface ManagerDashboardItemDefinition {
  key: ManagerDashboardFilterKey
  label: string
  description: string
  findingIds: string[]
  count: number
}

export interface ManagerDepartmentSummary {
  name: string
  total: number
  closed: number
  inProgress: number
  overdue: number
  lastUpdatedAt: string | null
  progressPercent: number
  indicator: 'overdue' | 'needs_follow_up' | 'on_track' | 'no_current_deviation'
}

export interface ManagerDashboardViewModel {
  summary: {
    total: number
    overallProgressPercent: number
    closurePercent: number
    open: number
    inProgress: number
    overdue: number
    atRisk: number
    lastUpdatedAt: string | null
  }
  waiting: ManagerDashboardItemDefinition[]
  alerts: ManagerDashboardItemDefinition[]
  departments: ManagerDepartmentSummary[]
  decisions: ManagerDashboardItemDefinition[]
  goals: {
    target: number
    completed: number
    inProgress: number
    remaining: number
    progressPercent: number
  }
}

function findingProgress(finding: FinancialControlFinding) {
  if (finding.corrective_actions.length === 0) return finding.progress_percent
  return Math.round(
    finding.corrective_actions.reduce((sum, action) => sum + action.progress_percent, 0)
      / finding.corrective_actions.length,
  )
}

function lastActivityAt(finding: FinancialControlFinding) {
  const timestamps = [
    finding.last_activity_at,
    finding.updated_at,
    ...finding.messages.map((message) => message.sent_at),
    ...finding.comments.map((comment) => comment.created_at),
    ...finding.status_history.map((item) => item.changed_at),
    ...finding.corrective_actions.map((action) => action.updated_at),
    ...finding.corrective_actions.flatMap((action) =>
      action.document_references.map((reference) => reference.updated_at),
    ),
    ...(finding.follow_ups ?? []).map((followUp) => followUp.updated_at),
  ].filter((value): value is string => Boolean(value))

  return timestamps.sort((first, second) => Date.parse(second) - Date.parse(first))[0] ?? null
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function dueDays(finding: FinancialControlFinding, now: Date) {
  const [year, month, day] = finding.current_due_date.slice(0, 10).split('-').map(Number)
  return Math.round((new Date(year, month - 1, day).getTime() - startOfDay(now)) / DAY_MS)
}

function daysSince(value: string | null, now: Date) {
  if (!value) return 0
  return Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / DAY_MS))
}

function isOpen(finding: FinancialControlFinding) {
  return finding.workflow_status !== 'closed'
}

function isExecutionStarted(finding: FinancialControlFinding) {
  if (!isOpen(finding)) return false
  if (['submitted_for_manager_review', 'under_manager_review', 'approved'].includes(finding.workflow_status)) {
    return false
  }
  return findingProgress(finding) > 0 || [
    'in_progress', 'awaiting_action_owner', 'returned_for_revision', 'reopened',
  ].includes(finding.workflow_status)
}

function isOverdue(finding: FinancialControlFinding, now: Date) {
  return isOpen(finding) && dueDays(finding, now) < 0
}

function isAtRisk(finding: FinancialControlFinding, now: Date) {
  const days = dueDays(finding, now)
  return isOpen(finding)
    && days >= 0
    && days <= MANAGER_DUE_SOON_DAYS
    && findingProgress(finding) < MANAGER_LOW_PROGRESS_PERCENT
}

function referenceStatuses(finding: FinancialControlFinding) {
  return finding.corrective_actions.flatMap((action) =>
    action.document_references.map((reference) => reference.manager_verification_status),
  )
}

function latestStatusEntryAt(finding: FinancialControlFinding, status: FinancialControlFindingStatus) {
  return [...finding.status_history]
    .filter((item) => item.to_status === status)
    .sort((first, second) => Date.parse(second.changed_at) - Date.parse(first.changed_at))[0]?.changed_at ?? null
}

function hasActivityAfterLatestReturn(finding: FinancialControlFinding) {
  const returnedAt = latestStatusEntryAt(finding, 'returned_for_revision')
  if (!returnedAt) return false
  const returnedTimestamp = Date.parse(returnedAt)
  const activity = [
    ...finding.comments.map((comment) => comment.created_at),
    ...finding.messages.map((message) => message.created_at),
    ...finding.corrective_actions.map((action) => action.updated_at),
    ...finding.corrective_actions.flatMap((action) =>
      action.document_references.map((reference) => reference.updated_at),
    ),
  ]
  return activity.some((timestamp) => Date.parse(timestamp) > returnedTimestamp)
}

function snapshotForEmail(finding: FinancialControlFinding) {
  return {
    sentEmailDates: finding.messages
      .filter((message) => message.message_type === 'sent_email')
      .map((message) => message.sent_at),
    officialReplyDates: finding.messages
      .filter((message) => message.message_type === 'department_reply')
      .map((message) => message.sent_at),
  }
}

function hasUnansweredDepartmentEmail(finding: FinancialControlFinding) {
  const snapshot = snapshotForEmail(finding)
  const sentDates = [...snapshot.sentEmailDates].sort()
  const lastSent = sentDates[sentDates.length - 1]
  if (!lastSent) return false
  const replyDates = [...snapshot.officialReplyDates].sort()
  const lastReply = replyDates[replyDates.length - 1]
  return !lastReply || Date.parse(lastSent) > Date.parse(lastReply)
}

function matchesFilter(
  finding: FinancialControlFinding,
  key: ManagerDashboardFilterKey,
  now: Date,
) {
  const progress = findingProgress(finding)
  const allActionsSubmitted = areAllCorrectiveActionsSubmitted(
    finding.corrective_actions.map((action) => action.workflow_status),
  )
  const references = referenceStatuses(finding)
  const reviewStartedAt = latestStatusEntryAt(finding, 'under_manager_review') ?? finding.updated_at

  switch (key) {
    case 'waiting_department_reply':
      return isOpen(finding) && hasUnansweredDepartmentEmail(finding)
    case 'employee_execution':
      return isOpen(finding)
        && progress < 100
        && ['in_progress', 'awaiting_action_owner', 'reopened'].includes(finding.workflow_status)
    case 'ready_for_manager_submission':
      return isOpen(finding) && progress === 100 && !allActionsSubmitted
    case 'manager_review':
      return ['submitted_for_manager_review', 'under_manager_review'].includes(finding.workflow_status)
    case 'returned_for_completion':
    case 'decision_returned':
      return finding.workflow_status === 'returned_for_revision'
    case 'ready_for_closure':
    case 'decision_ready_closure':
      return finding.workflow_status === 'approved'
    case 'alert_stale':
      return isOpen(finding) && daysSince(lastActivityAt(finding), now) >= MANAGER_STALE_DAYS
    case 'alert_due_low_progress':
      return isAtRisk(finding, now)
    case 'alert_overdue':
      return isOverdue(finding, now)
    case 'alert_complete_not_submitted':
      return isOpen(finding) && progress === 100 && !allActionsSubmitted
    case 'alert_returned_not_updated':
      return finding.workflow_status === 'returned_for_revision' && !hasActivityAfterLatestReturn(finding)
    case 'alert_manager_review_stale':
      return finding.workflow_status === 'under_manager_review'
        && daysSince(reviewStartedAt, now) >= MANAGER_REVIEW_STALE_DAYS
    case 'decision_pending_start':
      return allActionsSubmitted && ![
        'under_manager_review', 'approved', 'closed', 'returned_for_revision',
      ].includes(finding.workflow_status)
    case 'decision_documents':
      return finding.workflow_status === 'under_manager_review'
        && references.some((status) => status === 'pending' || status === 'rejected')
    case 'decision_ready_approval':
      return finding.workflow_status === 'under_manager_review'
        && areAllDocumentReferencesApproved(references)
  }
}

export function matchesManagerDashboardFilter(
  finding: FinancialControlFinding,
  key: ManagerDashboardFilterKey,
  now = new Date(),
) {
  return matchesFilter(finding, key, now)
}

function definition(
  findings: FinancialControlFinding[],
  now: Date,
  key: ManagerDashboardFilterKey,
  label: string,
  description: string,
): ManagerDashboardItemDefinition {
  const findingIds = findings.filter((finding) => matchesFilter(finding, key, now)).map((finding) => finding.id)
  return { key, label, description, findingIds, count: findingIds.length }
}

export function buildManagerDashboardViewModel(
  findings: FinancialControlFinding[],
  now = new Date(),
): ManagerDashboardViewModel {
  const total = findings.length
  const closed = findings.filter((finding) => finding.workflow_status === 'closed').length
  const overdue = findings.filter((finding) => isOverdue(finding, now)).length
  const atRisk = findings.filter((finding) => isAtRisk(finding, now)).length
  const active = findings.filter((finding) => isOpen(finding))
  const overallProgressPercent = total === 0
    ? 0
    : Math.round(findings.reduce((sum, finding) => sum + findingProgress(finding), 0) / total)
  const lastUpdatedAt = findings
    .map(lastActivityAt)
    .filter((value): value is string => Boolean(value))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0] ?? null

  const waiting = [
    definition(findings, now, 'waiting_department_reply', 'بانتظار رد الإدارة', 'يوجد إرسال رسمي دون رد أحدث منه.'),
    definition(findings, now, 'employee_execution', 'تحت تنفيذ الموظف', 'التنفيذ جارٍ ولم يصل إلى 100%.'),
    definition(findings, now, 'ready_for_manager_submission', 'جاهزة للرفع للمدير', 'اكتمل الإنجاز ولم تُرفع جميع الإجراءات.'),
    definition(findings, now, 'manager_review', 'تحت مراجعة المدير', 'مرفوعة للمدير أو تحت مراجعته.'),
    definition(findings, now, 'returned_for_completion', 'معادة للاستكمال', 'أعيدت للموظف لاستكمال المطلوب.'),
    definition(findings, now, 'ready_for_closure', 'جاهزة للإغلاق', 'معتمدة وتنتظر الإغلاق.'),
  ]

  const alerts = [
    definition(findings, now, 'alert_stale', 'لم تُحدّث منذ مدة', `${MANAGER_STALE_DAYS} يومًا أو أكثر دون نشاط.`),
    definition(findings, now, 'alert_due_low_progress', 'الموعد قريب والإنجاز منخفض', `خلال ${MANAGER_DUE_SOON_DAYS} يومًا والإنجاز أقل من ${MANAGER_LOW_PROGRESS_PERCENT}%.`),
    definition(findings, now, 'alert_overdue', 'تجاوزت الموعد', 'موعدها الحالي مضى ولم تُغلق.'),
    definition(findings, now, 'alert_complete_not_submitted', 'الإنجاز 100% ولم تُرفع', 'مكتملة رقميًا ولم تُرفع جميع إجراءاتها.'),
    definition(findings, now, 'alert_returned_not_updated', 'معادة ولم تُحدّث بعد الإرجاع', 'لا يوجد نشاط مسجل بعد آخر إرجاع.'),
    definition(findings, now, 'alert_manager_review_stale', 'تحت مراجعة المدير منذ مدة', `${MANAGER_REVIEW_STALE_DAYS} أيام أو أكثر منذ بدء المراجعة.`),
  ]

  const groupedDepartments = new Map<string, FinancialControlFinding[]>()
  findings.forEach((finding) => {
    const name = finding.official_owner_label.trim()
    if (!name) return
    groupedDepartments.set(name, [...(groupedDepartments.get(name) ?? []), finding])
  })
  const departments = [...groupedDepartments.entries()].map(([name, departmentFindings]) => {
    const departmentOverdue = departmentFindings.filter((finding) => isOverdue(finding, now)).length
    const openDepartmentFindings = departmentFindings.filter(isOpen)
    const needsFollowUp = openDepartmentFindings.some((finding) => {
      const progress = findingProgress(finding)
      const updateAge = daysSince(lastActivityAt(finding), now)
      const zeroProgressNeedsAttention = progress === 0 && (
        isExecutionStarted(finding)
        || updateAge >= MANAGER_REVIEW_STALE_DAYS
        || dueDays(finding, now) <= 30
      )
      return isAtRisk(finding, now)
        || updateAge >= MANAGER_STALE_DAYS
        || zeroProgressNeedsAttention
    })
    const departmentLastUpdatedAt = departmentFindings
      .map(lastActivityAt)
      .filter((value): value is string => Boolean(value))
      .sort((first, second) => Date.parse(second) - Date.parse(first))[0] ?? null
    const progressPercent = Math.round(
      departmentFindings.reduce((sum, finding) => sum + findingProgress(finding), 0)
        / departmentFindings.length,
    )
    const indicator: ManagerDepartmentSummary['indicator'] = departmentOverdue > 0
      ? 'overdue'
      : needsFollowUp
        ? 'needs_follow_up'
        : openDepartmentFindings.length === 0
          ? 'no_current_deviation'
          : progressPercent > 0
            ? 'on_track'
            : 'no_current_deviation'

    return {
      name,
      total: departmentFindings.length,
      closed: departmentFindings.filter((finding) => finding.workflow_status === 'closed').length,
      inProgress: departmentFindings.filter(isExecutionStarted).length,
      overdue: departmentOverdue,
      lastUpdatedAt: departmentLastUpdatedAt,
      progressPercent,
      indicator,
    }
  }).sort((first, second) => {
    const priority: Record<ManagerDepartmentSummary['indicator'], number> = {
      overdue: 0,
      needs_follow_up: 1,
      on_track: 2,
      no_current_deviation: 2,
    }
    const priorityDifference = priority[first.indicator] - priority[second.indicator]
    if (priorityDifference !== 0) return priorityDifference
    if (first.progressPercent !== second.progressPercent) return first.progressPercent - second.progressPercent
    const firstUpdatedAt = first.lastUpdatedAt ? Date.parse(first.lastUpdatedAt) : Number.NEGATIVE_INFINITY
    const secondUpdatedAt = second.lastUpdatedAt ? Date.parse(second.lastUpdatedAt) : Number.NEGATIVE_INFINITY
    if (firstUpdatedAt !== secondUpdatedAt) return firstUpdatedAt - secondUpdatedAt
    return first.name.localeCompare(second.name, 'ar')
  })

  const decisions = [
    definition(findings, now, 'decision_pending_start', 'بانتظار بدء المراجعة', 'رُفعت وتنتظر بدء مراجعة المدير.'),
    definition(findings, now, 'decision_documents', 'مستندات تحتاج قرارًا', 'توجد مراجع معلقة أو مرفوضة.'),
    definition(findings, now, 'decision_ready_approval', 'جاهزة للاعتماد', 'جميع المراجع معتمدة.'),
    definition(findings, now, 'decision_ready_closure', 'جاهزة للإغلاق', 'معتمدة وتنتظر الإغلاق.'),
    definition(findings, now, 'decision_returned', 'معادة للموظف', 'تنتظر استكمال الموظف.'),
  ]

  return {
    summary: {
      total,
      overallProgressPercent,
      closurePercent: total === 0 ? 0 : Math.round((closed / total) * 100),
      open: active.length,
      inProgress: findings.filter(isExecutionStarted).length,
      overdue,
      atRisk,
      lastUpdatedAt,
    },
    waiting,
    alerts,
    departments,
    decisions,
    goals: {
      target: total,
      completed: closed,
      inProgress: active.filter((finding) => findingProgress(finding) > 0).length,
      remaining: total - closed,
      progressPercent: total === 0 ? 0 : Math.round((closed / total) * 100),
    },
  }
}
