import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import { getPlatformAdminOverview, PlatformAdminSessionExpiredError } from '../../services/platformAdminService'
import type { PlatformAdminOverview } from '../../types/platformAdmin'
import { PlatformModulesSection } from './PlatformModulesSection'
import './platformAdmin.css'

type PageState =
  | { status: 'loading' }
  | { status: 'unauthorized' }
  | { status: 'error'; message: string }
  | { status: 'ready'; overview: PlatformAdminOverview }

export function PlatformAdminPage() {
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const loadOverview = useCallback(async (showInitialLoading = false) => {
    if (showInitialLoading) setPageState({ status: 'loading' })
    else setRefreshing(true)

    try {
      const overview = await getPlatformAdminOverview()
      setPageState(overview ? { status: 'ready', overview } : { status: 'unauthorized' })
    } catch (error) {
      setPageState({
        status: 'error',
        message: error instanceof PlatformAdminSessionExpiredError
          ? error.message
          : 'تعذّر تحميل الإدارة المركزية. تحقق من الاتصال والصلاحيات ثم حاول مرة أخرى.',
      })
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    void getPlatformAdminOverview().then((overview) => {
      if (active) setPageState(overview ? { status: 'ready', overview } : { status: 'unauthorized' })
    }).catch((error: unknown) => {
      if (!active) return
      setPageState({
        status: 'error',
        message: error instanceof PlatformAdminSessionExpiredError
          ? error.message
          : 'تعذّر تحميل الإدارة المركزية. تحقق من الاتصال والصلاحيات ثم حاول مرة أخرى.',
      })
    })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV) void import('./platformModulesScenario.dev')
  }, [])

  if (pageState.status === 'loading') {
    return (
      <section className="platform-admin-state" aria-live="polite">
        <Icon name="shield" size={34} />
        <h1>جاري التحقق من صلاحية مالك النظام...</h1>
        <p>يتم التحقق من الجلسة والدور قبل عرض أي بيانات.</p>
      </section>
    )
  }

  if (pageState.status === 'unauthorized') {
    return (
      <section className="platform-admin-state platform-admin-state-denied" role="alert">
        <Icon name="alert" size={34} />
        <h1>غير مصرح بالوصول</h1>
        <p>هذه الصفحة متاحة لمالك النظام الفعّال فقط.</p>
      </section>
    )
  }

  if (pageState.status === 'error') {
    return (
      <section className="platform-admin-state" role="alert">
        <Icon name="alert" size={34} />
        <h1>تعذّر فتح الإدارة المركزية</h1>
        <p>{pageState.message}</p>
      </section>
    )
  }

  const { account, counts } = pageState.overview
  const cards = [
    {
      title: 'الموديلات',
      description: 'سجل مركزي للموديلات ومساحات العمل المرتبطة بها.',
      count: counts.modules,
      countLabel: 'موديل متاح حاليًا',
      icon: 'settings' as const,
      status: 'إدارة متاحة',
    },
    {
      title: 'المستخدمون والصلاحيات',
      description: 'عرض تعيينات أدوار المنصة المركزية دون تعديلها.',
      count: counts.roleAssignments,
      countLabel: 'تعيين دور منصي',
      icon: 'users' as const,
      status: 'قراءة فقط',
    },
    {
      title: 'الجهات',
      description: 'الهيكل المؤسسي والربط الانتقالي مع الإدارات.',
      count: counts.organizations,
      countLabel: 'جهة متاحة حاليًا',
      icon: 'workspace' as const,
      status: 'قيد الاستكمال',
    },
    {
      title: 'طلبات الصلاحيات',
      description: 'متابعة طلبات الإضافة والتغيير والإلغاء بعد بناء مسارها.',
      count: null,
      countLabel: 'لم يُبنَ سجل الطلبات بعد',
      icon: 'approval' as const,
      status: 'قيد الاستكمال',
    },
  ]

  return (
    <div className="platform-admin-page">
      <div className="breadcrumb">الرئيسية / الإدارة المركزية</div>
      <div className="page-heading platform-admin-heading">
        <div>
          <span className="eyebrow">حوكمة المنصة</span>
          <h1>الإدارة المركزية للمنصة</h1>
          <p>إدارة مركزية للموديلات، مع استمرار بقية أقسام الحوكمة في وضع القراءة فقط.</p>
        </div>
        <span className="platform-admin-readonly"><Icon name="shield" size={17} /> مالك النظام</span>
      </div>

      <section className="platform-owner-card" aria-labelledby="platform-owner-title">
        <div className="platform-owner-avatar">م</div>
        <div className="platform-owner-identity">
          <span>الحساب الحالي</span>
          <h2 id="platform-owner-title">{account.fullName}</h2>
          <p>{account.email}</p>
        </div>
        <dl className="platform-owner-meta">
          <div><dt>الدور</dt><dd>مالك النظام</dd></div>
          <div><dt>حالة الحساب</dt><dd><span className={`status ${account.isActive ? 'success' : 'danger'}`}>{account.isActive ? 'فعال' : 'غير فعال'}</span></dd></div>
        </dl>
      </section>

      <section className="platform-admin-card-grid" aria-label="أقسام الإدارة المركزية">
        {cards.map((card) => (
          <article className="platform-admin-card" key={card.title}>
            <div className="platform-admin-card-top">
              <span className="platform-admin-card-icon"><Icon name={card.icon} size={24} /></span>
              <span className="platform-admin-card-status">{card.status}</span>
            </div>
            <div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </div>
            <div className="platform-admin-card-count">
              <strong>{card.count ?? '—'}</strong>
              <span>{card.countLabel}</span>
            </div>
          </article>
        ))}
      </section>

      {refreshing ? <div className="platform-admin-refreshing" role="status">جاري تحديث بيانات الموديلات...</div> : null}
      <PlatformModulesSection modules={pageState.overview.modules} onReload={() => loadOverview(false)} />
    </div>
  )
}
