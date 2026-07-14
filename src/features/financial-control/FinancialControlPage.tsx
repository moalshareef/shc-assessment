import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import type { IconName } from '../../components/layout/Header'
import {
  getFinancialControlDashboard,
  transitionFinancialControlAction,
  transitionFinancialControlFinding,
  updateCorrectiveActionProgress,
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
  imported_pending_review: 'مستورد – بانتظار المراجعة',
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
  blocked: 'متعثر',
  submitted_for_specialist_review: 'مرسل لمراجعة المختص',
  under_specialist_review: 'تحت مراجعة المختص',
  returned_for_revision: 'معاد للتعديل',
  specialist_verified: 'تحقق منه المختص',
  completed: 'مكتمل',
}

const ratingLabels: Record<FinancialControlAssessmentRating, string> = {
  partially_effective: 'شبه فعال',
  not_exists: 'غير موجود',
}

type FindingSort = 'code_asc' | 'code_desc' | 'date_asc' | 'date_desc' | 'status'

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
  imported_pending_review: [{ to: 'not_started', label: 'بدء المتابعة', roles: ['specialist', 'manager'] }],
  not_started: [{ to: 'in_progress', label: 'نقل إلى قيد التنفيذ', roles: ['specialist', 'manager'] }],
  in_progress: [{ to: 'submitted_for_manager_review', label: 'إرسال لمراجعة المدير', roles: ['specialist'] }],
  submitted_for_manager_review: [{ to: 'under_manager_review', label: 'بدء مراجعة المدير', roles: ['manager'] }],
  under_manager_review: [
    { to: 'returned_for_revision', label: 'إرجاع للتعديل', roles: ['manager'] },
    { to: 'approved', label: 'اعتماد الملاحظة', roles: ['manager'] },
  ],
  approved: [{ to: 'closed', label: 'إغلاق الملاحظة', roles: ['manager'] }],
  closed: [{ to: 'reopened', label: 'إعادة فتح الملاحظة', roles: ['manager'] }],
}

