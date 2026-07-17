import type { FinancialControlFinding } from '../../types/financialControl'
import {
  buildManagerDashboardViewModel,
  matchesManagerDashboardFilter,
} from './managerDashboardViewModel'

const NOW = new Date('2026-07-18T12:00:00.000Z')

function finding(
  id: string,
  overrides: Partial<FinancialControlFinding> = {},
): FinancialControlFinding {
  return {
    id,
    workspace_id: 'workspace',
    sequence_no: Number(id.replace(/\D/g, '')) || 1,
    case_code: `CASE-${id}`,
    reference_code: id,
    title: `ملاحظة ${id}`,
    assessment_rating: 'partially_effective',
    assessment_rating_label: 'شبه فعال',
    official_owner_label: 'إدارة الاختبار',
    workflow_status: 'in_progress',
    progress_percent: 25,
    official_due_date: '2026-07-30',
    current_due_date: '2026-07-30',
    official_finding_text: 'نص الملاحظة',
    control_reference: 'مرجع',
    control_summary: 'ملخص',
    last_activity_at: '2026-07-17T09:00:00.000Z',
    updated_at: '2026-07-17T09:00:00.000Z',
    lock_version: 1,
    official_recommendation: null,
    corrective_actions: [],
    status_history: [],
    messages: [],
    comments: [],
    ...overrides,
  }
}

function assertScenario(condition: unknown, message: string) {
  if (!condition) throw new Error(`[manager-dashboard-scenario] ${message}`)
}

const overdue = finding('1', { current_due_date: '2026-07-10' })
const returned = finding('2', {
  workflow_status: 'returned_for_revision',
  status_history: [{
    id: 'history-2',
    workspace_id: 'workspace',
    finding_id: '2',
    from_status: 'under_manager_review',
    to_status: 'returned_for_revision',
    transition_code: 'return',
    reason: 'استكمال المستند',
    progress_before: 100,
    progress_after: 100,
    due_date_before: null,
    due_date_after: null,
    changed_by: 'manager',
    changed_at: '2026-07-16T09:00:00.000Z',
  }],
  updated_at: '2026-07-16T09:00:00.000Z',
  last_activity_at: '2026-07-16T09:00:00.000Z',
})
const closed = finding('3', { workflow_status: 'closed', progress_percent: 100 })

const model = buildManagerDashboardViewModel([overdue, returned, closed], NOW)
assertScenario(model.summary.total === 3, 'يجب احتساب جميع الملاحظات المتاحة للمدير.')
assertScenario(model.summary.overdue === 1, 'يجب احتساب الملاحظات المفتوحة التي تجاوزت موعدها.')
assertScenario(
  model.alerts.find((item) => item.key === 'alert_returned_not_updated')?.count === 1,
  'يجب كشف الملاحظة المعادة التي لم تسجل نشاطًا بعد الإرجاع.',
)
assertScenario(
  matchesManagerDashboardFilter(overdue, 'alert_overdue', NOW),
  'يجب أن يطابق فلتر البطاقة السجلات المرتبطة بها.',
)
assertScenario(
  !matchesManagerDashboardFilter(closed, 'alert_overdue', NOW),
  'يجب ألا يعرض فلتر التأخير الملاحظات المغلقة.',
)

const emptyDecisions = buildManagerDashboardViewModel([finding('4')], NOW)
assertScenario(
  emptyDecisions.decisions.every((item) => item.count === 0),
  'يجب دعم حالة المدير الذي لا توجد لديه قرارات معلقة.',
)

const notStartedOpen = finding('5', {
  workflow_status: 'not_started',
  progress_percent: 0,
  current_due_date: '2026-09-30',
  updated_at: '2026-07-17T09:00:00.000Z',
  last_activity_at: '2026-07-17T09:00:00.000Z',
})
const executionStarted = finding('6', {
  workflow_status: 'in_progress',
  progress_percent: 20,
})
const openExecutionModel = buildManagerDashboardViewModel([notStartedOpen, executionStarted], NOW)
assertScenario(openExecutionModel.summary.open === 2, 'المفتوحة تشمل كل ملاحظة لم تغلق.')
assertScenario(openExecutionModel.summary.inProgress === 1, 'قيد التنفيذ تشمل فقط ما بدأ تنفيذه فعليًا.')

const zeroProgressStale = finding('7', {
  workflow_status: 'not_started',
  progress_percent: 0,
  current_due_date: '2026-09-30',
  updated_at: '2026-07-01T09:00:00.000Z',
  last_activity_at: '2026-07-01T09:00:00.000Z',
  official_owner_label: 'إدارة لم تبدأ',
})
const departmentIndicatorModel = buildManagerDashboardViewModel([zeroProgressStale], NOW)
assertScenario(
  departmentIndicatorModel.departments[0]?.indicator === 'needs_follow_up',
  'الإدارة ذات الإنجاز 0% وآخر تحديث قديم يجب أن تحتاج متابعة.',
)
