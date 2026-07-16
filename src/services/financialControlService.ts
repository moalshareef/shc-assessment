import { supabase } from '../lib/supabase'
import type {
  CorrectiveActionStatus,
  AddFollowUpCommentInput,
  CorrectiveActionDocumentReference,
  DecideDocumentReferenceInput,
  DeleteDocumentReferenceInput,
  DocumentReferenceFieldsInput,
  FinancialControlComment,
  FinancialControlCorrectiveAction,
  FinancialControlDashboardData,
  FinancialControlFinding,
  FinancialControlFindingStatus,
  FinancialControlMembership,
  FinancialControlMessage,
  FinancialControlProfile,
  FinancialControlStatusHistory,
  FinancialControlSummary,
  FinancialControlWorkspace,
  RecordOfficialReplyInput,
  RecordSentEmailInput,
  TransitionCorrectiveActionInput,
  TransitionFindingInput,
  UpdateDocumentReferenceInput,
  UpdateCorrectiveActionProgressAndStartInput,
  UpdateCorrectiveActionProgressInput,
} from '../types/financialControl'
import { FinancialControlServiceError } from '../types/financialControl'
import { listCurrentOperationalAccess } from './platformUserAccessService'

const FINANCIAL_CONTROL_WORKSPACE_CODE = 'financial-control'

const IN_PROGRESS_STATUSES = new Set<FinancialControlFindingStatus>([
  'in_progress',
  'awaiting_action_owner',
  'submitted_for_manager_review',
  'under_manager_review',
  'returned_for_revision',
  'reopened',
])

const ALLOWED_ACTION_TRANSITIONS: Partial<Record<CorrectiveActionStatus, ReadonlySet<CorrectiveActionStatus>>> = {
  not_started: new Set<CorrectiveActionStatus>(['in_progress']),
  in_progress: new Set<CorrectiveActionStatus>(['submitted_for_manager_review']),
}

interface SupabaseErrorLike {
  code?: string
  message?: string
}

