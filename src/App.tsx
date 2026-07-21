import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { PasswordChangePage } from './features/auth/PasswordChangePage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { HomePage } from './features/home/HomePage'
import { WorkspacesPage } from './features/workspaces/WorkspacesPage'
import { PillarsPage } from './features/spending-efficiency/PillarsPage'
import { PillarDetailsPage } from './features/spending-efficiency/PillarDetailsPage'
import { PlatformAdminPage } from './features/platform-admin/PlatformAdminPage'
import { supabase } from './lib/supabase'
import { currentUserIsSystemOwner } from './services/platformAdminService'
import { currentProfileAccessState } from './services/platformUserAdminService'
import { listCurrentOperationalAccess } from './services/platformUserAccessService'
import type { ViewName } from './app/types'
import type { SupabasePillar } from './types/spendingEfficiency'
import type { CurrentOperationalAccess } from './types/platformUserAccess'
import { buildUserIdentity } from './components/layout/userIdentityModel'

function getViewFromLocation(): ViewName {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '')
  return normalizedPath.endsWith('/platform-admin') ? 'platformAdmin' : 'home'
}

function isPasswordRecoveryPath() {
  return window.location.pathname.replace(/\/+$/, '').endsWith('/reset-password')
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
  const [operationalAccess, setOperationalAccess] = useState<CurrentOperationalAccess[]>([])
  const [passwordRecovery, setPasswordRecovery] = useState(isPasswordRecoveryPath)
  const [recoveryVerified, setRecoveryVerified] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    let mounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        setRecoveryVerified(true)
      }
      if (!nextSession) {
        setSignOutLoading(false)
        setChangingPassword(false)
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
      setOperationalAccess([])
      setProfileAccessReady(true)
      return
    }

    let active = true
    setProfileAccessReady(false)
    void Promise.all([
      currentProfileAccessState(),
      currentUserIsSystemOwner().catch(() => false),
      listCurrentOperationalAccess().catch(() => []),
    ]).then(([access, hasRole, nextOperationalAccess]) => {
      if (!active) return
      setProfileActive(access.isActive)
      setMustChangePassword(access.mustChangePassword)
      setIsSystemOwner(hasRole)
      setOperationalAccess(nextOperationalAccess)
    }).catch(() => {
      if (active) setProfileActive(false)
    }).finally(() => {
      if (active) setProfileAccessReady(true)
    })

    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    const handlePopState = () => {
      setPasswordRecovery(isPasswordRecoveryPath())
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

  const handleBackToLogin = async () => {
    await supabase.auth.signOut({ scope: 'local' })
    const basePath = import.meta.env.BASE_URL.replace(/\/+$/, '')
    window.history.replaceState({}, '', `${basePath}/`)
    setRecoveryVerified(false)
    setPasswordRecovery(false)
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

  if (passwordRecovery) {
    return (
      <ResetPasswordPage
        authReady={authReady}
        recoveryVerified={recoveryVerified}
        onBackToLogin={handleBackToLogin}
      />
    )
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

  if (mustChangePassword || changingPassword) {
    return (
      <PasswordChangePage
        onChanged={async () => { await refreshProfileAccess(); setChangingPassword(false) }}
        onSignOut={handleSignOut}
        mode={mustChangePassword ? 'required' : 'voluntary'}
        onCancel={mustChangePassword ? undefined : () => setChangingPassword(false)}
      />
    )
  }

  const isWorkspaceView = activeView === 'workspace' || activeView === 'pillars' || activeView === 'pillarDetail'
  const allowedWorkspaceCodes = [...new Set(operationalAccess.map((access) => access.workspaceCode))]
  const hasOperationalAccess = allowedWorkspaceCodes.length > 0
  const hasFinancialControlAccess = allowedWorkspaceCodes.includes('financial-control')
  const hasSpendingEfficiencyAccess = allowedWorkspaceCodes.includes('spending-efficiency')
  const identity = buildUserIdentity({ user: session.user, activeView, operationalAccess, isSystemOwner })

  const noOperationalAccess = (
    <section className="panel" role="status" style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', padding: 32 }}>
      <h1>لا توجد لديك صلاحيات تشغيلية حتى الآن.</h1>
      <p>تواصل مع مالك النظام لمنحك دورًا داخل مساحة العمل المناسبة.</p>
    </section>
  )

  return (
    <AppLayout
      sidebarOpen={sidebarOpen}
      onSidebarOpen={() => setSidebarOpen(true)}
      onSidebarClose={() => setSidebarOpen(false)}
      activeView={activeView}
      isWorkspaceView={isWorkspaceView}
      onNavigate={handleNavigate}
      onSignOut={handleSignOut}
      onChangePassword={() => setChangingPassword(true)}
      signOutLoading={signOutLoading}
      isSystemOwner={isSystemOwner}
      hasOperationalAccess={hasOperationalAccess}
      identity={identity}
    >
      {activeView === 'platformAdmin' ? (
        <PlatformAdminPage />
      ) : activeView === 'workspace' ? (
        hasOperationalAccess ? <WorkspacesPage onOpenFinancialControl={() => handleNavigate('home')} onOpenPillars={handleOpenPillars} allowedWorkspaceCodes={allowedWorkspaceCodes} /> : noOperationalAccess
      ) : activeView === 'pillars' ? (
        hasSpendingEfficiencyAccess ? <PillarsPage onBack={handleOpenWorkspace} onOpenDetails={handleOpenPillarDetails} /> : noOperationalAccess
      ) : activeView === 'pillarDetail' && selectedPillar ? (
        hasSpendingEfficiencyAccess ? <PillarDetailsPage pillar={selectedPillar} onBack={handleOpenPillars} /> : noOperationalAccess
      ) : (
        hasFinancialControlAccess ? <HomePage onOpenWorkspace={handleOpenWorkspace} /> : hasOperationalAccess ? <WorkspacesPage onOpenFinancialControl={() => handleNavigate('home')} onOpenPillars={handleOpenPillars} allowedWorkspaceCodes={allowedWorkspaceCodes} /> : noOperationalAccess
      )}
    </AppLayout>
  )
}
