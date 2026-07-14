import { Icon } from '../../components/layout/Header'
import type { IconName } from '../../components/layout/Header'

const stats: Array<{ label: string; value: string; icon: IconName }> = []
const recent: Array<{ title: string; dept: string; status: string; progress: number }> = []

interface FinancialControlPageProps {
  onOpenWorkspace: () => void
}

export function FinancialControlPage({ onOpenWorkspace }: FinancialControlPageProps) {
  return (
    <>
      <div className="breadcrumb">الرئيسية / مساحات العمل / تقرير الكفاءة الرقابية</div>
      <div className="page-heading">
        <div><span className="eyebrow">مساحة العمل الحالية</span><h1>تقرير الكفاءة الرقابية</h1><p>متابعة الضوابط والملاحظات والخطط التصحيحية والاعتمادات.</p></div>
        <button className="primary-button" onClick={onOpenWorkspace}>عرض مساحة العمل <Icon name="arrow" size={19}/></button>
      </div>

      <div className="stats-grid">
        {stats.length > 0 ? (
          stats.map(({ label, value, icon }) => (
            <article className="stat-card" key={label}><div className="stat-icon"><Icon name={icon} size={22}/></div><div><span>{label}</span><strong>{value}</strong></div></article>
          ))
        ) : (
          <p style={{ color: 'var(--muted)', gridColumn: '1 / -1' }}>لا توجد إحصائيات متاحة حاليًا.</p>
        )}
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h2>آخر الملاحظات</h2><p>عرض مبسط لحالة التنفيذ الحالية</p></div><button className="text-button">عرض الكل</button></div>
          {recent.length > 0 ? (
            <div className="table-wrap"><table><thead><tr><th>الملاحظة</th><th>الإدارة</th><th>الحالة</th><th>الإنجاز</th></tr></thead><tbody>
              {recent.map((item) => <tr key={item.title}><td><strong>{item.title}</strong></td><td>{item.dept}</td><td><span className={`status ${item.status === 'متأخرة' ? 'danger' : item.status === 'لم تبدأ' ? 'muted' : ''}`}>{item.status}</span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div><span>{item.progress}%</span></div></td></tr>)}
            </tbody></table></div>
          ) : (
            <p style={{ color: 'var(--muted)', padding: 16, textAlign: 'center' }}>لا توجد ملاحظات متاحة حاليًا.</p>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel compact"><div className="panel-header"><div><h2>ملخص الأداء</h2><p>حتى اليوم</p></div><Icon name="trend" size={22}/></div><div className="performance-box"><span style={{ color: 'var(--muted)' }}>بيانات غير متاحة</span></div></section>
          <section className="panel compact"><div className="panel-header"><div><h2>فريق العمل</h2><p>الأعضاء النشطون</p></div><Icon name="users" size={22}/></div><div className="team-row"><span style={{ color: 'var(--muted)' }}>بيانات غير متاحة</span></div></section>
        </aside>
      </div>
    </>
  )
}

