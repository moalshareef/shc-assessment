import type { ReactNode } from 'react'
import type { ViewName } from '../../app/types'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  children: ReactNode
  sidebarOpen: boolean
  onSidebarOpen: () => void
  onSidebarClose: () => void
  activeView: ViewName
  isWorkspaceView: boolean
  onNavigate: (view: ViewName) => void
  onSignOut: () => void
  signOutLoading: boolean
  isSystemOwner: boolean
}

export function AppLayout({ children, sidebarOpen, onSidebarOpen, onSidebarClose, activeView, isWorkspaceView, onNavigate, onSignOut, signOutLoading, isSystemOwner }: AppLayoutProps) {
  return (
    <div className="app-shell" dir="rtl">
      {sidebarOpen && <button className="overlay" aria-label="إغلاق القائمة" onClick={onSidebarClose} />}
      <Sidebar open={sidebarOpen} activeView={activeView} isWorkspaceView={isWorkspaceView} onNavigate={onNavigate} isSystemOwner={isSystemOwner} />
      <main className="content">
        <Header onSidebarOpen={onSidebarOpen} onSignOut={onSignOut} signOutLoading={signOutLoading} />
        <section className="page">{children}</section>
      </main>
    </div>
  )
}
