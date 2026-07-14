import { Icon } from '../../components/layout/Header'

interface WorkspacesPageProps {
  onOpenFinancialControl: () => void
  onOpenPillars: () => void
}

export function WorkspacesPage({ onOpenFinancialControl, onOpenPillars }: WorkspacesPageProps) {
  return (
    <div className="workspace-page">
      <div className="breadcrumb">الرئيسية / مساحات العمل</div>
      <div className="page-heading">
        <div><span className="eyebrow">مساحات العمل</span><h1>مساحات العمل</h1><p>اختر مساحة العمل المناسبة لمتابعة الأنشطة والتقارير.</p></div>
      </div>

      <div className="workspace-card-grid">
        <button className="workspace-card workspace-card-primary" onClick={onOpenFinancialControl}>
          <div className="workspace-card-top">
            <span className="workspace-badge">متاح</span>
            <Icon name="report" size={24} />
          </div>
          <h2>تقرير الكفاءة الرقابية</h2>
          <p>العودة إلى الواجهة الحالية لعرض التقرير والبيانات المتاحة.</p>
        </button>

        <button className="workspace-card workspace-card-primary" onClick={onOpenPillars}>
          <div className="workspace-card-top">
            <span className="workspace-badge">متاح</span>
            <Icon name="settings" size={24} />
          </div>
          <h2>ركائز كفاءة الإنفاق</h2>
          <p>عرض الركائز المؤقتة والمتطلبات التجريبية الخاصة بهذا المسار.</p>
        </button>
      </div>
    </div>
  )
}

