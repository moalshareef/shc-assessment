import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { PasswordChangePage } from './features/auth/PasswordChangePage'
import { HomePage } from './features/home/HomePage'
import { WorkspacesPage } from './features/workspaces/WorkspacesPage'
import { PillarsPage } from './features/spending-efficiency/PillarsPage'
import { PillarDetailsPage } from './features/spending-efficiency/PillarDetailsPage'
import { PlatformAdminPage } from './features/platform-admin/PlatformAdminPage'
import { supabase } from './lib/supabase'
import { currentUserIsSystemOwner } from './services/platformAdminService'
import { currentProfileAccessState } from './services/platformUserAdminService'
import type { ViewName } from './app/types'
import type { SupabasePillar } from './types/spendingEfficiency'

function getViewFromLocation(): ViewName {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '')
  return normalizedPath.endsWith('/platform-admin') ? 'platformAdmin' : 'home'
}

function getPathForView(view: ViewName): string {
  const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '')
  return view === 'platformAdmin' ? `${basePath}/platform-admin` : `${basePath}/`
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeView, setActiveView] = useState<ViewName>(getViewFromLocation)
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [selectedPillar, setSelectedPillar] = useState<SupabasePillar | null>(null)
  const [isSystemOwner, setIsSystemOwner] = useState(false)
  const [profileAccessReady, setProfileAccessReady] = useState(false)
  const [profileActive, setProfileActive] = useState(false)
  const [mustChangePassword, setMustChangePassword] = useState(false)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setAuthReady(true)
      if (!nextSession) {
        setSignOutLoading(false)
      }
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthReady(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setIsSystemOwner(false)
      setProfileActive(false)
      setMustChangePassword(false)
      setProfileAccessReady(true)
      return
    }

    let active = true
    setProfileAccessReady(false)
    void currentProfileAccessState()
      .then((access) => {
        if (active) {
          setProfileActive(access.isActive)
          setMustChangePassword(access.mustChangePassword)
        }
      })
      .catch(() => {
        if (active) setProfileActive(false)
      })
      .finally(() => {
        if (active) setProfileAccessReady(true)
      })
    void currentUserIsSystemOwner()
      .then((hasRole) => {
        if (active) setIsSystemOwner(hasRole)
      })
      .catch(() => {
        if (active) setIsSystemOwner(false)
      })

    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    const handlePopState = () => {
      setActiveView(getViewFromLocation())
      setSelectedPillar(null)
      setSidebarOpen(false)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleNavigate = (view: ViewName) => {
    const nextPath = getPathForView(view)
    if (view === 'platformAdmin' || activeView === 'platformAdmin') {
      window.history.pushState({}, '', nextPath)
    }
    setSidebarOpen(false)
    setActiveView(view)
    setSelectedPillar(null)
  }

  const handleOpenWorkspace = () => {
    setSidebarOpen(false)
    setActiveView('workspace')
    setSelectedPillar(null)
  }

  const handleOpenPillars = () => {
    setSidebarOpen(false)
    setActiveView('pillars')
    setSelectedPillar(null)
  }

  const handleOpenPillarDetails = (pillar: SupabasePillar) => {
    setSelectedPillar(pillar)
    setActiveView('pillarDetail')
  }

  const handleSignOut = async () => {
    setSignOutLoading(true)
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      setSignOutLoading(false)
    }
  }

  const refreshProfileAccess = async () => {
    setProfileAccessReady(false)
    try {
      const access = await currentProfileAccessState()
      setProfileActive(access.isActive)
      setMustChangePassword(access.mustChangePassword)
    } finally {
      setProfileAccessReady(true)
    }
  }

  if (!authReady) {
    return <main className="auth-page" dir="rtl"><p>جاري استعادة الجلسة...</p></main>
  }

  if (!session) {
    return <LoginPage />
  }

  if (!profileAccessReady) {
    return <main className="auth-page" dir="rtl"><p>جاري التحقق من حالة الحساب...</p></main>
  }

  if (!profileActive) {
    return <main className="auth-page" dir="rtl"><section className="login-card"><h1>الحساب موقوف</h1><p>تم إيقاف هذا الحساب. تواصل مع مالك النظام إذا كنت تعتقد أن ذلك غير صحيح.</p><button className="primary-button" type="button" onClick={() => void handleSignOut()} disabled={signOutLoading}>{signOutLoading ? 'جاري تسجيل الخروج...' : 'العودة إلى تسجيل الدخول'}</button></section></main>
  }

  if (mustChangePassword) {
    return <PasswordChangePage onChanged={refreshProfileAccess} onSignOut={handleSignOut} />
  }

  const isWorkspaceView = activeView === 'workspace' || activeView === 'pillars' || activeView === 'pillarDetail'

  return (
    <AppLayout
      sidebarOpen={sidebarOpen}
      onSidebarOpen={() => setSidebarOpen(true)}
      onSidebarClose={() => setSidebarOpen(false)}
      activeView={activeView}
      isWorkspaceView={isWorkspaceView}
      onNavigate={handleNavigate}
      onSignOut={handleSignOut}
      signOutLoading={signOutLoading}
      isSystemOwner={isSystemOwner}
    >
      {activeView === 'platformAdmin' ? (
        <PlatformAdminPage />
      ) : activeView === 'workspace' ? (
        <WorkspacesPage onOpenFinancialControl={() => handleNavigate('home')} onOpenPillars={handleOpenPillars} />
      ) : activeView === 'pillars' ? (
        <PillarsPage onBack={handleOpenWorkspace} onOpenDetails={handleOpenPillarDetails} />
      ) : activeView === 'pillarDetail' && selectedPillar ? (
        <PillarDetailsPage pillar={selectedPillar} onBack={handleOpenPillars} />
      ) : (
        <HomePage onOpenWorkspace={handleOpenWorkspace} />
      )}
    </AppLayout>
  )
}