function toMutationError(error: SupabaseErrorLike | null, fallbackMessage: string) {
  const message = error?.message ?? ''

  if (error?.code === '40001' || message.toLocaleLowerCase().includes('changed by another transaction')) {
    return new FinancialControlServiceError(
      'conflict',
      'عُدّل السجل من مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    )
  }

  if (error?.code === '42501') {
    return new FinancialControlServiceError('permission', 'ليس لديك صلاحية لتنفيذ هذا الإجراء.')
  }

  if (
    error?.code === '23514'
    && message.toLocaleLowerCase().includes('document reference')
  ) {
    return new FinancialControlServiceError(
      'validation',
      'لا يمكن الرفع للمدير قبل إضافة مستند مرجعي واحد على الأقل.',
    )
  }

  return new FinancialControlServiceError('mutation', error?.message || fallbackMessage)
}

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
  let operationalAccess
  try {
    operationalAccess = await listCurrentOperationalAccess()
  } catch {
    throw new FinancialControlServiceError(
      'membership',
      'تعذر التحقق من عضوية الرقابة المالية. تحقق من الاتصال والصلاحيات.',
    )
  }

  const memberships: FinancialControlMembership[] = operationalAccess
    .filter((access) => access.workspaceId === workspace.id && access.workspaceCode === FINANCIAL_CONTROL_WORKSPACE_CODE)
    .map((access, index) => ({
      id: `${access.source}:${index}`,
      workspace_id: access.workspaceId,
      user_id: userData.user.id,
      role: access.roleCode === 'financial_control_manager' ? 'manager' : 'action_owner',
      is_active: true,
      starts_at: new Date(0).toISOString(),
      ends_at: null,
    }))

  if (memberships.length === 0) {
    throw new FinancialControlServiceError(
      'membership',
      'لا توجد عضوية فعالة للمستخدم الحالي في مساحة الرقابة المالية.',
    )
  }

  const [findingsResult, actionsResult, referencesResult, historyResult, messagesResult, commentsResult, profilesResult] = await Promise.all([
    supabase
      .from('financial_control_findings')
      .select('id, workspace_id, sequence_no, case_code, reference_code, title, assessment_rating, assessment_rating_label, official_owner_label, workflow_status, progress_percent, official_due_date, current_due_date, official_finding_text, control_reference, control_summary, last_activity_at, updated_at, lock_version')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('sequence_no', { ascending: true }),
    supabase
      .from('corrective_actions')
      .select('id, workspace_id, finding_id, action_no, official_action_text, execution_details, responsible_department_id, responsible_user_id, workflow_status, progress_percent, official_due_date, current_due_date, updated_at, updated_by, lock_version')
      .eq('workspace_id', workspace.id)
      .order('action_no', { ascending: true }),
    supabase
      .from('corrective_action_document_references')
      .select('id, workspace_id, finding_id, corrective_action_id, document_number, document_name, document_type, document_date, issuing_entity, storage_location, location_reference, description, manager_verification_status, manager_decision_note, manager_verified_by, manager_verified_at, created_by, created_at, updated_at, lock_version')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('finding_status_history')
      .select('id, workspace_id, finding_id, from_status, to_status, transition_code, reason, progress_before, progress_after, due_date_before, due_date_after, changed_by, changed_at')
      .eq('workspace_id', workspace.id)
      .order('changed_at', { ascending: false }),
    supabase
      .from('finding_messages')
      .select('id, workspace_id, finding_id, corrective_action_id, message_type, direction, sent_at, sender_user_id, sender_label, to_recipients, subject, body, external_message_id, recorded_by, created_at')
      .eq('workspace_id', workspace.id)
      .order('sent_at', { ascending: false }),
    supabase
      .from('finding_comments')
      .select('id, workspace_id, finding_id, corrective_action_id, comment_type, visibility, body, author_user_id, created_at')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true),
  ])

  if (
    findingsResult.error
    || actionsResult.error
    || referencesResult.error
    || historyResult.error
    || messagesResult.error
    || commentsResult.error
    || profilesResult.error
  ) {
    throw new FinancialControlServiceError(
      'query',
      'تعذر قراءة بيانات الرقابة المالية من Supabase. تحقق من الاتصال والصلاحيات.',
    )
  }

  const rawCorrectiveActions = (actionsResult.data ?? []) as Omit<
    FinancialControlCorrectiveAction,
    'document_references'
  >[]
  const documentReferences = (referencesResult.data ?? []) as CorrectiveActionDocumentReference[]
  const statusHistory = (historyResult.data ?? []) as FinancialControlStatusHistory[]
  const messages = (messagesResult.data ?? []) as FinancialControlMessage[]
  const comments = (commentsResult.data ?? []) as FinancialControlComment[]
  const profiles = (profilesResult.data ?? []) as FinancialControlProfile[]
  const actionsByFinding = new Map<string, FinancialControlCorrectiveAction[]>()
  const historyByFinding = new Map<string, FinancialControlStatusHistory[]>()
  const messagesByFinding = new Map<string, FinancialControlMessage[]>()
  const commentsByFinding = new Map<string, FinancialControlComment[]>()
  const referencesByAction = new Map<string, CorrectiveActionDocumentReference[]>()

  documentReferences.forEach((reference) => {
    const current = referencesByAction.get(reference.corrective_action_id) ?? []
    current.push(reference)
    referencesByAction.set(reference.corrective_action_id, current)
  })

  const correctiveActions: FinancialControlCorrectiveAction[] = rawCorrectiveActions.map((action) => ({
    ...action,
    document_references: referencesByAction.get(action.id) ?? [],
  }))

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

  messages.forEach((message) => {
    const current = messagesByFinding.get(message.finding_id) ?? []
    current.push(message)
    messagesByFinding.set(message.finding_id, current)
  })

  comments.forEach((comment) => {
    const current = commentsByFinding.get(comment.finding_id) ?? []
    current.push(comment)
    commentsByFinding.set(comment.finding_id, current)
  })

  const findings = ((findingsResult.data ?? []) as Omit<
    FinancialControlFinding,
    'official_recommendation' | 'corrective_actions' | 'status_history' | 'messages' | 'comments'
  >[]).map((finding) => {
    const findingActions = actionsByFinding.get(finding.id) ?? []

    return {
      ...finding,
      official_recommendation: findingActions[0]?.official_action_text ?? null,
      corrective_actions: findingActions,
      status_history: historyByFinding.get(finding.id) ?? [],
      messages: messagesByFinding.get(finding.id) ?? [],
      comments: commentsByFinding.get(finding.id) ?? [],
    }
  })

  return {
    workspace,
    memberships,
    findings,
    correctiveActions,
    documentReferences,
    profiles,
    summary: buildSummary(findings, correctiveActions),
  }
}

async function getAuthenticatedUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    throw new FinancialControlServiceError(
      'authentication',
      'تعذر التحقق من جلسة المستخدم الحالية. يرجى تسجيل الدخول مجددًا.',
    )
  }
  return data.user.id
}

function requireText(value: string, fieldLabel: string) {
  const normalized = value.trim()
  if (!normalized) throw new FinancialControlServiceError('validation', `${fieldLabel} مطلوب.`)
  return normalized
}

