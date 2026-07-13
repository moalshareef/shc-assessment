import { useState } from 'react'
import shcLogo from './assets/shc-logo.png'

type IconName = 'home' | 'workspace' | 'tasks' | 'approval' | 'report' | 'settings' | 'search' | 'bell' | 'menu' | 'arrow' | 'shield' | 'clock' | 'check' | 'alert' | 'users' | 'trend'
type ViewName = 'home' | 'workspace'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, JSX.Element> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/></>,
    workspace: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3"/><path d="M3 12h18"/></>,
    tasks: <><path d="m4 7 2 2 4-4"/><path d="M12 7h8"/><path d="m4 15 2 2 4-4"/><path d="M12 15h8"/></>,
    approval: <><path d="M9 3h6l1 2h3v16H5V5h3l1-2Z"/><path d="m8 13 2.5 2.5L16 10"/></>,
    report: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20.3h-3v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.1 15a1.7 1.7 0 0 0-1.55-1H5.5v-3h.05a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.55V4.7h3v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.55 1H21v3h-.05a1.7 1.7 0 0 0-1.55 1Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    arrow: <><path d="m15 18-6-6 6-6"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    alert: <><path d="M10.3 3.8 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const navItems: Array<{ label: string; icon: IconName; view: ViewName }> = [
  { label: 'الرئيسية', icon: 'home', view: 'home' },
  { label: 'مساحات العمل', icon: 'workspace', view: 'workspace' },
  { label: 'المهام والمتابعة', icon: 'tasks', view: 'home' },
  { label: 'الاعتمادات', icon: 'approval', view: 'home' },
  { label: 'التقارير', icon: 'report', view: 'home' },
  { label: 'الإعدادات', icon: 'settings', view: 'home' },
]

const stats: Array<{ label: string; value: string; icon: IconName }> = [
  { label: 'إجمالي الملاحظات', value: '31', icon: 'shield' },
  { label: 'قيد التنفيذ', value: '14', icon: 'clock' },
  { label: 'مكتملة', value: '9', icon: 'check' },
  { label: 'متأخرة', value: '8', icon: 'alert' },
]

const recent = [
  { title: 'استقلالية نشاط المراجعة الداخلية', dept: 'إدارة المراجعة الداخلية', status: 'قيد التنفيذ', progress: 62 },
  { title: 'تسجيل وتصنيف التغييرات التقنية', dept: 'إدارة تقنية المعلومات', status: 'متأخرة', progress: 35 },
  { title: 'سجل الأصول الثابتة', dept: 'الإدارة المالية', status: 'قيد التنفيذ', progress: 74 },
  { title: 'المطابقات الشهرية', dept: 'الإدارة المالية', status: 'لم تبدأ', progress: 0 },
]

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeView, setActiveView] = useState<ViewName>('home')

  return (
    <div className="app-shell" dir="rtl">
      {sidebarOpen && <button className="overlay" aria-label="إغلاق القائمة" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="brand-logo" />
          <div className="platform-name">
            <strong>منصة إدارة المتابعة والاعتماد</strong>
            <span>المجلس الصحي السعودي</span>
          </div>
        </div>
        <nav aria-label="القائمة الرئيسية">
          {navItems.map(({ label, icon, view }) => (
            <button className={`nav-item ${activeView === view ? 'active' : ''}`} key={label} onClick={() => {
              setSidebarOpen(false)
              setActiveView(view)
            }}>
              <Icon name={icon} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-avatar">م</div>
          <div><strong>محمد الشريف</strong><span>مالك مساحة العمل</span></div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة"><Icon name="menu" size={22}/></button>
          <div className="topbar-title"><span>مرحبًا بك</span><strong>منصة المتابعة والاعتماد</strong></div>
          <div className="search-box"><Icon name="search" size={19}/><input placeholder="ابحث في المنصة..." aria-label="البحث" /></div>
          <button className="icon-button" aria-label="التنبيهات"><Icon name="bell" size={21}/></button>
        </header>

        <section className="page">
          {activeView === 'workspace' ? (
            <div className="workspace-page">
              <div className="breadcrumb">الرئيسية / مساحات العمل</div>
              <div className="page-heading">
                <div><span className="eyebrow">مساحات العمل</span><h1>مساحات العمل</h1><p>اختر مساحة العمل المناسبة لمتابعة الأنشطة والتقارير.</p></div>
              </div>

              <div className="workspace-card-grid">
                <button className="workspace-card workspace-card-primary" onClick={() => setActiveView('home')}>
                  <div className="workspace-card-top">
                    <span className="workspace-badge">متاح</span>
                    <Icon name="report" size={24} />
                  </div>
                  <h2>تقرير الكفاءة الرقابية</h2>
                  <p>العودة إلى الواجهة الحالية لعرض التقرير والبيانات المتاحة.</p>
                </button>

                <div className="workspace-card workspace-card-disabled" aria-disabled="true">
                  <div className="workspace-card-top">
                    <span className="workspace-badge disabled">قيد الإعداد</span>
                    <Icon name="settings" size={24} />
                  </div>
                  <h2>ركائز كفاءة الإنفاق</h2>
                  <p>سيتم إضافة هذا المسار قريبًا ضمن مساحات العمل.</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="breadcrumb">الرئيسية / مساحات العمل / تقرير الكفاءة الرقابية</div>
              <div className="page-heading">
                <div><span className="eyebrow">مساحة العمل الحالية</span><h1>تقرير الكفاءة الرقابية</h1><p>متابعة الضوابط والملاحظات والخطط التصحيحية والاعتمادات.</p></div>
                <button className="primary-button" onClick={() => setActiveView('workspace')}>عرض مساحة العمل <Icon name="arrow" size={19}/></button>
              </div>

              <div className="stats-grid">
                {stats.map(({ label, value, icon }) => (
                  <article className="stat-card" key={label}><div className="stat-icon"><Icon name={icon} size={22}/></div><div><span>{label}</span><strong>{value}</strong></div></article>
                ))}
              </div>

              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-header"><div><h2>آخر الملاحظات</h2><p>عرض مبسط لحالة التنفيذ الحالية</p></div><button className="text-button">عرض الكل</button></div>
                  <div className="table-wrap"><table><thead><tr><th>الملاحظة</th><th>الإدارة</th><th>الحالة</th><th>الإنجاز</th></tr></thead><tbody>
                    {recent.map((item) => <tr key={item.title}><td><strong>{item.title}</strong></td><td>{item.dept}</td><td><span className={`status ${item.status === 'متأخرة' ? 'danger' : item.status === 'لم تبدأ' ? 'muted' : ''}`}>{item.status}</span></td><td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${item.progress}%` }} /></div><span>{item.progress}%</span></div></td></tr>)}
                  </tbody></table></div>
                </section>

                <aside className="side-stack">
                  <section className="panel compact"><div className="panel-header"><div><h2>ملخص الأداء</h2><p>حتى اليوم</p></div><Icon name="trend" size={22}/></div><div className="performance-box"><strong>56%</strong><span>نسبة الإنجاز الكلية</span></div></section>
                  <section className="panel compact"><div className="panel-header"><div><h2>فريق العمل</h2><p>الأعضاء النشطون</p></div><Icon name="users" size={22}/></div><div className="team-row"><div className="avatars"><span>م</span><span>ع</span><span>س</span><span>ن</span></div><strong>12 عضوًا</strong></div></section>
                </aside>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
