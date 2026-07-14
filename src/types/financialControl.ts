export type FinancialControlRole = 'owner' | 'manager' | 'specialist' | 'action_owner' | 'viewer'

export type FinancialControlFindingStatus =
  | 'imported_pending_review'
  | 'not_started'
  | 'in_progress'
  | 'awaiting_action_owner'
  | 'submitted_for_manager_review'
  | 'under_manager_review'
  | 'returned_for_revision'
  | 'approved'
  | 'closed'
  | 'reopened'

export type CorrectiveActionStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'submitted_for_specialist_review'
  | 'under_specialist_review'
  | 'returned_for_revision'
  | 'specialist_verified'
  | 'completed'

export type FinancialControlAssessmentRating = 'partially_effective' | 'not_exists'

export interface FinancialControlWorkspace {
  id: string
  code: string
  name: string
  description: string | null
  status: string
}

export interface FinancialControlMembership {
  id: string
  workspace_id: string
  user_id: string
  role: FinancialControlRole
  is_active: boolean
  starts_at: string
  ends_at: string | null
}

export interface FinancialControlFinding {
  id: string
  workspace_id: string
  sequence_no: number
  case_code: string
  reference_code: string
  title: string
  assessment_rating: FinancialControlAssessmentRating
  assessment_rating_label: string
  official_owner_label: string
  workflow_status: FinancialControlFindingStatus
  progress_percent: number
  official_due_date: string
  current_due_date: string
  official_finding_text: string
  control_reference: string
  control_summary: string
  last_activity_at: string | null
  updated_at: string
  official_recommendation: string | null
  corrective_actions: FinancialControlCorrectiveAction[]
  status_history: FinancialControlStatusHistory[]
}

export interface FinancialControlCorrectiveAction {
  id: string
  workspace_id: string
  finding_id: string
  action_no: number
  official_action_text: string
  execution_details: string | null
  responsible_department_id: string | null
  responsible_user_id: string | null
  workflow_status: CorrectiveActionStatus
  progress_percent: number
  official_due_date: string
  current_due_date: string
  updated_at: string
}

export interface FinancialControlStatusHistory {
  id: string
  workspace_id: string
  finding_id: string
  from_status: FinancialControlFindingStatus | null
  to_status: FinancialControlFindingStatus
  transition_code: string
  reason: string | null
  progress_before: number | null
  progress_after: number | null
  due_date_before: string | null
  due_date_after: string | null
  changed_by: string | null
  changed_at: string
}

export interface FinancialControlSummary {
  totalFindings: number
  inProgressFindings: number
  overdueFindings: number
  closedFindings: number
  totalCorrectiveActions: number
}

export interface FinancialControlDashboardData {
  workspace: FinancialControlWorkspace
  memberships: FinancialControlMembership[]
  findings: FinancialControlFinding[]
  correctiveActions: FinancialControlCorrectiveAction[]
  summary: FinancialControlSummary
}

export type FinancialControlErrorCode = 'authentication' | 'workspace' | 'membership' | 'query'

export class FinancialControlServiceError extends Error {
  constructor(public readonly code: FinancialControlErrorCode, message: string) {
    super(message)
    this.name = 'FinancialControlServiceError'
  }
}
