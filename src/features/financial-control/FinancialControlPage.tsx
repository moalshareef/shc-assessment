import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import type { IconName } from '../../components/layout/Header'
import { FindingUpdatePanel } from './FindingUpdatePanel'
import { DocumentReferencesSection } from './DocumentReferencesSection'
import type { FindingUpdateKind } from './FindingUpdatePanel'
import { formatArabicDate, formatArabicDateTime } from './dateFormat'
import {
  caseWorkflowStage,
  caseWorkQueues,
  daysUntilCaseDue,
  daysWithoutCaseUpdate,
  nextCaseAction,
  operationalStatusLabel,
  STALE_DAYS,
} from './caseManagementModel'
import type { CaseSnapshot, CaseWorkQueueKey } from './caseManagementModel'
import {
  getFinancialControlDashboard,
  transitionFinancialControlAction,
  transitionFinancialControlFinding,
  updateCorrectiveActionProgressAndStart,
} from '../../services/financialControlService'
import type {
  CorrectiveActionStatus,
  FinancialControlAssessmentRating,
  FinancialControlCorrectiveAction,
  FinancialControlDashboardData,
  FinancialControlFinding,
  FinancialControlFindingStatus,
  FinancialControlRole,
} from '../../types/financialControl'
import { FinancialControlServiceError } from '../../types/financialControl'

const statusLabels: Record<FinancialControlFindingStatus, string> = {
  imported_pending_review: 'لم تبدأ المتابعة',
  not_started: 'لم تبدأ',
  in_progress: 'قيد التنفيذ',
  awaiting_action_owner: 'بانتظار مسؤول الإجراء',
  submitted_for_manager_review: 'مرسلة لمراجعة المدير',
  under_manager_review: 'تحت مراجعة المدير',
  returned_for_revision: 'معادة للتعديل',
  approved: 'معتمدة',
  closed: 'مغلقة',
  reopened: 'معاد فتحها',
}

const actionStatusLabels: Record<CorrectiveActionStatus, string> = {
  not_started: 'لم يبدأ',
  in_progress: 'قيد التنفيذ',
  submitted_for_manager_review: 'مرسل لمراجعة المدير',
  completed: 'مكتمل',
}

const ratingLabels: Record<FinancialControlAssessmentRating, string> = {
  partially_effective: 'شبه فعال',
  not_exists: 'غير موجود',
}

type FindingSort = 'code_asc' | 'code_desc' | 'date_asc' | 'date_desc' | 'status'
type WorkQueueKey =
  | 'all'
  | CaseWorkQueueKey

interface WorkQueueDefinition {
  key: WorkQueueKey
  label: string
  description: string
  test: (finding: FinancialControlFinding) => boolean
}

if (import.meta.env.DEV) {
  void import('./caseManagementScenario.dev')
}

interface SuggestedFindingAction {
  label: string
  reason: string
  kind: 'update' | 'transition' | 'guidance' | 'readonly'
  updateKind?: FindingUpdateKind
  transition?: FindingTransitionOption
}

interface FindingTransitionOption {
  to: FinancialControlFindingStatus
  label: string
  roles: FinancialControlRole[]
}

interface ActionTransitionOption {
  to: CorrectiveActionStatus
  label: string
  roles: FinancialControlRole[]
}

const findingTransitions: Partial<Record<FinancialControlFindingStatus, FindingTransitionOption[]>> = {
  imported_pending_review: [
    { to: 'in_progress', label: 'بدء المتابعة', roles: ['action_owner'] },
    { to: 'under_manager_review', label: 'بدء مراجعة المدير', roles: ['owner', 'manager'] },
  ],
  not_started: [
    { to: 'in_progress', label: 'نقل إلى قيد التنفيذ', roles: ['action_owner'] },
    { to: 'under_manager_review', label: 'بدء مراجعة المدير', roles: ['owner', 'manager'] },
  ],
  in_progress: [
    { to: 'submitted_for_manager_review', label: 'إرسال لمراجعة المدير', roles: ['action_owner'] },
    { to: 'under_manager_review', label: 'بدء مراجعة المدير', roles: ['owner', 'manager'] },
  ],
  submitted_for_manager_review: [{ to: 'under_manager_review', label: 'بدء مراجعة المدير', roles: ['owner', 'manager'] }],
  under_manager_review: [
    { to: 'returned_for_revision', label: 'إرجاع للتعديل', roles: ['owner', 'manager'] },
    { to: 'approved', label: 'اعتماد الملاحظة', roles: ['owner', 'manager'] },
  ],
  approved: [{ to: 'closed', label: 'إغلاق الملاحظة', roles: ['owner', 'manager'] }],
  closed: [{ to: 'reopened', label: 'إعادة فتح الملاحظة', roles: ['owner', 'manager'] }],
}

const actionTransitions: Partial<Record<CorrectiveActionStatus, ActionTransitionOption[]>> = {
  not_started: [{ to: 'in_progress', label: 'بدء تنفيذ الإجراء', roles: ['action_owner'] }],
  in_progress: [{ to: 'submitted_for_manager_review', label: 'إرسال الإجراء للمدير', roles: ['action_owner'] }],
}

const controlStyle = {
  width: '100%',
  minHeight: 44,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: '#fff',
  color: '#17324d',
  padding: '0 12px',
  font: 'inherit',
} as const

function isFindingOverdue(finding: FinancialControlFinding) {
  return caseWorkQueues(toCaseSnapshot(finding)).includes('overdue')
}

function findingProgress(finding: FinancialControlFinding) {
  return finding.corrective_actions.length > 0
    ? Math.round(finding.corrective_actions.reduce((sum, action) => sum + action.progress_percent, 0) / finding.corrective_actions.length)
    : finding.progress_percent
}

