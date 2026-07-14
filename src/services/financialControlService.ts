import { supabase } from '../lib/supabase'
import type {
  CorrectiveActionStatus,
  AddFollowUpCommentInput,
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
  UpdateCorrectiveActionProgressInput,
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

const ALLOWED_ACTION_TRANSITIONS: Partial<Record<CorrectiveActionStatus, ReadonlySet<CorrectiveActionStatus>>> = {
  not_started: new Set<CorrectiveActionStatus>(['in_progress']),
  in_progress: new Set<CorrectiveActionStatus>(['submitted_for_specialist_review']),
  submitted_for_specialist_review: new Set<CorrectiveActionStatus>(['under_specialist_review']),
  under_specialist_review: new Set<CorrectiveActionStatus>(['returned_for_revision', 'specialist_verified']),
  returned_for_revision: new Set<CorrectiveActionStatus>(['submitted_for_specialist_review']),
  specialist_verified: new Set<CorrectiveActionStatus>(['completed']),
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
    return new FinancialControlServiceError('permission', 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.')
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

  const [findingsResult, actionsResult, historyResult, messagesResult, commentsResult, profilesResult] = await Promise.all([
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

  const correctiveActions = (actionsResult.data ?? []) as FinancialControlCorrectiveAction[]
  const statusHistory = (historyResult.data ?? []) as FinancialControlStatusHistory[]
  const messages = (messagesResult.data ?? []) as FinancialControlMessage[]
  const comments = (commentsResult.data ?? []) as FinancialControlComment[]
  const profiles = (profilesResult.data ?? []) as FinancialControlProfile[]
  const actionsByFinding = new Map<string, FinancialControlCorrectiveAction[]>()
  const historyByFinding = new Map<string, FinancialControlStatusHistory[]>()
  const messagesByFinding = new Map<string, FinancialControlMessage[]>()
  const commentsByFinding = new Map<string, FinancialControlComment[]>()

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
  const authorUserId = await getAuthenticatedUserId()
  const body = requireText(input.body, 'نص ملاحظة المتابعة')
  const { error } = await supabase.from('finding_comments').insert({
    workspace_id: input.workspaceId,
    finding_id: input.findingId,
    corrective_action_id: null,
    parent_comment_id: null,
    comment_type: 'internal',
    visibility: 'workspace',
    body,
    author_user_id: authorUserId,
    supersedes_comment_id: null,
    created_at: input.activityDate,
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

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    throw new FinancialControlServiceError(
      'authentication',
      'تعذر التحقق من جلسة المستخدم الحالية. يرجى تسجيل الدخول مجددًا.',
    )
  }

  const { data, error } = await supabase
    .from('corrective_actions')
    .update({
      progress_percent: input.progressPercent,
      execution_details: executionDetails,
      updated_by: userData.user.id,
      updated_at: new Date().toISOString(),
      lock_version: input.expectedLockVersion + 1,
    })
    .eq('id', input.correctiveActionId)
    .eq('lock_version', input.expectedLockVersion)
    .select('id, lock_version')
    .maybeSingle()

  if (error) {
    throw toMutationError(error, 'تعذر حفظ نسبة الإنجاز وملاحظة التحديث.')
  }

  if (!data) {
    const { data: current, error: currentError } = await supabase
      .from('corrective_actions')
      .select('lock_version')
      .eq('id', input.correctiveActionId)
      .maybeSingle()

    if (currentError) {
      throw toMutationError(currentError, 'تعذر التحقق من النسخة الحالية للإجراء التصحيحي.')
    }

    if (current && current.lock_version !== input.expectedLockVersion) {
      throw new FinancialControlServiceError(
        'conflict',
        'عُدّل السجل من مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
      )
    }

    throw new FinancialControlServiceError('permission', 'لم يتم الحفظ. تحقق من صلاحيتك على الإجراء التصحيحي.')
  }
}

export async function transitionFinancialControlFinding(input: TransitionFindingInput): Promise<void> {
  const reason = input.reason?.trim() || null
  if ((input.toStatus === 'returned_for_revision' || input.toStatus === 'reopened') && !reason) {
    throw new FinancialControlServiceError('validation', 'سبب الإرجاع أو إعادة الفتح مطلوب.')
  }

  const { error } = await supabase.rpc('financial_control_transition_finding', {
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
  if (input.toStatus === 'returned_for_revision' && !reason) {
    throw new FinancialControlServiceError('validation', 'سبب الإرجاع للتعديل مطلوب.')
  }

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