export async function recordSentEmail(input: RecordSentEmailInput): Promise<void> {
  const recordedBy = await getAuthenticatedUserId()
  const recipient = requireText(input.recipient, 'الجهة المرسل إليها')
  const subject = requireText(input.subject, 'موضوع البريد')
  const reference = requireText(input.reference, 'مرجع البريد أو رقم المعاملة')
  const summary = requireText(input.summary, 'الملخص غير الحساس')
  const { error } = await supabase.from('finding_messages').insert({
    workspace_id: input.workspaceId,
    finding_id: input.findingId,
    corrective_action_id: null,
    parent_message_id: null,
    message_type: 'sent_email',
    direction: 'outbound',
    channel: 'manual_log',
    sent_at: input.sentAt,
    sender_user_id: recordedBy,
    sender_label: null,
    to_recipients: [recipient],
    cc_recipients: [],
    subject,
    body: summary,
    external_message_id: reference,
    recorded_by: recordedBy,
  })

  if (error) throw toMutationError(error, 'تعذر تسجيل البريد الرسمي المرسل.')
}

export async function recordOfficialReply(input: RecordOfficialReplyInput): Promise<void> {
  const recordedBy = await getAuthenticatedUserId()
  const sender = requireText(input.sender, 'الجهة المرسلة')
  const reference = requireText(input.reference, 'مرجع البريد')
  const replyText = requireText(input.replyText, 'نص الرد المنسوخ')
  const { error } = await supabase.from('finding_messages').insert({
    workspace_id: input.workspaceId,
    finding_id: input.findingId,
    corrective_action_id: null,
    parent_message_id: null,
    message_type: 'department_reply',
    direction: 'inbound',
    channel: 'manual_log',
    sent_at: input.repliedAt,
    sender_user_id: null,
    sender_label: sender,
    to_recipients: [],
    cc_recipients: [],
    subject: null,
    body: replyText,
    external_message_id: reference,
    recorded_by: recordedBy,
  })

  if (error) throw toMutationError(error, 'تعذر تسجيل الرد الرسمي.')
}

export async function addFollowUpComment(input: AddFollowUpCommentInput): Promise<void> {
  const body = requireText(input.body, 'نص ملاحظة المتابعة')
  const { error } = await supabase.rpc('financial_control_add_follow_up_comment', {
    p_finding_id: input.findingId,
    p_corrective_action_id: null,
    p_activity_at: input.activityDate,
    p_body: body,
  })

  if (error) throw toMutationError(error, 'تعذر إضافة ملاحظة المتابعة.')
}

export async function updateCorrectiveActionProgress(
  input: UpdateCorrectiveActionProgressInput,
): Promise<void> {
  if (!Number.isFinite(input.progressPercent) || input.progressPercent < 0 || input.progressPercent > 100) {
    throw new FinancialControlServiceError('validation', 'يجب أن تكون نسبة الإنجاز بين 0 و100.')
  }

  const executionDetails = input.executionDetails.trim()
  if (!executionDetails) {
    throw new FinancialControlServiceError('validation', 'ملاحظة التحديث مطلوبة قبل الحفظ.')
  }

  const { data, error } = await supabase.rpc('financial_control_update_action_progress', {
    p_corrective_action_id: input.correctiveActionId,
    p_progress_percent: input.progressPercent,
    p_execution_details: executionDetails,
    p_expected_lock_version: input.expectedLockVersion,
  })

  if (error) {
    throw toMutationError(error, 'تعذر حفظ نسبة الإنجاز وملاحظة التحديث.')
  }

  const savedProgress = Number(
    (data as { progress_percent?: number | string } | null)?.progress_percent,
  )
  if (!Number.isFinite(savedProgress) || savedProgress !== input.progressPercent) {
    throw new FinancialControlServiceError(
      'mutation',
      'لم تُحفظ نسبة الإنجاز بالقيمة المطلوبة. تم تحديث البيانات، أعد المحاولة.',
    )
  }

}

export async function updateCorrectiveActionProgressAndStart(
  input: UpdateCorrectiveActionProgressAndStartInput,
): Promise<void> {
  await updateCorrectiveActionProgress(input)

  if (input.progressPercent > 0 && input.workflowStatus === 'not_started') {
    await transitionFinancialControlAction({
      correctiveActionId: input.correctiveActionId,
      fromStatus: 'not_started',
      toStatus: 'in_progress',
      reason: 'بدء تنفيذ الإجراء تلقائيًا بعد تسجيل تقدم أكبر من صفر.',
      expectedLockVersion: input.expectedLockVersion + 1,
    })
  }
}

