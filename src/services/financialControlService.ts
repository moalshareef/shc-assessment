import { supabase } from '../lib/supabase'
import type {
  FinancialControlCorrectiveAction,
  FinancialControlDashboardData,
  FinancialControlFinding,
  FinancialControlFindingStatus,
  FinancialControlMembership,
  FinancialControlStatusHistory,
  FinancialControlSummary,
  FinancialControlWorkspace,
} from '../types/financialControl'
import { FinancialControlServiceError } from '../types/financialControl'

const FINANCIAL_CONTROL_WORKSPACE_CODE = 'financial-control'

const IN_PROGRESS_STATUSES = new Set<FinancialControlFindingStatus>([
  'in_progress',
  'awaiting_action_owner',
  'submitted_for_manager_review',
  'under_manager_review',
  'returned_for_revision',
  'reopened',
])

function buildSummary(
  findings: FinancialControlFinding[],
  correctiveActions: FinancialControlCorrectiveAction[],
): FinancialControlSummary {
  const today = new Date().toISOString().slice(0, 10)

  return {
    totalFindings: findings.length,
    inProgressFindings: findings.filter((finding) => IN_PROGRESS_STATUSES.has(finding.workflow_status)).length,
    overdueFindings: findings.filter(
      (finding) => finding.workflow_status !== 'closed' && finding.current_due_date < today,
    ).length,
    closedFindings: findings.filter((finding) => finding.workflow_status === 'closed').length,
    totalCorrectiveActions: correctiveActions.length,
  }
}

export async function getFinancialControlDashboard(): Promise<FinancialControlDashboardData> {
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    throw new FinancialControlServiceError(
      'authentication',
      'تعذر التحقق من جلسة المستخدم الحالية. يرجى تسجيل الدخول مجددًا.',
    )
  }

  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, code, name, description, status')
    .eq('code', FINANCIAL_CONTROL_WORKSPACE_CODE)
    .maybeSingle()

  if (workspaceError) {
    throw new FinancialControlServiceError(
      'workspace',
      'تعذر قراءة مساحة الرقابة المالية. تحقق من الاتصال والصلاحيات.',
    )
  }

  if (!workspaceData) {
    throw new FinancialControlServiceError(
      'workspace',
      'مساحة تقرير الكفاءة الرقابية غير متاحة للمستخدم الحالي.',
    )
  }

  const workspace = workspaceData as FinancialControlWorkspace
  const { data: membershipData, error: membershipError } = await supabase
    .from('financial_control_members')
    .select('id, workspace_id, user_id, role, is_active, starts_at, ends_at')
    .eq('workspace_id', workspace.id)
    .eq('user_id', userData.user.id)
    .eq('is_active', true)

  if (membershipError) {
    throw new FinancialControlServiceError(
      'membership',
      'تعذر التحقق من عضوية الرقابة المالية. تحقق من الاتصال والصلاحيات.',
    )
  }

  const now = Date.now()
  const memberships = (membershipData as FinancialControlMembership[]).filter(
    (membership) => membership.ends_at === null || new Date(membership.ends_at).getTime() > now,
  )

  if (memberships.length === 0) {
    throw new FinancialControlServiceError(
      'membership',
      'لا توجد عضوية فعالة للمستخدم الحالي في مساحة الرقابة المالية.',
    )
  }

  const [findingsResult, actionsResult, historyResult] = await Promise.all([
    supabase
      .from('financial_control_findings')
      .select('id, workspace_id, sequence_no, case_code, reference_code, title, assessment_rating, assessment_rating_label, official_owner_label, workflow_status, progress_percent, official_due_date, current_due_date, official_finding_text, control_reference, control_summary, last_activity_at, updated_at')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('sequence_no', { ascending: true }),
    supabase
      .from('corrective_actions')
      .select('id, workspace_id, finding_id, action_no, official_action_text, execution_details, responsible_department_id, responsible_user_id, workflow_status, progress_percent, official_due_date, current_due_date, updated_at')
      .eq('workspace_id', workspace.id)
      .order('action_no', { ascending: true }),
    supabase
      .from('finding_status_history')
      .select('id, workspace_id, finding_id, from_status, to_status, transition_code, reason, progress_before, progress_after, due_date_before, due_date_after, changed_by, changed_at')
      .eq('workspace_id', workspace.id)
      .order('changed_at', { ascending: false }),
  ])

  if (findingsResult.error || actionsResult.error || historyResult.error) {
    throw new FinancialControlServiceError(
      'query',
      'تعذر قراءة بيانات الرقابة المالية من Supabase. تحقق من الاتصال والصلاحيات.',
    )
  }

  const correctiveActions = (actionsResult.data ?? []) as FinancialControlCorrectiveAction[]
  const statusHistory = (historyResult.data ?? []) as FinancialControlStatusHistory[]
  const actionsByFinding = new Map<string, FinancialControlCorrectiveAction[]>()
  const historyByFinding = new Map<string, FinancialControlStatusHistory[]>()

  correctiveActions.forEach((action) => {
    const current = actionsByFinding.get(action.finding_id) ?? []
    current.push(action)
    actionsByFinding.set(action.finding_id, current)
  })

  statusHistory.forEach((historyItem) => {
    const current = historyByFinding.get(historyItem.finding_id) ?? []
    current.push(historyItem)
    historyByFinding.set(historyItem.finding_id, current)
  })

  const findings = ((findingsResult.data ?? []) as Omit<
    FinancialControlFinding,
    'official_recommendation' | 'corrective_actions' | 'status_history'
  >[]).map((finding) => {
    const findingActions = actionsByFinding.get(finding.id) ?? []

    return {
      ...finding,
      official_recommendation: findingActions[0]?.official_action_text ?? null,
      corrective_actions: findingActions,
      status_history: historyByFinding.get(finding.id) ?? [],
    }
  })

  return {
    workspace,
    memberships,
    findings,
    correctiveActions,
    summary: buildSummary(findings, correctiveActions),
  }
}
