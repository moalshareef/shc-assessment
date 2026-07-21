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
  | 'submitted_for_manager_review'
  | 'completed'

export type DocumentStorageLocation =
  | 'share_folder'
  | 'official_email'
  | 'internal_system'
  | 'other'

export type DocumentVerificationStatus = 'pending' | 'approved' | 'rejected'

export type FinancialControlFollowUpType = 'reminder' | 'employee_direction'
export type FinancialControlFollowUpPriority = 'normal' | 'urgent'
export type FinancialControlFollowUpStatus = 'open' | 'completed' | 'cancelled'

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

export interface FinancialControlProfile {
  id: string
  full_name: string
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
  lock_version: number
  official_recommendation: string | null
  corrective_actions: FinancialControlCorrectiveAction[]
  status_history: FinancialControlStatusHistory[]
  messages: FinancialControlMessage[]
  comments: FinancialControlComment[]
  follow_ups: FinancialControlFollowUp[]
}

export interface FinancialControlOrganization {
  id: string
  organization_name_ar: string
}

export interface FinancialControlFollowUp {
  id: string
  workspace_id: string
  finding_id: string
  follow_up_type: FinancialControlFollowUpType
  target_organization_id: string | null
  target_user_id: string | null
  title: string | null
  body: string
  priority: FinancialControlFollowUpPriority
  due_at: string | null
  status: FinancialControlFollowUpStatus
  created_by: string
  created_at: string
  updated_at: string
  completed_by: string | null
  completed_at: string | null
  cancelled_by: string | null
  cancelled_at: string | null
  lock_version: number
}

export interface CreateFinancialControlFollowUpInput {
  findingId: string
  followUpType: FinancialControlFollowUpType
  targetOrganizationId: string | null
  targetUserId: string | null
  title: string
  body: string
  priority: FinancialControlFollowUpPriority
  dueAt: string
}

export interface UpdateFinancialControlFollowUpInput {
  followUpId: string
  title: string
  body: string
  priority: FinancialControlFollowUpPriority
  dueAt: string
  expectedLockVersion: number
}

export interface SetFinancialControlFollowUpStatusInput {
  followUpId: string
  status: Extract<FinancialControlFollowUpStatus, 'completed' | 'cancelled'>
  expectedLockVersion: number
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
  updated_by: string | null
  lock_version: number
  document_references: CorrectiveActionDocumentReference[]
}

export interface CorrectiveActionDocumentReference {
  id: string
  workspace_id: string
  finding_id: string
  corrective_action_id: string
  document_number: string
  document_name: string
  document_type: string
  document_date: string
  issuing_entity: string
  storage_location: DocumentStorageLocation
  location_reference: string
  description: string | null
  manager_verification_status: DocumentVerificationStatus
  manager_decision_note: string | null
  manager_verified_by: string | null
  manager_verified_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  lock_version: number
}

export interface DocumentReferenceFieldsInput {
  correctiveActionId: string
  documentNumber: string
  documentName: string
  documentType: string
  documentDate: string
  issuingEntity: string
  storageLocation: DocumentStorageLocation
  locationReference: string
  description: string
}

export interface UpdateDocumentReferenceInput extends DocumentReferenceFieldsInput {
  documentReferenceId: string
  expectedLockVersion: number
}

export interface DeleteDocumentReferenceInput {
  documentReferenceId: string
  expectedLockVersion: number
}

export interface DecideDocumentReferenceInput {
  documentReferenceId: string
  decision: Extract<DocumentVerificationStatus, 'approved' | 'rejected'>
  decisionNote: string
  expectedLockVersion: number
}

export interface FinancialControlMessage {
  id: string
  workspace_id: string
  finding_id: string
  corrective_action_id: string | null
  message_type: 'sent_email' | 'department_reply' | 'internal_message' | 'reminder'
  direction: 'outbound' | 'inbound' | 'internal'
  sent_at: string
  sender_user_id: string | null
  sender_label: string | null
  to_recipients: string[]
  subject: string | null
  body: string
  external_message_id: string | null
  recorded_by: string | null
  created_at: string
}

export interface FinancialControlComment {
  id: string
  workspace_id: string
  finding_id: string
  corrective_action_id: string | null
  comment_type: 'internal' | 'execution_update' | 'return_reason' | 'approval_note'
  visibility: 'workspace' | 'action_participants' | 'managers'
  body: string
  author_user_id: string | null
  created_at: string
}

export interface RecordSentEmailInput {
  workspaceId: string
  findingId: string
  sentAt: string
  recipient: string
  subject: string
  reference: string
  summary: string
}

export interface RecordOfficialReplyInput {
  workspaceId: string
  findingId: string
  repliedAt: string
  sender: string
  reference: string
  replyText: string
}

export interface AddFollowUpCommentInput {
  workspaceId: string
  findingId: string
  activityDate: string
  body: string
}

export interface UpdateCorrectiveActionProgressInput {
  correctiveActionId: string
  progressPercent: number
  executionDetails: string
  expectedLockVersion: number
}

export interface UpdateCorrectiveActionProgressAndStartInput extends UpdateCorrectiveActionProgressInput {
  workflowStatus: CorrectiveActionStatus
}

export interface TransitionFindingInput {
  findingId: string
  toStatus: FinancialControlFindingStatus
  reason: string | null
  expectedLockVersion: number
}

export interface TransitionCorrectiveActionInput {
  correctiveActionId: string
  fromStatus: CorrectiveActionStatus
  toStatus: CorrectiveActionStatus
  reason: string | null
  expectedLockVersion: number
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
  documentReferences: CorrectiveActionDocumentReference[]
  profiles: FinancialControlProfile[]
  organizations: FinancialControlOrganization[]
  followUps: FinancialControlFollowUp[]
  summary: FinancialControlSummary
}

export type FinancialControlErrorCode =
  | 'authentication'
  | 'workspace'
  | 'membership'
  | 'query'
  | 'validation'
  | 'permission'
  | 'conflict'
  | 'mutation'

export class FinancialControlServiceError extends Error {
  constructor(public readonly code: FinancialControlErrorCode, message: string) {
    super(message)
    this.name = 'FinancialControlServiceError'
  }
}