function lastActivityTimestamp(finding: FinancialControlFinding) {
  const timestamps = [
    finding.last_activity_at,
    finding.updated_at,
    ...finding.messages.map((message) => message.sent_at),
    ...finding.comments.map((comment) => comment.created_at),
    ...finding.status_history.map((item) => item.changed_at),
    ...finding.corrective_actions.map((action) => action.updated_at),
  ].filter((value): value is string => Boolean(value))

  return timestamps.sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0]
    ?? finding.updated_at
}

function toCaseSnapshot(finding: FinancialControlFinding): CaseSnapshot {
  return {
    workflowStatus: finding.workflow_status,
    currentDueDate: finding.current_due_date,
    progress: findingProgress(finding),
    correctiveActionStatuses: finding.corrective_actions.map((action) => action.workflow_status),
    documentReferenceStatuses: finding.corrective_actions.flatMap((action) =>
      action.document_references.map((reference) => reference.manager_verification_status),
    ),
    openActionDueDates: finding.corrective_actions
      .filter((action) => action.workflow_status !== 'completed')
      .map((action) => action.current_due_date),
    sentEmailDates: finding.messages
      .filter((message) => message.message_type === 'sent_email')
      .map((message) => message.sent_at),
    officialReplyDates: finding.messages
      .filter((message) => message.message_type === 'department_reply')
      .map((message) => message.sent_at),
    lastActivityAt: lastActivityTimestamp(finding),
  }
}

function dueAlert(finding: FinancialControlFinding) {
  if (finding.workflow_status === 'closed') return { label: 'مغلقة', tone: 'success' }
  const days = daysUntilCaseDue(toCaseSnapshot(finding))
  if (days < 0) return { label: `متأخر ${Math.abs(days)} يوم`, tone: 'danger' }
  if (days === 0) return { label: 'مستحق اليوم', tone: 'danger' }
  if (days <= 7) return { label: `خلال ${days} أيام`, tone: 'danger' }
  if (days <= 14) return { label: `خلال ${days} يومًا`, tone: 'warning' }
  if (days <= 30) return { label: `قادم خلال ${days} يومًا`, tone: 'warning' }
  return null
}

function statusClass(finding: FinancialControlFinding) {
  if (isFindingOverdue(finding)) return 'danger'
  if (finding.workflow_status === 'closed' || finding.workflow_status === 'approved') return 'success'
  if (finding.workflow_status === 'imported_pending_review' || finding.workflow_status === 'not_started') return 'muted'
  return ''
}

function actionRoleAllowed(
  option: ActionTransitionOption,
  action: FinancialControlCorrectiveAction,
  roles: FinancialControlRole[],
  currentUserId: string | null,
) {
  return option.roles.some((role) => {
    if (!roles.includes(role)) return false
    return role !== 'action_owner' || action.responsible_user_id === currentUserId
  })
}

const employeeQueues: WorkQueueDefinition[] = [
  {
    key: 'needs_action_today',
    label: 'تحتاج إجراء اليوم',
    description: 'لها موعد استحقاق فعلي اليوم ولم تغلق.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('needs_action_today'),
  },
  {
    key: 'needs_start',
    label: 'تحتاج بدء المتابعة',
    description: 'لم يسجل لها إرسال رسمي حتى الآن.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('needs_start'),
  },
  {
    key: 'awaiting_reply',
    label: 'بانتظار رد',
    description: 'أُرسل بشأنها بريد رسمي ولم يسجل رد أحدث منه.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('awaiting_reply'),
  },
  {
    key: 'due_soon',
    label: 'قريبة الاستحقاق',
    description: 'موعدها خلال 30 يومًا ولم تغلق.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('due_soon'),
  },
  {
    key: 'overdue',
    label: 'متأخرة',
    description: 'تجاوزت تاريخ الاستحقاق الحالي.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('overdue'),
  },
  {
    key: 'stale',
    label: 'بلا تحديث منذ مدة',
    description: `لم يسجل عليها نشاط منذ ${STALE_DAYS} يومًا أو أكثر.`,
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('stale'),
  },
  {
    key: 'returned',
    label: 'معادة من المدير',
    description: 'تحتاج استكمال المطلوب قبل إعادة الرفع.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('returned'),
  },
  {
    key: 'ready_to_submit',
    label: 'جاهزة للرفع',
    description: 'اكتمل تنفيذها ولم تُرفع بعد للمدير.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('ready_to_submit'),
  },
]

const managerQueues: WorkQueueDefinition[] = [
  {
    key: 'manager_waiting',
    label: 'ملاحظات بانتظار الاعتماد',
    description: 'مرفوعة للمدير أو تحت مراجعته.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('manager_waiting'),
  },
  {
    key: 'manager_returned',
    label: 'ملاحظات معادة',
    description: 'أعادها المدير للتعديل وما زالت مفتوحة.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('manager_returned'),
  },
  {
    key: 'manager_overdue',
    label: 'ملاحظات متأخرة',
    description: 'ملاحظات مفتوحة تجاوزت موعدها.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('manager_overdue'),
  },
  {
    key: 'ready_to_close',
    label: 'ملاحظات جاهزة للإغلاق',
    description: 'اعتمدت وتنتظر الإغلاق الإداري.',
    test: (finding) => caseWorkQueues(toCaseSnapshot(finding)).includes('ready_to_close'),
  },
]

