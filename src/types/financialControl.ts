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
  reference_code: string
  title: string
  official_owner_label: string
  workflow_status: FinancialControlFindingStatus
  progress_percent: number
  current_due_date: string
  last_activity_at: string | null
  updated_at: string
}

export interface FinancialControlCorrectiveAction {
  id: string
  workspace_id: string
  finding_id: string
  action_no: number
  workflow_status: CorrectiveActionStatus
  progress_percent: number
  current_due_date: string
  updated_at: string
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
