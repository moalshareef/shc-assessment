import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import type { IconName } from '../../components/layout/Header'
import { getFinancialControlDashboard } from '../../services/financialControlService'
import type {
  CorrectiveActionStatus,
  FinancialControlAssessmentRating,
  FinancialControlDashboardData,
  FinancialControlFinding,
  FinancialControlFindingStatus,
  FinancialControlRole,
} from '../../types/financialControl'

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

const roleLabels: Record<FinancialControlRole, string> = {
  owner: 'مالك مساحة العمل',
  manager: 'المدير',
  specialist: 'الموظف المختص',
  action_owner: 'مسؤول الإجراء التصحيحي',
  viewer: 'اطلاع فقط',
}

type FindingSort = 'code_asc' | 'code_desc' | 'date_asc' | 'date_desc' | 'status'

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

  const fetchDashboard = () => {
    setLoading(true)
    setError(null)

    getFinancialControlDashboard()
      .then(setData)
      .catch((requestError: unknown) => {
        setData(null)
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'تعذر تحميل بيانات الرقابة المالية. تحقق من الاتصال والصلاحيات.',
        )
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDashboard()
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

        <div className="detail-grid">
          <section className="detail-card">
            <h2>بيانات المتابعة</h2>
            <div className="detail-item"><span>التقييم</span><strong>{ratingLabels[selectedFinding.assessment_rating]}</strong></div>
            <div className="detail-item"><span>الحالة</span><strong>{statusLabels[selectedFinding.workflow_status]}</strong></div>
            <div className="detail-item"><span>المسؤول الرسمي</span><strong>{selectedFinding.official_owner_label}</strong></div>
            <div className="detail-item"><span>الموعد المستهدف</span><strong>{selectedFinding.official_due_date}</strong></div>
            <div className="detail-item"><span>نسبة الإنجاز</span><strong>{selectedFinding.progress_percent}%</strong></div>
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
              {selectedFinding.corrective_actions.map((action) => (
                <article key={action.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <strong>الإجراء رقم {action.action_no}</strong>
                    <span className="status">{actionStatusLabels[action.workflow_status]}</span>
                  </div>
                  <p style={{ color: '#2d4357', lineHeight: 2 }}>{action.official_action_text}</p>
                  <div className="detail-item"><span>الموعد</span><strong>{action.current_due_date}</strong></div>
                  <div className="detail-item"><span>الإنجاز</span><strong>{action.progress_percent}%</strong></div>
                </article>
              ))}
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
