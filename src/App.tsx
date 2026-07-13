import { useState } from 'react'
import {
  LayoutDashboard,
  BriefcaseBusiness,
  ShieldCheck,
  FileCheck2,
  Bell,
  Settings,
  Menu,
  Search,
  ChevronLeft,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  Users,
  TrendingUp
} from 'lucide-react'

const navItems = [
  { label: 'لوحة المؤشرات', icon: LayoutDashboard, active: true },
  { label: 'مساحات العمل', icon: BriefcaseBusiness },
  { label: 'الملاحظات الرقابية', icon: ShieldCheck },
  { label: 'الاعتمادات', icon: FileCheck2 },
  { label: 'التنبيهات', icon: Bell },
  { label: 'الإعدادات', icon: Settings },
]

const stats = [
  { label: 'إجمالي الملاحظات', value: '31', icon: ShieldCheck },
  { label: 'قيد التنفيذ', value: '14', icon: Clock3 },
  { label: 'مكتملة', value: '9', icon: CheckCircle2 },
  { label: 'متأخرة', value: '8', icon: AlertTriangle },
]

const recent = [
  { title: 'استقلالية نشاط المراجعة الداخلية', dept: 'إدارة المراجعة الداخلية', status: 'قيد التنفيذ', progress: 62 },
  { title: 'تسجيل وتصنيف التغييرات التقنية', dept: 'إدارة تقنية المعلومات', status: 'متأخرة', progress: 35 },
  { title: 'سجل الأصول الثابتة', dept: 'الإدارة المالية', status: 'قيد التنفيذ', progress: 74 },
  { title: 'المطابقات الشهرية', dept: 'الإدارة المالية', status: 'لم تبدأ', progress: 0 },
]

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">ر</div>
          <div>
            <strong>الرقابة المالية</strong>
            <span>منصة المتابعة والاعتماد</span>
          </div>
        </div>

        <nav>
          {navItems.map(({ label, icon: Icon, active }) => (
            <button className={`nav-item ${active ? 'active' : ''}`} key={label}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar">م</div>
          <div>
            <strong>محمد الشريف</strong>
            <span>مالك مساحة العمل</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="فتح القائمة">
            <Menu size={21} />
          </button>
          <div className="search-box">
            <Search size={18} />
            <input placeholder="ابحث في المنصة..." aria-label="البحث" />
          </div>
          <button className="icon-button" aria-label="التنبيهات">
            <Bell size={20} />
          </button>
        </header>

        <section className="page">
          <div className="page-heading">
            <div>
              <span className="eyebrow">مساحة العمل الحالية</span>
              <h1>تقرير الكفاءة الرقابية</h1>
              <p>متابعة الضوابط والملاحظات والخطط التصحيحية والاعتمادات.</p>
            </div>
            <button className="primary-button">
              عرض مساحة العمل
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="stats-grid">
            {stats.map(({ label, value, icon: Icon }) => (
              <article className="stat-card" key={label}>
                <div className="stat-icon"><Icon size={20} /></div>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>آخر الملاحظات</h2>
                  <p>عرض مبسط لحالة التنفيذ الحالية</p>
                </div>
                <button className="text-button">عرض الكل</button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الملاحظة</th>
                      <th>الإدارة</th>
                      <th>الحالة</th>
                      <th>الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((item) => (
                      <tr key={item.title}>
                        <td><strong>{item.title}</strong></td>
                        <td>{item.dept}</td>
                        <td><span className={`status ${item.status === 'متأخرة' ? 'danger' : item.status === 'لم تبدأ' ? 'muted' : ''}`}>{item.status}</span></td>
                        <td>
                          <div className="progress-cell">
                            <div className="progress-track">
                              <span style={{ width: `${item.progress}%` }} />
                            </div>
                            <span>{item.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="side-stack">
              <section className="panel compact">
                <div className="panel-header">
                  <div>
                    <h2>ملخص الأداء</h2>
                    <p>حتى اليوم</p>
                  </div>
                  <TrendingUp size={20} />
                </div>
                <div className="performance-box">
                  <strong>56%</strong>
                  <span>نسبة الإنجاز الكلية</span>
                </div>
              </section>

              <section className="panel compact">
                <div className="panel-header">
                  <div>
                    <h2>فريق العمل</h2>
                    <p>الأعضاء النشطون</p>
                  </div>
                  <Users size={20} />
                </div>
                <div className="team-row">
                  <div className="avatars">
                    <span>م</span><span>ع</span><span>س</span><span>ن</span>
                  </div>
                  <strong>12 عضوًا</strong>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </main>
    </div>
  )
}
