import type { FinancialControlRole } from '../../types/financialControl'
import {
  areAllCorrectiveActionsSubmitted,
  areAllDocumentReferencesApproved,
  hasOfficialEmail,
  hasUnansweredOfficialEmail,
} from './caseManagementModel'
import type { CaseSnapshot } from './caseManagementModel'

export type SimplifiedActorType = 'employee' | 'manager' | 'viewer'

export function hasManagerExperienceAccess(roles: FinancialControlRole[]) {
  return roles.some((role) => role === 'owner' || role === 'manager')
}

export type SimplifiedPrimaryActionHandler =
  | 'record_sent_email'
  | 'record_follow_up_or_reply'
  | 'update_progress'
  | 'open_document_references'
  | 'submit_next_action'
  | 'start_manager_review'
  | 'review_document_references'
  | 'approve_finding'
  | 'return_finding'
  | 'close_finding'
  | 'none'

export type SimplifiedQueueKey =
  | 'employee_needs_update'
  | 'employee_awaiting_reply'
  | 'employee_returned'
  | 'employee_ready_to_send'
  | 'employee_waiting_manager'
  | 'manager_pending_start'
  | 'manager_documents_pending'
  | 'manager_ready_approval'
  | 'manager_returned_employee'

export interface SimplifiedSecondaryAction {
  label: string
  handler: SimplifiedPrimaryActionHandler
  reasonRequired?: boolean
}

export interface SimplifiedStage {
  key: 'communication' | 'execution' | 'documents' | 'manager_review' | 'closure'
  label: string
  state: 'completed' | 'current' | 'upcoming' | 'needs_action'
}

export interface SimplifiedCaseViewModel {
  actorType: SimplifiedActorType
  currentStep: number
  totalSteps: 4
  stepName: string
  description: string
  completedSteps: number[]
  nextAction: string
  blockingRequirements: string[]
  primaryActionLabel: string
  primaryActionHandler: SimplifiedPrimaryActionHandler
  secondaryActions: SimplifiedSecondaryAction[]
  stages: SimplifiedStage[]
  progress: number
  referenceCounts: { total: number; pending: number; approved: number; rejected: number }
  waitingForManager: boolean
  readonly: boolean
  returnReason?: string | null
}

export interface SimplifiedCaseViewModelInput {
  snapshot: CaseSnapshot
  roles: FinancialControlRole[]
  isAssignedEmployee: boolean
  latestReturnReason?: string | null
  hasEmployeeActivityAfterReturn?: boolean
  hasCompleteExecutionDetails?: boolean
}

const stageLabels: SimplifiedStage[] = [
  { key: 'communication', label: 'التواصل', state: 'upcoming' },
  { key: 'execution', label: 'التنفيذ', state: 'upcoming' },
  { key: 'documents', label: 'المستندات', state: 'upcoming' },
  { key: 'manager_review', label: 'مراجعة المدير', state: 'upcoming' },
  { key: 'closure', label: 'الإغلاق', state: 'upcoming' },
]

function stagesFor(currentIndex: number, needsAction = false): SimplifiedStage[] {
  return stageLabels.map((stage, index) => ({
    ...stage,
    state: index < currentIndex
      ? 'completed'
      : index === currentIndex
        ? needsAction ? 'needs_action' : 'current'
        : 'upcoming',
  }))
}

function referenceCounts(snapshot: CaseSnapshot) {
  return {
    total: snapshot.documentReferenceStatuses.length,
    pending: snapshot.documentReferenceStatuses.filter((status) => status === 'pending').length,
    approved: snapshot.documentReferenceStatuses.filter((status) => status === 'approved').length,
    rejected: snapshot.documentReferenceStatuses.filter((status) => status === 'rejected').length,
  }
}

