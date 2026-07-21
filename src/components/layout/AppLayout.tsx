import type { ReactNode } from 'react'
import type { ViewName } from '../../app/types'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import type { UserIdentity } from './userIdentityModel'

interface AppLayoutProps {
  children: ReactNode
  sidebarOpen: boolean
  onSidebarOpen: () => void
  onSidebarClose: () => void
  activeView: ViewName
  isWorkspaceView: boolean
  onNavigate: (view: ViewName) => void
  onSignOut: () => void
  onChangePassword: () => void
  signOutLoading: boolean
  isSystemOwner: boolean
  hasOperationalAccess: boolean
  identity: UserIdentity
}

export function AppLayout({ children, sidebarOpen, onSidebarOpen, onSidebarClose, activeView, isWorkspaceView, onNavigate, onSignOut, onChangePassword, signOutLoading, isSystemOwner, hasOperationalAccess, identity }: AppLayoutProps) {
  return (
    <div className="app-shell" dir="rtl">
      {sidebarOpen && <button className="overlay" aria-label="إغلاق القائمة" onClick={onSidebarClose} />}
      <Sidebar open={sidebarOpen} activeView={activeView} isWorkspaceView={isWorkspaceView} onNavigate={onNavigate} isSystemOwner={isSystemOwner} hasOperationalAccess={hasOperationalAccess} />
      <main className="content">
        <Header onSidebarOpen={onSidebarOpen} onSignOut={onSignOut} onChangePassword={onChangePassword} signOutLoading={signOutLoading} identity={identity} />
        <section className="page">{children}</section>
      </main>
    </div>
  )
}