export async function transitionFinancialControlFinding(input: TransitionFindingInput): Promise<void> {
  const reason = input.reason?.trim() || null
  if ((input.toStatus === 'returned_for_revision' || input.toStatus === 'reopened') && !reason) {
    throw new FinancialControlServiceError('validation', 'سبب الإرجاع أو إعادة الفتح مطلوب.')
  }

  const { error } = input.toStatus === 'under_manager_review'
    ? await supabase.rpc('financial_control_begin_manager_review', {
        p_finding_id: input.findingId,
        p_reason: reason,
        p_expected_lock_version: input.expectedLockVersion,
      })
    : await supabase.rpc('financial_control_transition_finding', {
        p_finding_id: input.findingId,
        p_to_status: input.toStatus,
        p_reason: reason,
        p_expected_lock_version: input.expectedLockVersion,
      })

  if (error) {
    throw toMutationError(error, 'تعذر تنفيذ انتقال حالة الملاحظة.')
  }
}

export async function transitionFinancialControlAction(
  input: TransitionCorrectiveActionInput,
): Promise<void> {
  const reason = input.reason?.trim() || null
  if (!ALLOWED_ACTION_TRANSITIONS[input.fromStatus]?.has(input.toStatus)) {
    throw new FinancialControlServiceError('validation', 'انتقال حالة الإجراء المطلوب غير مدعوم.')
  }

  const { error } = await supabase.rpc('financial_control_transition_action', {
    p_corrective_action_id: input.correctiveActionId,
    p_to_status: input.toStatus,
    p_reason: reason,
    p_expected_lock_version: input.expectedLockVersion,
  })

  if (error) {
    throw toMutationError(error, 'تعذر تنفيذ انتقال حالة الإجراء التصحيحي.')
  }
}

function documentReferenceRpcFields(input: DocumentReferenceFieldsInput) {
  if (!input.documentDate) {
    throw new FinancialControlServiceError('validation', 'تاريخ المستند مطلوب.')
  }

  return {
    p_corrective_action_id: input.correctiveActionId,
    p_document_number: requireText(input.documentNumber, 'رقم المستند'),
    p_document_name: requireText(input.documentName, 'اسم المستند'),
    p_document_type: requireText(input.documentType, 'نوع المستند'),
    p_document_date: input.documentDate,
    p_issuing_entity: requireText(input.issuingEntity, 'الجهة المصدرة'),
    p_storage_location: input.storageLocation,
    p_location_reference: requireText(input.locationReference, 'المسار أو المرجع'),
    p_description: input.description.trim() || null,
  }
}

export async function addDocumentReference(
  input: DocumentReferenceFieldsInput,
): Promise<CorrectiveActionDocumentReference> {
  const { data, error } = await supabase.rpc(
    'financial_control_add_document_reference',
    documentReferenceRpcFields(input),
  )
  if (error) throw toMutationError(error, 'تعذر إضافة المستند المرجعي.')
  return data as CorrectiveActionDocumentReference
}

export async function updateDocumentReference(
  input: UpdateDocumentReferenceInput,
): Promise<CorrectiveActionDocumentReference> {
  const fields = documentReferenceRpcFields(input)
  const { p_corrective_action_id: _correctiveActionId, ...rpcFields } = fields
  void _correctiveActionId
  const { data, error } = await supabase.rpc('financial_control_update_document_reference', {
    p_document_reference_id: input.documentReferenceId,
    ...rpcFields,
    p_expected_lock_version: input.expectedLockVersion,
  })
  if (error) throw toMutationError(error, 'تعذر تعديل المستند المرجعي.')
  return data as CorrectiveActionDocumentReference
}

export async function deleteDocumentReference(input: DeleteDocumentReferenceInput): Promise<void> {
  const { error } = await supabase.rpc('financial_control_delete_document_reference', {
    p_document_reference_id: input.documentReferenceId,
    p_expected_lock_version: input.expectedLockVersion,
  })
  if (error) throw toMutationError(error, 'تعذر حذف المستند المرجعي.')
}

export async function decideDocumentReference(input: DecideDocumentReferenceInput): Promise<void> {
  const note = input.decisionNote.trim()
  if (input.decision === 'rejected' && !note) {
    throw new FinancialControlServiceError('validation', 'سبب رفض المستند المرجعي مطلوب.')
  }

  const { error } = await supabase.rpc('financial_control_decide_document_reference', {
    p_document_reference_id: input.documentReferenceId,
    p_decision: input.decision,
    p_decision_note: note || null,
    p_expected_lock_version: input.expectedLockVersion,
  })
  if (error) throw toMutationError(error, 'تعذر حفظ قرار المدير للمستند المرجعي.')
}