function suggestedFindingAction(
  finding: FinancialControlFinding,
  roles: FinancialControlRole[],
): SuggestedFindingAction {
  const next = nextCaseAction(toCaseSnapshot(finding), roles)
  const transition = (to: FinancialControlFindingStatus) =>
    (findingTransitions[finding.workflow_status] ?? []).find((option) => option.to === to)
  const base = { label: next.label, reason: next.reason }
  if (next.code === 'send_official_email') return { ...base, kind: 'update', updateKind: 'sent_email' }
  if (next.code === 'record_follow_up_or_reply') return { ...base, kind: 'update', updateKind: 'follow_up' }
  if (next.code === 'update_progress' || next.code === 'complete_return_requirements') return { ...base, kind: 'update', updateKind: 'progress' }
  if (next.code === 'verify_corrective_actions' || next.code === 'review_document_references') return { ...base, kind: 'guidance' }
  if (next.code === 'submit_to_manager') return { ...base, kind: 'update', updateKind: 'manager_review' }
  if (next.code === 'start_manager_review') return { ...base, kind: 'transition', transition: transition('under_manager_review') }
  if (next.code === 'approve') return { ...base, kind: 'transition', transition: transition('approved') }
  if (next.code === 'close') return { ...base, kind: 'transition', transition: transition('closed') }
  return { ...base, kind: 'readonly' }
}

function mutationErrorMessage(error: unknown) {
  if (error instanceof FinancialControlServiceError) return error.message
  if (error instanceof Error) return error.message
  return 'تعذر حفظ التحديث. حاول مرة أخرى.'
}

interface FindingTimelineEvent {
  id: string
  type: string
  date: string
  actor: string
  text: string
  progress: number | null
  reference: string | null
}

function buildTimeline(
  finding: FinancialControlFinding,
  profileNames: Map<string, string>,
): FindingTimelineEvent[] {
  const actorName = (id: string | null) => (id ? profileNames.get(id) ?? 'مستخدم مسجل' : 'النظام')
  const events: FindingTimelineEvent[] = [
    ...finding.messages.map((message) => ({
      id: `message-${message.id}`,
      type: message.message_type === 'sent_email' ? 'إرسال بريد رسمي' : 'تسجيل رد رسمي',
      date: message.sent_at,
      actor: actorName(message.recorded_by),
      text: message.subject ? `${message.subject} — ${message.body}` : message.body,
      progress: null,
      reference: message.external_message_id,
    })),
    ...finding.comments.map((comment) => ({
      id: `comment-${comment.id}`,
      type: comment.comment_type === 'execution_update' ? 'تحديث تنفيذ' : 'ملاحظة متابعة',
      date: comment.created_at,
      actor: actorName(comment.author_user_id),
      text: comment.body,
      progress: null,
      reference: null,
    })),
    ...finding.status_history.map((historyItem) => ({
      id: `status-${historyItem.id}`,
      type: 'تغيير حالة الملاحظة',
      date: historyItem.changed_at,
      actor: actorName(historyItem.changed_by),
      text: `${historyItem.from_status ? `${statusLabels[historyItem.from_status]} ← ` : ''}${statusLabels[historyItem.to_status]}${historyItem.reason ? ` — ${historyItem.reason}` : ''}`,
      progress: historyItem.progress_after,
      reference: null,
    })),
    ...finding.corrective_actions
      .filter((action) => action.updated_by !== null)
      .map((action) => ({
        id: `action-${action.id}-${action.lock_version}`,
        type: 'تحديث نسبة الإنجاز',
        date: action.updated_at,
        actor: actorName(action.updated_by),
        text: action.execution_details ?? `تحديث الإجراء التصحيحي رقم ${action.action_no}`,
        progress: action.progress_percent,
        reference: null,
      })),
  ]

  return events.sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime())
}