const actionTransitions: Partial<Record<CorrectiveActionStatus, ActionTransitionOption[]>> = {
  not_started: [{ to: 'in_progress', label: 'بدء تنفيذ الإجراء', roles: ['specialist', 'action_owner'] }],
  in_progress: [{ to: 'submitted_for_specialist_review', label: 'إرسال لمراجعة المختص', roles: ['action_owner'] }],
  submitted_for_specialist_review: [{ to: 'under_specialist_review', label: 'بدء مراجعة المختص', roles: ['specialist'] }],
  under_specialist_review: [
    { to: 'returned_for_revision', label: 'إرجاع للتعديل', roles: ['specialist'] },
    { to: 'specialist_verified', label: 'اعتماد المختص', roles: ['specialist'] },
  ],
  returned_for_revision: [{
    to: 'submitted_for_specialist_review',
    label: 'إعادة إرسال الإجراء للمختص بعد التعديل',
    roles: ['action_owner'],
  }],
  specialist_verified: [{ to: 'completed', label: 'إكمال الإجراء', roles: ['specialist'] }],
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
  return finding.workflow_status !== 'closed'
    && finding.current_due_date < new Date().toISOString().slice(0, 10)
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

function mutationErrorMessage(error: unknown) {
  if (error instanceof FinancialControlServiceError) return error.message
  if (error instanceof Error) return error.message
  return 'تعذر حفظ التحديث. حاول مرة أخرى.'
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
  }, [data, dueDateFilter, ownerFilter, ratingFilter, search, sortBy, statusFilter])

  const selectedFinding = data?.findings.find((finding) => finding.id === selectedFindingId) ?? null
  const currentRoles = data?.memberships.map((membership) => membership.role) ?? []
  const currentUserId = data?.memberships[0]?.user_id ?? null
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
  }

  const runMutation = async (key: string, successMessage: string, operation: () => Promise<void>) => {
    setMutationKey(key)
    setMutationSuccess(null)
    setMutationError(null)

    try {
      await operation()
      applyDashboardData(await getFinancialControlDashboard())
      setMutationSuccess(successMessage)
    } catch (requestError: unknown) {
      setMutationError(mutationErrorMessage(requestError))
    } finally {
      setMutationKey(null)
    }
  }

  const handleProgressSave = (action: FinancialControlCorrectiveAction) => {
    const progressPercent = Number(actionProgress[action.id])
    void runMutation(
      `progress-${action.id}`,
      'تم حفظ نسبة الإنجاز وملاحظة التحديث بنجاح.',
      () => updateCorrectiveActionProgress({
        correctiveActionId: action.id,
        progressPercent,
        executionDetails: actionNotes[action.id] ?? '',
        expectedLockVersion: action.lock_version,
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
        option.roles.some((role) => currentRoles.includes(role)),
      )
    : []

  if (selectedFinding) {
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

        <div className="detail-grid">
          <section className="detail-card">
            <h2>بيانات المتابعة</h2>
            <div className="detail-item"><span>التقييم</span><strong>{ratingLabels[selectedFinding.assessment_rating]}</strong></div>
            <div className="detail-item"><span>الحالة</span><strong>{statusLabels[selectedFinding.workflow_status]}</strong></div>
            <div className="detail-item"><span>المسؤول الرسمي</span><strong>{selectedFinding.official_owner_label}</strong></div>
            <div className="detail-item"><span>الموعد المستهدف</span><strong>{selectedFinding.official_due_date}</strong></div>
            <div className="detail-item"><span>نسبة الإنجاز</span><strong>{selectedFinding.progress_percent}%</strong></div>
            <div className="detail-item"><span>نسخة السجل</span><strong>{selectedFinding.lock_version}</strong></div>
            {availableFindingTransitions.length > 0 ? (
              <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                {availableFindingTransitions.some((option) => option.to === 'returned_for_revision' || option.to === 'reopened') ? (
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
                  {availableFindingTransitions.map((option) => {
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
          <h2>التوصية والإجراء التصحيحي</h2>
          {selectedFinding.corrective_actions.length > 0 ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
              {selectedFinding.corrective_actions.map((action) => {
                const availableActionTransitions = (actionTransitions[action.workflow_status] ?? []).filter((option) =>
                  actionRoleAllowed(option, action, currentRoles, currentUserId),
                )
                const canUpdateProgress = currentRoles.some((role) =>
                  role === 'manager'
                  || role === 'specialist'
                  || (role === 'action_owner' && action.responsible_user_id === currentUserId),
                )

                return (
                  <article key={action.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <strong>الإجراء رقم {action.action_no}</strong>
                      <span className="status">{actionStatusLabels[action.workflow_status]}</span>
                    </div>
                    <p style={{ color: '#2d4357', lineHeight: 2 }}>{action.official_action_text}</p>
                    <div className="detail-item"><span>الموعد</span><strong>{action.current_due_date}</strong></div>
                    <div className="detail-item"><span>الإنجاز</span><strong>{action.progress_percent}%</strong></div>
                    <div className="detail-item"><span>نسخة السجل (lock_version)</span><strong>{action.lock_version}</strong></div>

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
                        {availableActionTransitions.some((option) => option.to === 'returned_for_revision') ? (
                          <textarea
                            aria-label={`سبب انتقال الإجراء ${action.action_no}`}
                            value={actionReasons[action.id] ?? ''}
                            onChange={(event) => setActionReasons((current) => ({ ...current, [action.id]: event.target.value }))}
                            placeholder="سبب الإرجاع للتعديل"
                            rows={3}
                            style={{ ...controlStyle, minHeight: 88, padding: 12, resize: 'vertical' }}
                          />
                        ) : null}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {availableActionTransitions.map((option) => (
                            <button
                              className="secondary-button"
                              type="button"
                              key={option.to}
                              disabled={
                                mutationKey !== null
                                || (option.to === 'returned_for_revision' && !(actionReasons[action.id] ?? '').trim())
                              }
                              onClick={() => handleActionTransition(action, option)}
                            >
                              {mutationKey === `action-${action.id}` ? 'جاري الحفظ...' : option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                  </article>
                )
              })}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>لا يوجد إجراء تصحيحي موثق لهذه الملاحظة.</p>
          )}
        </section>

        <section className="detail-section">
          <h2>سجل الحالة</h2>
          {selectedFinding.status_history.length > 0 ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {selectedFinding.status_history.map((historyItem) => (
                <div className="detail-item" key={historyItem.id}>
                  <span>{new Date(historyItem.changed_at).toLocaleString('ar-SA')}</span>
                  <strong>{historyItem.from_status ? `${statusLabels[historyItem.from_status]} ← ` : ''}{statusLabels[historyItem.to_status]}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>لا توجد انتقالات حالة مسجلة حتى الآن.</p>
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
                {dueDates.map((date) => <option value={date} key={date}>{date}</option>)}
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
              <div><h2>الملاحظات الرقابية</h2><p aria-live="polite" data-testid="findings-count">عرض {filteredFindings.length} من {data.findings.length} ملاحظة</p></div>
            </div>
            {filteredFindings.length > 0 ? (
              <div className="table-wrap"><table style={{ minWidth: 1180 }}><thead><tr><th>الكود والملاحظة</th><th>رقم الحالة</th><th>التقييم</th><th>المسؤول</th><th>الحالة</th><th>الموعد</th><th>الإنجاز</th><th></th></tr></thead><tbody data-testid="findings-table-body">
                {filteredFindings.map((item) => (
                  <tr key={item.id} data-testid="finding-row">
                    <td style={{ maxWidth: 340 }}><strong>{item.reference_code} — {item.title}</strong><span style={{ color: 'var(--muted)', display: 'block', marginTop: 5, lineHeight: 1.6 }}>{item.official_finding_text.slice(0, 115)}{item.official_finding_text.length > 115 ? '…' : ''}</span></td>
                    <td>{item.case_code}</td>
                    <td>{ratingLabels[item.assessment_rating]}</td>
                    <td>{item.official_owner_label}</td>
                    <td><span className={`status ${statusClass(item)}`}>{isFindingOverdue(item) ? 'متأخرة' : statusLabels[item.workflow_status]}</span></td>
                    <td>{item.official_due_date}</td>
                    <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${item.progress_percent}%` }} /></div><span>{item.progress_percent}%</span></div></td>
                    <td><button className="secondary-button" type="button" onClick={() => setSelectedFindingId(item.id)} aria-label={`فتح تفاصيل الملاحظة ${item.reference_code}`}>التفاصيل</button></td>
                  </tr>
                ))}
              </tbody></table></div>
            ) : (
              <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>لا توجد ملاحظات مطابقة لمعايير البحث والتصفية.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
