import { useEffect, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import type { IconName } from '../../components/layout/Header'
import { getFinancialControlDashboard } from '../../services/financialControlService'
import type {
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

const roleLabels: Record<FinancialControlRole, string> = {
  owner: 'مالك مساحة العمل',
  manager: 'المدير',
  specialist: 'الموظف المختص',
  action_owner: 'مسؤول الإجراء التصحيحي',
  viewer: 'اطلاع فقط',
}

interface FinancialControlPageProps {
  onOpenWorkspace: () => void
}

export function FinancialControlPage({ onOpenWorkspace }: FinancialControlPageProps) {
  const [data, setData] = useState<FinancialControlDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const stats: Array<{ label: string; value: string; icon: IconName }> = data
    ? [
        { label: 'إجمالي الملاحظات', value: String(data.summary.totalFindings), icon: 'report' },
        { label: 'قيد التنفيذ', value: String(data.summary.inProgressFindings), icon: 'clock' },
        { label: 'متأخرة', value: String(data.summary.overdueFindings), icon: 'alert' },
        { label: 'مغلقة', value: String(data.summary.closedFindings), icon: 'check' },
        { label: 'إجمالي الإجراءات التصحيحية', value: String(data.summary.totalCorrectiveActions), icon: 'tasks' },
      ]
    : []

  const recent: FinancialControlFinding[] = data?.findings.slice(0, 5) ?? []
  const closureRate = data && data.summary.totalFindings > 0
    ? Math.round((data.summary.closedFindings / data.summary.totalFindings) * 100)
    : 0

  return (
    <>
      <div className="breadcrumb">الرئيسية / مساحات العمل / تقرير الكفاءة الرقابية</div>
      <div className="page-heading">
        <div><span className="eyebrow">مساحة العمل الحالية</span><h1>تقرير الكفاءة الرقابية</h1><p>متابعة الضوابط والملاحظات والخطط التصحيحية والاعتمادات.</p></div>
        <button className="primary-button" onClick={onOpenWorkspace}>عرض مساحة العمل <Icon name="arrow" size={19}/></button>
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

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header"><div><h2>آخر الملاحظات</h2><p>عرض مبسط لحالة التنفيذ الحالية</p></div><button className="text-button">عرض الكل</button></div>
              {recent.length > 0 ? (
                <div className="table-wrap"><table><thead><tr><th>الملاحظة</th><th>الإدارة</th><th>الحالة</th><th>الإنجاز</th></tr></thead><tbody>
                  {recent.map((item) => {
                    const isOverdue = item.workflow_status !== 'closed' && item.current_due_date < new Date().toISOString().slice(0, 10)
                    const status = isOverdue ? 'متأخرة' : statusLabels[item.workflow_status]
                    return <tr key={item.id}><td><strong>{item.title}</strong><span style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>{item.reference_code}</span></td><td>{item.official_owner_label}</td><td><span className={`status ${isOverdue ? 'danger' : item.workflow_status === 'not_started' ? 'muted' : ''}`}>{status}</span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${item.progress_percent}%` }} /></div><span>{item.progress_percent}%</span></div></td></tr>
                  })}
                </tbody></table></div>
              ) : (
                <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>لا توجد ملاحظات رقابية مستوردة حتى الآن</p>
              )}
            </section>

            <aside className="side-stack">
              <section className="panel compact"><div className="panel-header"><div><h2>ملخص الأداء</h2><p>حتى اليوم</p></div><Icon name="trend" size={22}/></div><div className="performance-box"><strong>{closureRate}%</strong><span>نسبة الملاحظات المغلقة</span></div></section>
              <section className="panel compact"><div className="panel-header"><div><h2>فريق العمل</h2><p>عضويتك الحالية</p></div><Icon name="users" size={22}/></div><div className="team-row"><strong>{data.memberships.map((membership) => roleLabels[membership.role]).join('، ')}</strong><span className="status success">نشطة</span></div></section>
            </aside>
          </div>
        </>
      ) : null}
    </>
  )
}