function employeeModel(
  snapshot: CaseSnapshot,
  hasEmployeeActivityAfterReturn: boolean,
  hasCompleteExecutionDetails: boolean,
): Omit<SimplifiedCaseViewModel, 'actorType' | 'totalSteps' | 'progress' | 'referenceCounts'> {
  const references = referenceCounts(snapshot)
  const allActionsSubmitted = areAllCorrectiveActionsSubmitted(snapshot.correctiveActionStatuses)
  const managerStatuses = ['submitted_for_manager_review', 'under_manager_review', 'approved', 'closed']
  const waitingForManager = allActionsSubmitted || managerStatuses.includes(snapshot.workflowStatus)

  if (snapshot.workflowStatus === 'closed') {
    return {
      currentStep: 4,
      stepName: 'الملاحظة مغلقة',
      description: 'اكتملت دورة المتابعة والاعتماد والإغلاق. العرض متاح للقراءة فقط.',
      completedSteps: [1, 2, 3, 4],
      nextAction: 'لا يوجد إجراء مطلوب.',
      blockingRequirements: [],
      primaryActionLabel: 'مغلقة — قراءة فقط',
      primaryActionHandler: 'none',
      secondaryActions: [],
      stages: stagesFor(4),
      waitingForManager: false,
      readonly: true,
    }
  }

  if (waitingForManager && snapshot.workflowStatus !== 'returned_for_revision') {
    return {
      currentStep: 4,
      stepName: 'بانتظار مراجعة المدير',
      description: 'تم إرسال الملاحظة للمدير، وهي الآن بانتظار المراجعة.',
      completedSteps: [1, 2, 3, 4],
      nextAction: 'انتظر قرار المدير. لا توجد إجراءات تشغيلية متاحة أثناء المراجعة.',
      blockingRequirements: [],
      primaryActionLabel: 'بانتظار قرار المدير',
      primaryActionHandler: 'none',
      secondaryActions: [],
      stages: stagesFor(3),
      waitingForManager: true,
      readonly: true,
    }
  }

  if (snapshot.workflowStatus === 'returned_for_revision') {
    const needsExecutionUpdate = snapshot.progress < 100
      || !hasCompleteExecutionDetails
      || !hasEmployeeActivityAfterReturn
    const needsDocumentUpdate = references.total === 0 || references.rejected > 0

    if (needsExecutionUpdate) {
      return {
        currentStep: 2,
        stepName: 'استكمال التعديل',
        description: 'راجع سبب الإرجاع، ثم حدّث التنفيذ أو أضف التوضيح المطلوب.',
        completedSteps: [1],
        nextAction: 'أضف التوضيح المطلوب وحدّث بيانات التنفيذ قبل إعادة الإرسال.',
        blockingRequirements: [
          ...(snapshot.progress < 100 ? [`استكمال نسبة الإنجاز: المتبقي ${100 - snapshot.progress}%.`] : []),
          ...(!hasCompleteExecutionDetails ? ['استكمال تفاصيل التنفيذ.'] : []),
          ...(!hasEmployeeActivityAfterReturn ? ['تسجيل تعديل أو توضيح بعد آخر إرجاع من المدير.'] : []),
        ],
        primaryActionLabel: 'استكمال التعديل',
        primaryActionHandler: 'update_progress',
        secondaryActions: [{ label: 'عرض المستندات المرجعية', handler: 'open_document_references' }],
        stages: stagesFor(1, true),
        waitingForManager: false,
        readonly: false,
      }
    }

    if (needsDocumentUpdate) {
      return {
        currentStep: 3,
        stepName: 'استكمال المستندات',
        description: 'راجع سبب الإرجاع، ثم استكمل المستند المرجعي المطلوب.',
        completedSteps: [1, 2],
        nextAction: 'أضف المرجع الناقص أو صحّح المرجع المرفوض قبل إعادة الإرسال.',
        blockingRequirements: [
          ...(references.total === 0 ? ['إضافة مستند مرجعي واحد على الأقل.'] : []),
          ...(references.rejected > 0 ? [`تصحيح ${references.rejected} مرجع مرفوض.`] : []),
        ],
        primaryActionLabel: 'استكمال التعديل',
        primaryActionHandler: 'open_document_references',
        secondaryActions: [],
        stages: stagesFor(2, true),
        waitingForManager: false,
        readonly: false,
      }
    }

    return {
      currentStep: 4,
      stepName: 'إعادة الإرسال للمدير',
      description: 'اكتمل التعديل المطلوب وأصبحت الملاحظة جاهزة لإعادة الإرسال.',
      completedSteps: [1, 2, 3],
      nextAction: 'أعد إرسال الإجراء للمدير لمراجعته مجددًا.',
      blockingRequirements: [],
      primaryActionLabel: 'إعادة الإرسال للمدير',
      primaryActionHandler: 'submit_next_action',
      secondaryActions: [{ label: 'عرض المستندات المرجعية', handler: 'open_document_references' }],
      stages: stagesFor(2),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (!hasOfficialEmail(snapshot)) {
    return {
      currentStep: 1,
      stepName: 'التواصل',
      description: 'الخطوة 1 من 4: سجّل التواصل الرسمي.',
      completedSteps: [],
      nextAction: 'سجّل البريد الرسمي المرسل لبدء المتابعة.',
      blockingRequirements: ['لا يوجد إرسال رسمي مسجل حتى الآن.'],
      primaryActionLabel: 'تسجيل بريد رسمي',
      primaryActionHandler: 'record_sent_email',
      secondaryActions: [{ label: 'تسجيل رد أو متابعة', handler: 'record_follow_up_or_reply' }],
      stages: stagesFor(0, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (hasUnansweredOfficialEmail(snapshot) && snapshot.progress === 0) {
    return {
      currentStep: 1,
      stepName: 'التواصل',
      description: 'تم تسجيل الإرسال الرسمي، ولم يسجل رد أحدث منه.',
      completedSteps: [],
      nextAction: 'سجّل متابعة أو ردًا رسميًا عند وروده.',
      blockingRequirements: ['بانتظار رد أو متابعة على آخر إرسال رسمي.'],
      primaryActionLabel: 'تسجيل متابعة أو رد',
      primaryActionHandler: 'record_follow_up_or_reply',
      secondaryActions: [],
      stages: stagesFor(0),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (snapshot.progress < 100) {
    return {
      currentStep: 2,
      stepName: 'التنفيذ',
      description: `الخطوة 2 من 4: حدّث نسبة الإنجاز. النسبة الحالية ${snapshot.progress}%.`,
      completedSteps: [1],
      nextAction: 'سجّل نسبة الإنجاز ووصف التقدم الحالي.',
      blockingRequirements: [`التنفيذ غير مكتمل: المتبقي ${100 - snapshot.progress}%.`],
      primaryActionLabel: 'تحديث نسبة الإنجاز',
      primaryActionHandler: 'update_progress',
      secondaryActions: [{ label: 'تسجيل متابعة', handler: 'record_follow_up_or_reply' }],
      stages: stagesFor(1, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (references.total === 0) {
    return {
      currentStep: 3,
      stepName: 'المستند المرجعي',
      description: 'الخطوة 3 من 4: أضف مستندًا مرجعيًا واحدًا على الأقل.',
      completedSteps: [1, 2],
      nextAction: 'أضف مرجع المستند أو رابط موقعه دون رفع ملف.',
      blockingRequirements: ['لا يوجد مستند مرجعي مسجل.'],
      primaryActionLabel: 'إضافة مستند مرجعي',
      primaryActionHandler: 'open_document_references',
      secondaryActions: [],
      stages: stagesFor(2, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  return {
    currentStep: 4,
    stepName: 'الإرسال للمدير',
    description: 'الخطوة 4 من 4: أصبحت الملاحظة جاهزة للإرسال للمدير.',
    completedSteps: [1, 2, 3],
    nextAction: 'أرسل الإجراء المكتمل للمدير لبدء المراجعة.',
    blockingRequirements: snapshot.correctiveActionStatuses.some((status) => status === 'not_started')
      ? ['يجب بدء حالة الإجراء قبل إرساله.']
      : [],
    primaryActionLabel: 'إرسال للمدير',
    primaryActionHandler: 'submit_next_action',
    secondaryActions: [{ label: 'عرض المستندات المرجعية', handler: 'open_document_references' }],
    stages: stagesFor(2),
    waitingForManager: false,
    readonly: false,
  }
}

function managerModel(snapshot: CaseSnapshot): Omit<SimplifiedCaseViewModel, 'actorType' | 'totalSteps' | 'progress' | 'referenceCounts'> {
  const references = referenceCounts(snapshot)
  const allActionsSubmitted = areAllCorrectiveActionsSubmitted(snapshot.correctiveActionStatuses)

  if (snapshot.workflowStatus === 'closed') {
    return {
      currentStep: 4,
      stepName: 'مغلقة',
      description: 'الملاحظة مغلقة وتعرض للقراءة فقط.',
      completedSteps: [1, 2, 3, 4],
      nextAction: 'لا يوجد قرار مطلوب.',
      blockingRequirements: [],
      primaryActionLabel: 'مغلقة — قراءة فقط',
      primaryActionHandler: 'none',
      secondaryActions: [],
      stages: stagesFor(4),
      waitingForManager: false,
      readonly: true,
    }
  }

  if (snapshot.workflowStatus === 'approved') {
    return {
      currentStep: 4,
      stepName: 'الإغلاق',
      description: 'الملاحظة معتمدة وجاهزة للإغلاق.',
      completedSteps: [1, 2, 3],
      nextAction: 'أغلق الملاحظة لإكمال الدورة.',
      blockingRequirements: [],
      primaryActionLabel: 'إغلاق الملاحظة',
      primaryActionHandler: 'close_finding',
      secondaryActions: [],
      stages: stagesFor(4, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (snapshot.workflowStatus === 'returned_for_revision') {
    return {
      currentStep: 3,
      stepName: 'معادة للموظف',
      description: 'أُعيدت الملاحظة للموظف لاستكمال المطلوب قبل مراجعتها مجددًا.',
      completedSteps: [1],
      nextAction: 'انتظر إعادة إرسال الموظف بعد استكمال التعديل.',
      blockingRequirements: ['بانتظار استكمال الموظف وإعادة الإرسال.'],
      primaryActionLabel: 'بانتظار الموظف',
      primaryActionHandler: 'none',
      secondaryActions: [],
      stages: stagesFor(1),
      waitingForManager: false,
      readonly: true,
    }
  }

  if (allActionsSubmitted && snapshot.workflowStatus !== 'under_manager_review') {
    return {
      currentStep: 1,
      stepName: 'بدء المراجعة',
      description: 'ابدأ مراجعة الملاحظة.',
      completedSteps: [],
      nextAction: 'انقل الملاحظة إلى مراجعة المدير قبل اتخاذ القرارات.',
      blockingRequirements: [],
      primaryActionLabel: 'بدء مراجعة المدير',
      primaryActionHandler: 'start_manager_review',
      secondaryActions: [],
      stages: stagesFor(3, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  if (snapshot.workflowStatus === 'under_manager_review') {
    if (!areAllDocumentReferencesApproved(snapshot.documentReferenceStatuses)) {
      return {
        currentStep: 2,
        stepName: 'مراجعة المستندات',
        description: 'راجع المستندات المرجعية أولًا.',
        completedSteps: [1],
        nextAction: 'اعتمد أو ارفض كل مرجع قبل اتخاذ قرار الملاحظة.',
        blockingRequirements: [
          ...(references.pending ? [`${references.pending} مرجع بانتظار القرار.`] : []),
          ...(references.rejected ? [`${references.rejected} مرجع مرفوض يحتاج معالجة.`] : []),
        ],
        primaryActionLabel: 'مراجعة المستندات',
        primaryActionHandler: 'review_document_references',
        secondaryActions: [],
        stages: stagesFor(3, true),
        waitingForManager: false,
        readonly: false,
      }
    }

    return {
      currentStep: 3,
      stepName: 'قرار الملاحظة',
      description: 'جميع المستندات حُسمت، اتخذ قرارك.',
      completedSteps: [1, 2],
      nextAction: 'اعتمد الملاحظة أو أعدها للموظف بسبب واضح.',
      blockingRequirements: [],
      primaryActionLabel: 'اعتماد الملاحظة',
      primaryActionHandler: 'approve_finding',
      secondaryActions: [{ label: 'إرجاع للموظف', handler: 'return_finding', reasonRequired: true }],
      stages: stagesFor(3, true),
      waitingForManager: false,
      readonly: false,
    }
  }

  return {
    currentStep: 1,
    stepName: 'بانتظار الموظف',
    description: 'لم ترفع جميع الإجراءات التصحيحية للمدير بعد.',
    completedSteps: [],
    nextAction: 'لا يوجد قرار إداري متاح قبل اكتمال رفع الإجراءات.',
    blockingRequirements: ['جميع الإجراءات يجب أن تكون مرسلة لمراجعة المدير.'],
    primaryActionLabel: 'بانتظار رفع الموظف',
    primaryActionHandler: 'none',
    secondaryActions: [],
    stages: stagesFor(1),
    waitingForManager: false,
    readonly: true,
  }
}

export function buildSimplifiedCaseViewModel(input: SimplifiedCaseViewModelInput): SimplifiedCaseViewModel {
  const canManage = hasManagerExperienceAccess(input.roles)
  const managerPhase = areAllCorrectiveActionsSubmitted(input.snapshot.correctiveActionStatuses)
    || ['submitted_for_manager_review', 'under_manager_review', 'approved', 'closed'].includes(input.snapshot.workflowStatus)
  const returnedToAssignedEmployee = input.snapshot.workflowStatus === 'returned_for_revision'
    && input.isAssignedEmployee
  const actorType: SimplifiedActorType = returnedToAssignedEmployee
    ? 'employee'
    : canManage && managerPhase
    ? 'manager'
    : input.isAssignedEmployee
      ? 'employee'
      : canManage
        ? 'manager'
        : 'viewer'
  const references = referenceCounts(input.snapshot)

  if (actorType === 'viewer') {
    return {
      actorType,
      currentStep: input.snapshot.workflowStatus === 'closed' ? 4 : 1,
      totalSteps: 4,
      stepName: 'عرض الملاحظة',
      description: 'صلاحيتك الحالية للاطلاع فقط.',
      completedSteps: [],
      nextAction: 'لا توجد إجراءات متاحة لدورك الحالي.',
      blockingRequirements: [],
      primaryActionLabel: 'قراءة فقط',
      primaryActionHandler: 'none',
      secondaryActions: [],
      stages: stagesFor(input.snapshot.workflowStatus === 'closed' ? 4 : 0),
      progress: input.snapshot.progress,
      referenceCounts: references,
      waitingForManager: false,
      readonly: true,
    }
  }

  const model = actorType === 'employee'
    ? employeeModel(
        input.snapshot,
        Boolean(input.hasEmployeeActivityAfterReturn),
        Boolean(input.hasCompleteExecutionDetails),
      )
    : managerModel(input.snapshot)

  return {
    actorType,
    totalSteps: 4,
    progress: input.snapshot.progress,
    referenceCounts: references,
    returnReason: input.snapshot.workflowStatus === 'returned_for_revision'
      ? input.latestReturnReason ?? null
      : null,
    ...model,
  }
}

export function simplifiedCaseQueues(snapshot: CaseSnapshot): SimplifiedQueueKey[] {
  const queues: SimplifiedQueueKey[] = []
  const open = snapshot.workflowStatus !== 'closed'
  const allActionsSubmitted = areAllCorrectiveActionsSubmitted(snapshot.correctiveActionStatuses)
  const references = referenceCounts(snapshot)

  if (open && (
    !hasOfficialEmail(snapshot)
    || snapshot.progress < 100
    || snapshot.workflowStatus === 'returned_for_revision'
  )) queues.push('employee_needs_update')
  if (open && hasUnansweredOfficialEmail(snapshot)) queues.push('employee_awaiting_reply')
  if (snapshot.workflowStatus === 'returned_for_revision') {
    queues.push('employee_returned', 'manager_returned_employee')
  }
  if (open && snapshot.progress === 100 && references.total > 0 && !allActionsSubmitted) {
    queues.push('employee_ready_to_send')
  }
  if (allActionsSubmitted || ['submitted_for_manager_review', 'under_manager_review'].includes(snapshot.workflowStatus)) {
    queues.push('employee_waiting_manager')
  }
  if (allActionsSubmitted && ![
    'under_manager_review', 'approved', 'closed', 'returned_for_revision',
  ].includes(snapshot.workflowStatus)) queues.push('manager_pending_start')
  if (snapshot.workflowStatus === 'under_manager_review' && (references.pending > 0 || references.rejected > 0)) {
    queues.push('manager_documents_pending')
  }
  if (snapshot.workflowStatus === 'under_manager_review' && areAllDocumentReferencesApproved(snapshot.documentReferenceStatuses)) {
    queues.push('manager_ready_approval')
  }

  return queues
}
