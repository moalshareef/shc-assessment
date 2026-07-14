import shcLogo from '../../assets/shc-logo.png'
import type { ViewName } from '../../app/types'
import { Icon } from './Header'
import type { IconName } from './Header'

const navItems: Array<{ label: string; icon: IconName; view: ViewName }> = [
  { label: 'الرئيسية', icon: 'home', view: 'home' },
  { label: 'مساحات العمل', icon: 'workspace', view: 'workspace' },
  { label: 'المهام والمتابعة', icon: 'tasks', view: 'home' },
  { label: 'الاعتمادات', icon: 'approval', view: 'home' },
  { label: 'التقارير', icon: 'report', view: 'home' },
  { label: 'الإعدادات', icon: 'settings', view: 'home' },
]

interface SidebarProps {
  open: boolean
  activeView: ViewName
  isWorkspaceView: boolean
  onNavigate: (view: ViewName) => void
}

export function Sidebar({ open, activeView, isWorkspaceView, onNavigate }: SidebarProps) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="brand">
        <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="brand-logo" />
        <div className="platform-name">
          <strong>منصة إدارة المتابعة والاعتماد</strong>
          <span>المجلس الصحي السعودي</span>
        </div>
      </div>
      <nav aria-label="القائمة الرئيسية">
        {navItems.map(({ label, icon, view }) => (
          <button className={`nav-item ${view === 'workspace' ? (isWorkspaceView ? 'active' : '') : activeView === view ? 'active' : ''}`} key={label} onClick={() => onNavigate(view)}>
            <Icon name={icon} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-avatar">م</div>
        <div><strong>محمد الشريف</strong><span>مالك مساحة العمل</span></div>
      </div>
    </aside>
  )
}

