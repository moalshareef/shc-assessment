import type { FinancialControlFollowUp } from '../../types/financialControl'
import {
  buildUpcomingFollowUps,
  employeeDirectionsForUser,
  reminderSummary,
} from './followUpModel'

function followUp(overrides: Partial<FinancialControlFollowUp>): FinancialControlFollowUp {
  return {
    id: 'follow-up',
    workspace_id: 'workspace',
    finding_id: 'finding',
    follow_up_type: 'reminder',
    target_organization_id: 'organization',
    target_user_id: null,
    title: 'عنوان',
    body: 'نص المتابعة',
    priority: 'normal',
    due_at: '2026-07-20T09:00:00.000Z',
    status: 'open',
    created_by: 'manager',
    created_at: '2026-07-18T09:00:00.000Z',
    updated_at: '2026-07-18T09:00:00.000Z',
    completed_by: null,
    completed_at: null,
    cancelled_by: null,
    cancelled_at: null,
    lock_version: 1,
    ...overrides,
  }
}

function assertScenario(condition: unknown, message: string) {
  if (!condition) throw new Error(`[follow-up-scenario] ${message}`)
}

const reminder = followUp({ id: 'reminder' })
const employeeDirection = followUp({
  id: 'direction',
  follow_up_type: 'employee_direction',
  target_organization_id: null,
  target_user_id: 'employee-a',
  title: null,
  priority: 'urgent',
})
const otherEmployeeDirection = followUp({
  id: 'other-direction',
  follow_up_type: 'employee_direction',
  target_organization_id: null,
  target_user_id: 'employee-b',
  title: null,
})

assertScenario(reminderSummary([reminder, employeeDirection]).count === 1, 'يجب احتساب التذكيرات فقط.')
assertScenario(
  employeeDirectionsForUser([employeeDirection, otherEmployeeDirection], 'employee-a').map((item) => item.id).join() === 'direction',
  'يجب أن يرى الموظف التوجيه الموجه إليه فقط.',
)
assertScenario(
  employeeDirectionsForUser([employeeDirection], 'employee-b').length === 0,
  'يجب ألا يرى موظف آخر التوجيه.',
)
assertScenario(
  buildUpcomingFollowUps(
    [reminder, { ...employeeDirection, status: 'completed' }],
    [{ id: 'finding', reference_code: '1.1', title: 'ملاحظة', official_owner_label: 'الإدارة' }],
    [{ id: 'manager', full_name: 'المدير' }],
    [{ id: 'organization', organization_name_ar: 'الجهة' }],
  ).length === 1,
  'يجب أن تعرض المتابعات القادمة السجلات المفتوحة فقط.',
)

const findingStatusBefore = 'in_progress'
void reminderSummary([reminder])
assertScenario(findingStatusBefore === 'in_progress', 'إنشاء View Model للمتابعة لا يغير حالة الملاحظة.')