function FindingReferenceImage({ code }: { code: string }) {
  const [failed, setFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  if (failed) return <p style={{ color: 'var(--muted)' }}>لا تتوفر صورة مرجعية لهذه الملاحظة؛ النص الرسمي أعلاه هو المرجع النصي المعتمد.</p>

  return (
    <>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 12, marginTop: 14 }}>
        <img
          src={`${import.meta.env.BASE_URL}financial-control/findings/${code}.webp`}
          alt={`المرجع الرسمي للملاحظة ${code}`}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ display: 'block', width: 'auto', maxWidth: 'min(100%, 440px)', maxHeight: 420, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)' }}
        />
        <button className="secondary-button" type="button" onClick={() => setExpanded(true)}>عرض بالحجم الكامل</button>
      </div>
      {expanded ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`المرجع الرسمي للملاحظة ${code} بالحجم الكامل`}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(10, 28, 45, 0.88)', display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, padding: 20 }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="secondary-button" type="button" onClick={() => setExpanded(false)}>إغلاق العرض</button>
          </div>
          <div style={{ overflow: 'auto', display: 'grid', placeItems: 'start center' }}>
            <img
              src={`${import.meta.env.BASE_URL}financial-control/findings/${code}.webp`}
              alt={`المرجع الرسمي للملاحظة ${code} بالحجم الكامل`}
              style={{ display: 'block', width: 827, maxWidth: 'none', height: 'auto', borderRadius: 10, background: '#fff' }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

interface FinancialControlPageProps {
  onOpenWorkspace: () => void
}

export function FinancialControlPage({ onOpenWorkspace }: FinancialControlPageProps) {
  const [data, setData] = useState<FinancialControlDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState<'all' | FinancialControlAssessmentRating>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | FinancialControlFindingStatus>('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [dueDateFilter, setDueDateFilter] = useState('all')
  const [sortBy, setSortBy] = useState<FindingSort>('code_asc')
  const [workQueue, setWorkQueue] = useState<WorkQueueKey>('all')
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null)
  const [actionProgress, setActionProgress] = useState<Record<string, string>>({})
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({})
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({})
  const [findingReason, setFindingReason] = useState('')
  const [mutationKey, setMutationKey] = useState<string | null>(null)
  const [mutationSuccess, setMutationSuccess] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const applyDashboardData = (dashboard: FinancialControlDashboardData) => {
    setData(dashboard)
    setActionProgress(Object.fromEntries(
      dashboard.correctiveActions.map((action) => [action.id, String(action.progress_percent)]),
    ))
    setActionNotes(Object.fromEntries(
      dashboard.correctiveActions.map((action) => [action.id, action.execution_details ?? '']),
    ))
  }

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)

    try {
      applyDashboardData(await getFinancialControlDashboard())
    } catch (requestError: unknown) {
      setData(null)
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'تعذر تحميل بيانات الرقابة المالية. تحقق من الاتصال والصلاحيات.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchDashboard()
  }, [])

  const owners = useMemo(
    () => Array.from(new Set(data?.findings.map((finding) => finding.official_owner_label) ?? [])).sort(),
    [data],
  )
  const dueDates = useMemo(
    () => Array.from(new Set(data?.findings.map((finding) => finding.official_due_date) ?? [])).sort(),
    [data],
  )

  const filteredFindings = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ar')
    const queue = [...employeeQueues, ...managerQueues].find((item) => item.key === workQueue)
    const findings = (data?.findings ?? []).filter((finding) => {
      const matchesSearch = normalizedSearch.length === 0 || [
        finding.reference_code,
        finding.case_code,
        finding.title,
        finding.official_finding_text,
        finding.official_owner_label,
        finding.official_recommendation ?? '',
      ].some((value) => value.toLocaleLowerCase('ar').includes(normalizedSearch))

      return matchesSearch
        && (!queue || queue.test(finding))
        && (ratingFilter === 'all' || finding.assessment_rating === ratingFilter)
        && (statusFilter === 'all' || finding.workflow_status === statusFilter)
        && (ownerFilter === 'all' || finding.official_owner_label === ownerFilter)
        && (dueDateFilter === 'all' || finding.official_due_date === dueDateFilter)
    })

    return findings.sort((first, second) => {
      if (sortBy === 'code_asc') return first.reference_code.localeCompare(second.reference_code, 'ar', { numeric: true })
      if (sortBy === 'code_desc') return second.reference_code.localeCompare(first.reference_code, 'ar', { numeric: true })
      if (sortBy === 'date_asc') return first.official_due_date.localeCompare(second.official_due_date)
      if (sortBy === 'date_desc') return second.official_due_date.localeCompare(first.official_due_date)
      return statusLabels[first.workflow_status].localeCompare(statusLabels[second.workflow_status], 'ar')
    })
  }, [data, dueDateFilter, ownerFilter, ratingFilter, search, sortBy, statusFilter, workQueue])

  const selectedFinding = data?.findings.find((finding) => finding.id === selectedFindingId) ?? null
  const currentRoles = data?.memberships.map((membership) => membership.role) ?? []
  const currentUserId = data?.memberships[0]?.user_id ?? null
  const profileNames = new Map(data?.profiles.map((profile) => [profile.id, profile.full_name]) ?? [])
  const selectedTimeline = selectedFinding ? buildTimeline(selectedFinding, profileNames) : []
  const stats: Array<{ label: string; value: string; icon: IconName }> = data
    ? [
        { label: 'إجمالي الملاحظات', value: String(data.summary.totalFindings), icon: 'report' },
        { label: 'قيد التنفيذ', value: String(data.summary.inProgressFindings), icon: 'clock' },
        { label: 'متأخرة', value: String(data.summary.overdueFindings), icon: 'alert' },
        { label: 'مغلقة', value: String(data.summary.closedFindings), icon: 'check' },
        { label: 'إجمالي الإجراءات التصحيحية', value: String(data.summary.totalCorrectiveActions), icon: 'tasks' },
      ]
    : []

  const resetFilters = () => {
    setSearch('')
    setRatingFilter('all')
    setStatusFilter('all')
    setOwnerFilter('all')
    setDueDateFilter('all')
    setSortBy('code_asc')
    setWorkQueue('all')
  }

  const runMutation = async (key: string, successMessage: string, operation: () => Promise<void>) => {
    setMutationKey(key)
    setMutationSuccess(null)
    setMutationError(null)

    try {
      await operation()
      applyDashboardData(await getFinancialControlDashboard())
      setMutationSuccess(successMessage)
      return true
    } catch (requestError: unknown) {
      setMutationError(mutationErrorMessage(requestError))
      return false
    } finally {
      setMutationKey(null)
    }
  }

  const handleProgressSave = (action: FinancialControlCorrectiveAction) => {
    const progressPercent = Number(actionProgress[action.id])
    void runMutation(
      `progress-${action.id}`,
      'تم حفظ نسبة الإنجاز وملاحظة التحديث بنجاح.',
      () => updateCorrectiveActionProgressAndStart({
        correctiveActionId: action.id,
        progressPercent,
        executionDetails: actionNotes[action.id] ?? '',
        expectedLockVersion: action.lock_version,
        workflowStatus: action.workflow_status,
      }),
    )
  }

  const handleFindingTransition = (finding: FinancialControlFinding, option: FindingTransitionOption) => {
    void runMutation(
      `finding-${finding.id}`,
      `تم تحديث حالة الملاحظة إلى «${statusLabels[option.to]}» بنجاح.`,
      () => transitionFinancialControlFinding({
        findingId: finding.id,
        toStatus: option.to,
        reason: findingReason,
        expectedLockVersion: finding.lock_version,
      }),
    )
  }

  const handleActionTransition = (
    action: FinancialControlCorrectiveAction,
    option: ActionTransitionOption,
  ) => {
    void runMutation(
      `action-${action.id}`,
      `تم تحديث حالة الإجراء إلى «${actionStatusLabels[option.to]}» بنجاح.`,
      () => transitionFinancialControlAction({
        correctiveActionId: action.id,
        fromStatus: action.workflow_status,
        toStatus: option.to,
        reason: actionReasons[action.id] ?? '',
        expectedLockVersion: action.lock_version,
      }),
    )
  }

  const availableFindingTransitions = selectedFinding
    ? (findingTransitions[selectedFinding.workflow_status] ?? []).filter((option) =>
        option.roles.some((role) => currentRoles.includes(role))
        && (option.to !== 'submitted_for_manager_review'
          || selectedFinding.corrective_actions.every((action) =>
            action.workflow_status === 'submitted_for_manager_review' || action.workflow_status === 'completed'))
        && (option.to !== 'approved'
          || (selectedFinding.corrective_actions.flatMap((action) => action.document_references).length > 0
            && selectedFinding.corrective_actions
              .flatMap((action) => action.document_references)
              .every((reference) => reference.manager_verification_status === 'approved'))),
      )
    : []

  if (selectedFinding) {
    const lastSentEmail = selectedFinding.messages.find((message) => message.message_type === 'sent_email')
    const lastOfficialReply = selectedFinding.messages.find((message) => message.message_type === 'department_reply')
    const lastActivityDate = selectedTimeline[0]?.date ?? selectedFinding.last_activity_at ?? selectedFinding.updated_at
    const snapshot = toCaseSnapshot(selectedFinding)
    const daysWithoutUpdate = daysWithoutCaseUpdate(snapshot)
    const needsManagerReview = ['submitted_for_manager_review', 'under_manager_review'].includes(selectedFinding.workflow_status)
    const trackingProgress = selectedFinding.corrective_actions.length > 0
      ? Math.round(selectedFinding.corrective_actions.reduce((sum, action) => sum + action.progress_percent, 0) / selectedFinding.corrective_actions.length)
      : selectedFinding.progress_percent
    const currentStage = caseWorkflowStage(snapshot)
    const stages = ['بدء المتابعة', 'المراسلات', 'التنفيذ', 'مراجعة المدير', 'الإغلاق']
    const suggestedAction = suggestedFindingAction(selectedFinding, currentRoles)
    const timeAlert = dueAlert(selectedFinding)
    const otherFindingTransitions = availableFindingTransitions.filter(
      (option) => option.to !== suggestedAction.transition?.to,
    )

    return (
      <div className="detail-panel" data-testid="financial-control-details">
        <div className="breadcrumb">الرئيسية / تقرير الكفاءة الرقابية / {selectedFinding.reference_code}</div>
        <div className="page-heading">
          <div>
            <span className="eyebrow">الملاحظة الرقابية {selectedFinding.reference_code}</span>
            <h1>{selectedFinding.title}</h1>
            <p>{selectedFinding.case_code}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => setSelectedFindingId(null)} data-testid="finding-back-button">
            <Icon name="arrow" size={19}/> رجوع إلى الملاحظات
          </button>
        </div>

        {mutationSuccess ? (
          <section className="panel" role="status" style={{ color: '#2f7c4f', background: '#eefbf4' }}>{mutationSuccess}</section>
        ) : null}
        {mutationError ? (
          <section className="panel" role="alert" style={{ color: 'var(--danger)', background: '#fff0f0' }}>{mutationError}</section>
        ) : null}

        <section className="detail-section" aria-label="مسار الملاحظة والإجراء التالي">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', overflowX: 'auto', gap: 8, paddingBottom: 4 }}>
            {stages.map((stage, index) => (
              <div key={stage} style={{ minWidth: 110, display: 'grid', gap: 8, textAlign: 'center' }}>
                <div style={{ height: 7, borderRadius: 999, background: index <= currentStage ? 'var(--primary)' : '#dce5ea' }}/>
                <strong style={{ color: index <= currentStage ? '#17324d' : 'var(--muted)', fontSize: 13 }}>{stage}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 18 }}>
            <div className="detail-card">
              <span>الحالة الحالية</span>
              <strong>{operationalStatusLabel(snapshot)}</strong>
              {timeAlert ? <small style={{ color: timeAlert.tone === 'danger' ? 'var(--danger)' : '#9a6b00' }}>{timeAlert.label}</small> : null}
              {daysWithoutUpdate >= STALE_DAYS ? <small style={{ color: '#9a6b00' }}>بلا تحديث منذ {daysWithoutUpdate} يومًا</small> : null}
            </div>
            <div className="detail-card" style={{ gridColumn: 'span 2' }}>
              <span>الإجراء التالي المقترح</span>
              <strong>{suggestedAction.label}</strong>
              <p style={{ color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>{suggestedAction.reason}</p>
              <div style={{ marginTop: 10 }}>
                {suggestedAction.kind === 'update' && suggestedAction.updateKind ? (
                  <FindingUpdatePanel
                    key={`${selectedFinding.id}-${suggestedAction.updateKind}`}
                    finding={selectedFinding}
                    roles={currentRoles}
                    busy={mutationKey !== null}
                    initialKind={suggestedAction.updateKind}
                    triggerLabel={suggestedAction.label}
                    showKindSelector={suggestedAction.label === 'تسجيل متابعة أو رد'}
                    onRun={runMutation}
                  />
                ) : suggestedAction.kind === 'transition' && suggestedAction.transition ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={mutationKey !== null}
                    onClick={() => handleFindingTransition(selectedFinding, suggestedAction.transition!)}
                  >
                    {mutationKey === `finding-${selectedFinding.id}` ? 'جاري التنفيذ...' : suggestedAction.label}
                  </button>
                ) : suggestedAction.kind === 'guidance' ? (
                  <span className="status">استكمل دورة الإجراء التصحيحي أدناه</span>
                ) : (
                  <span className="status muted">قراءة فقط</span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="detail-section" aria-label="ملخص متابعة الملاحظة">
          <h2>ملخص المتابعة</h2>
          <div className="detail-grid" style={{ marginTop: 14 }}>
            <div className="detail-card"><span>آخر تحديث</span><strong>{formatArabicDateTime(lastActivityDate)}</strong></div>
            <div className="detail-card"><span>آخر بريد مرسل</span><strong>{lastSentEmail ? formatArabicDateTime(lastSentEmail.sent_at) : 'لا يوجد'}</strong></div>
            <div className="detail-card"><span>آخر رد</span><strong>{lastOfficialReply ? formatArabicDateTime(lastOfficialReply.sent_at) : 'لا يوجد'}</strong></div>
            <div className="detail-card"><span>عدد الأيام دون تحديث</span><strong>{daysWithoutUpdate} يوم</strong></div>
            <div className="detail-card"><span>نسبة الإنجاز</span><strong>{trackingProgress}%</strong></div>
            <div className="detail-card"><span>تحتاج مراجعة المدير؟</span><strong>{needsManagerReview ? 'نعم' : 'لا'}</strong></div>
            <div className="detail-card"><span>تجاوزت الموعد؟</span><strong>{isFindingOverdue(selectedFinding) ? 'نعم' : 'لا'}</strong></div>
          </div>
        </section>

        <div className="detail-grid">
          <section className="detail-card">
            <h2>بيانات المتابعة</h2>
            <div className="detail-item"><span>التقييم</span><strong>{ratingLabels[selectedFinding.assessment_rating]}</strong></div>
            <div className="detail-item"><span>الحالة</span><strong>{operationalStatusLabel(snapshot)}</strong></div>
            <div className="detail-item"><span>المسؤول الرسمي</span><strong>{selectedFinding.official_owner_label}</strong></div>
            <div className="detail-item"><span>الموعد المستهدف</span><strong>{formatArabicDate(selectedFinding.official_due_date)}</strong></div>
            <div className="detail-item"><span>نسبة الإنجاز</span><strong>{trackingProgress}%</strong></div>
            <div className="detail-item"><span>نسخة السجل</span><strong>{selectedFinding.lock_version}</strong></div>
            {(otherFindingTransitions.length > 0 || currentRoles.some((role) => ['owner', 'manager', 'action_owner'].includes(role))) ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 700 }}>إجراءات أخرى</summary>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    <FindingUpdatePanel
                      key={`${selectedFinding.id}-other`}
                      finding={selectedFinding}
                      roles={currentRoles}
                      busy={mutationKey !== null}
                      triggerLabel="إضافة تحديث آخر"
                      triggerClassName="secondary-button"
                      onRun={runMutation}
                    />
                {otherFindingTransitions.some((option) => option.to === 'returned_for_revision' || option.to === 'reopened') ? (
                  <textarea
                    aria-label="سبب انتقال حالة الملاحظة"
                    value={findingReason}
                    onChange={(event) => setFindingReason(event.target.value)}
                    placeholder="اكتب سبب الإرجاع أو إعادة الفتح"
                    rows={3}
                    style={{ ...controlStyle, minHeight: 88, padding: 12, resize: 'vertical' }}
                  />
                ) : null}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {otherFindingTransitions.map((option) => {
                    const reasonRequired = option.to === 'returned_for_revision' || option.to === 'reopened'
                    return (
                      <button
                        className="secondary-button"
                        type="button"
                        key={option.to}
                        disabled={mutationKey !== null || (reasonRequired && !findingReason.trim())}
                        onClick={() => handleFindingTransition(selectedFinding, option)}
                      >
                        {mutationKey === `finding-${selectedFinding.id}` ? 'جاري الحفظ...' : option.label}
                      </button>
                    )
                  })}
                </div>
                  </div>
                </details>
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', marginTop: 12 }}>لا توجد انتقالات متاحة لدورك الحالي في هذه الحالة.</p>
            )}
          </section>
          <section className="detail-card">
            <h2>الضابط أو المعيار</h2>
            <p style={{ color: '#2d4357', lineHeight: 1.9 }}>{selectedFinding.control_reference}</p>
          </section>
        </div>

        <section className="detail-section">
          <h2>النص الرسمي للملاحظة</h2>
          <p style={{ color: '#2d4357', lineHeight: 2, marginTop: 12 }}>{selectedFinding.official_finding_text}</p>
        </section>

        <section className="detail-section">
          <h2>المرجع الرسمي للملاحظة</h2>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>صورة مرجعية مساعدة من الأصل الوظيفي، ولا تستبدل النص الرسمي القابل للبحث.</p>
          <FindingReferenceImage code={selectedFinding.reference_code}/>
        </section>

        <section className="detail-section">
          <h2>التوصية والإجراء التصحيحي</h2>
          {selectedFinding.corrective_actions.length > 0 ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
              {selectedFinding.corrective_actions.map((action) => {
                const availableActionTransitions = (actionTransitions[action.workflow_status] ?? []).filter((option) =>
                  actionRoleAllowed(option, action, currentRoles, currentUserId)
                  && (option.to !== 'submitted_for_manager_review'
                    || (action.progress_percent === 100
                      && Boolean(action.execution_details?.trim())
                      && action.document_references.length > 0)),
                )
                const canUpdateProgress = currentRoles.includes('action_owner')
                  && action.responsible_user_id === currentUserId

                return (
                  <article key={action.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <strong>الإجراء رقم {action.action_no}</strong>
                      <span className="status">{actionStatusLabels[action.workflow_status]}</span>
                    </div>
                    <p style={{ color: '#2d4357', lineHeight: 2 }}>{action.official_action_text}</p>
                    <div className="detail-item"><span>الموعد</span><strong>{formatArabicDate(action.current_due_date)}</strong></div>
                    <div className="detail-item"><span>الإنجاز</span><strong>{action.progress_percent}%</strong></div>
                    <div className="detail-item"><span>نسخة السجل (lock_version)</span><strong>{action.lock_version}</strong></div>

                    <DocumentReferencesSection
                      action={action}
                      findingStatus={selectedFinding.workflow_status}
                      roles={currentRoles}
                      currentUserId={currentUserId}
                      busy={mutationKey !== null}
                      onRun={runMutation}
                    />

                    <div style={{ display: 'grid', gap: 10, paddingTop: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 16 }}>تحديث التنفيذ</h3>
                      <label style={{ color: 'var(--muted)', fontSize: 13 }} htmlFor={`progress-${action.id}`}>نسبة الإنجاز من 0 إلى 100</label>
                      <input
                        id={`progress-${action.id}`}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={actionProgress[action.id] ?? String(action.progress_percent)}
                        onChange={(event) => setActionProgress((current) => ({ ...current, [action.id]: event.target.value }))}
                        disabled={!canUpdateProgress || mutationKey !== null}
                        style={controlStyle}
                      />
                      <textarea
                        aria-label={`ملاحظة تحديث الإجراء ${action.action_no}`}
                        value={actionNotes[action.id] ?? ''}
                        onChange={(event) => setActionNotes((current) => ({ ...current, [action.id]: event.target.value }))}
                        placeholder="ملاحظة التحديث التشغيلية"
                        rows={3}
                        disabled={!canUpdateProgress || mutationKey !== null}
                        style={{ ...controlStyle, minHeight: 88, padding: 12, resize: 'vertical' }}
                      />
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!canUpdateProgress || mutationKey !== null || !(actionNotes[action.id] ?? '').trim()}
                        onClick={() => handleProgressSave(action)}
                      >
                        {mutationKey === `progress-${action.id}` ? 'جاري الحفظ...' : 'حفظ تحديث الإنجاز'}
                      </button>
                      {!canUpdateProgress ? (
                        <p style={{ color: 'var(--muted)', fontSize: 13 }}>دورك الحالي لا يسمح بتعديل التنفيذ لهذا الإجراء.</p>
                      ) : null}
                    </div>

                    {availableActionTransitions.length > 0 ? (
                      <div style={{ display: 'grid', gap: 10, paddingTop: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>انتقال حالة الإجراء</h3>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {availableActionTransitions.map((option) => (
                            <button
                              className="secondary-button"
                              type="button"
                              key={option.to}
                              disabled={mutationKey !== null}
                              onClick={() => handleActionTransition(action, option)}
                            >
                              {mutationKey === `action-${action.id}` ? 'جاري الحفظ...' : option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {action.workflow_status === 'in_progress'
                      && canUpdateProgress
                      && !availableActionTransitions.some((option) => option.to === 'submitted_for_manager_review') ? (
                        <p style={{ color: 'var(--muted)', margin: 0 }}>
                          يظهر «إرسال الإجراء للمدير» بعد وصول الإنجاز إلى 100%، واستكمال تفاصيل التنفيذ، وإضافة مستند مرجعي واحد على الأقل.
                        </p>
                      ) : null}

                  </article>
                )
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>لا يوجد إجراء تصحيحي موثق لهذه الملاحظة.</p>
          )}
        </section>

        <section className="detail-section" data-testid="finding-timeline">
          <h2>السجل الزمني الموحد</h2>
          {selectedTimeline.length > 0 ? (
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              {selectedTimeline.map((event) => (
                <article key={event.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>{event.type}</strong>
                    <time dateTime={event.date}>{formatArabicDateTime(event.date)}</time>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>سجله: {event.actor}</div>
                  <p style={{ color: '#2d4357', lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{event.text}</p>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                    {event.progress !== null ? <span>نسبة الإنجاز: <strong>{event.progress}%</strong></span> : null}
                    {event.reference ? <span>مرجع البريد: <strong>{event.reference}</strong></span> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>لا توجد تحديثات تشغيلية أو انتقالات حالة مسجلة حتى الآن.</p>
          )}
        </section>
      </div>
    )
  }

  return (
    <>
      <div className="breadcrumb">الرئيسية / مساحات العمل / تقرير الكفاءة الرقابية</div>
      <div className="page-heading">
        <div><span className="eyebrow">مساحة العمل الحالية</span><h1>تقرير الكفاءة الرقابية</h1><p>متابعة الضوابط والملاحظات والخطط التصحيحية والاعتمادات.</p></div>
        <button className="primary-button" onClick={onOpenWorkspace}>عرض مساحات العمل <Icon name="arrow" size={19}/></button>
      </div>

      {loading ? (
        <section className="panel" aria-live="polite">
          <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>جاري تحميل بيانات الرقابة المالية...</p>
        </section>
      ) : error ? (
        <section className="panel" role="alert" style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
          <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
          <button className="secondary-button" type="button" onClick={fetchDashboard}>إعادة المحاولة</button>
        </section>
      ) : data ? (
        <>
          <div className="stats-grid">
            {stats.map(({ label, value, icon }) => (
              <article className="stat-card" key={label}><div className="stat-icon"><Icon name={icon} size={22}/></div><div><span>{label}</span><strong>{value}</strong></div></article>
            ))}
          </div>

          {currentRoles.some((role) => ['owner', 'specialist', 'action_owner'].includes(role)) ? (
            <section className="panel" style={{ marginBottom: 20 }} data-testid="employee-work-queues">
              <div className="panel-header">
                <div><span className="eyebrow">مسار الموظف</span><h2>عملي اليوم</h2><p>اختر قائمة للانتقال مباشرة إلى الملاحظات التي تحتاج انتباهك.</p></div>
                {workQueue !== 'all' ? <button className="text-button" type="button" onClick={() => setWorkQueue('all')}>عرض الكل</button> : null}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                {employeeQueues.map((queue) => {
                  const count = data.findings.filter(queue.test).length
                  const selected = workQueue === queue.key
                  return (
                    <button
                      key={queue.key}
                      type="button"
                      onClick={() => setWorkQueue(selected ? 'all' : queue.key)}
                      aria-pressed={selected}
                      style={{ textAlign: 'right', border: selected ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: 12, background: selected ? '#eef7f8' : '#fff', padding: 14, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                    >
                      <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 8 }}>{queue.label}</span>
                      <strong style={{ display: 'block', fontSize: 26 }}>{count}</strong>
                      <small style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{queue.description}</small>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          {currentRoles.some((role) => role === 'owner' || role === 'manager') ? (
            <section className="panel" style={{ marginBottom: 20 }} data-testid="manager-work-queues">
              <div className="panel-header">
                <div><span className="eyebrow">مسار المدير</span><h2>بانتظار مراجعتي</h2><p>قوائم المراجعة والاعتماد والإغلاق حسب الحالة الفعلية.</p></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                {managerQueues.map((queue) => {
                  const count = data.findings.filter(queue.test).length
                  const selected = workQueue === queue.key
                  return (
                    <button
                      key={queue.key}
                      type="button"
                      onClick={() => setWorkQueue(selected ? 'all' : queue.key)}
                      aria-pressed={selected}
                      style={{ textAlign: 'right', border: selected ? '2px solid var(--primary)' : '1px solid var(--border)', borderRadius: 12, background: selected ? '#eef7f8' : '#fff', padding: 14, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                    >
                      <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 8 }}>{queue.label}</span>
                      <strong style={{ display: 'block', fontSize: 26 }}>{count}</strong>
                      <small style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{queue.description}</small>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-header">
              <div><h2>البحث والتصفية</h2><p>ابحث في الكود أو النص الرسمي أو الجهة المسؤولة</p></div>
              <button className="text-button" type="button" onClick={resetFilters}>إعادة الضبط</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
              <input aria-label="بحث الملاحظات" data-testid="finding-search" style={controlStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="الكود أو النص أو المسؤول" />
              <select aria-label="تصفية حسب التقييم" data-testid="rating-filter" style={controlStyle} value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value as 'all' | FinancialControlAssessmentRating)}>
                <option value="all">كل التقييمات</option>
                <option value="partially_effective">شبه فعال</option>
                <option value="not_exists">غير موجود</option>
              </select>
              <select aria-label="تصفية حسب الحالة" data-testid="status-filter" style={controlStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | FinancialControlFindingStatus)}>
                <option value="all">كل الحالات</option>
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <select aria-label="تصفية حسب الجهة المسؤولة" data-testid="owner-filter" style={controlStyle} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">كل الجهات المسؤولة</option>
                {owners.map((owner) => <option value={owner} key={owner}>{owner}</option>)}
              </select>
              <select aria-label="تصفية حسب تاريخ الاستحقاق" data-testid="due-date-filter" style={controlStyle} value={dueDateFilter} onChange={(event) => setDueDateFilter(event.target.value)}>
                <option value="all">كل تواريخ الاستحقاق</option>
                {dueDates.map((date) => <option value={date} key={date}>{formatArabicDate(date)}</option>)}
              </select>
              <select aria-label="ترتيب الملاحظات" data-testid="finding-sort" style={controlStyle} value={sortBy} onChange={(event) => setSortBy(event.target.value as FindingSort)}>
                <option value="code_asc">الكود: تصاعدي</option>
                <option value="code_desc">الكود: تنازلي</option>
                <option value="date_asc">التاريخ: الأقرب أولًا</option>
                <option value="date_desc">التاريخ: الأبعد أولًا</option>
                <option value="status">الحالة</option>
              </select>
            </div>
          </section>

          <section className="panel" data-testid="findings-panel">
            <div className="panel-header">
              <div><h2>{workQueue === 'all' ? 'الملاحظات الرقابية' : [...employeeQueues, ...managerQueues].find((queue) => queue.key === workQueue)?.label}</h2><p aria-live="polite" data-testid="findings-count">عرض {filteredFindings.length} من {data.findings.length} ملاحظة</p></div>
            </div>
            {filteredFindings.length > 0 ? (
              <div className="table-wrap"><table style={{ minWidth: 1180 }}><thead><tr><th>الكود والملاحظة</th><th>رقم الحالة</th><th>التقييم</th><th>المسؤول</th><th>الحالة</th><th>الموعد</th><th>الإنجاز</th><th></th></tr></thead><tbody data-testid="findings-table-body">
                {filteredFindings.map((item) => (
                  <tr key={item.id} data-testid="finding-row">
                    <td style={{ maxWidth: 340 }}><strong>{item.reference_code} — {item.title}</strong><span style={{ color: 'var(--muted)', display: 'block', marginTop: 5, lineHeight: 1.6 }}>{item.official_finding_text.slice(0, 115)}{item.official_finding_text.length > 115 ? '…' : ''}</span></td>
                    <td>{item.case_code}</td>
                    <td>{ratingLabels[item.assessment_rating]}</td>
                    <td>{item.official_owner_label}</td>
                    <td><span className={`status ${statusClass(item)}`}>{isFindingOverdue(item) ? 'متأخرة' : operationalStatusLabel(toCaseSnapshot(item))}</span>{dueAlert(item) ? <small style={{ display: 'block', marginTop: 6, color: dueAlert(item)?.tone === 'danger' ? 'var(--danger)' : '#9a6b00' }}>{dueAlert(item)?.label}</small> : null}</td>
                    <td>{formatArabicDate(item.official_due_date)}</td>
                    <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${findingProgress(item)}%` }} /></div><span>{findingProgress(item)}%</span></div></td>
                    <td><button className="secondary-button" type="button" onClick={() => setSelectedFindingId(item.id)} aria-label={`فتح تفاصيل الملاحظة ${item.reference_code}`}>التفاصيل</button></td>
                  </tr>
                ))}
              </tbody></table></div>
            ) : (
              <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>
                {data.findings.length === 0
                  ? 'لا توجد سجلات مسندة إليك حاليًا.'
                  : 'لا توجد ملاحظات مطابقة لمعايير البحث والتصفية.'}
              </p>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
