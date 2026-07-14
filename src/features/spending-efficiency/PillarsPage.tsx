import { useEffect, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import { getPillarsSorted } from '../../services/spendingEfficiencyService'
import type { SupabasePillar } from '../../types/spendingEfficiency'

interface PillarsPageProps {
  onBack: () => void
  onOpenDetails: (pillar: SupabasePillar) => void
}

export function PillarsPage({ onBack, onOpenDetails }: PillarsPageProps) {
  const [pillars, setPillars] = useState<SupabasePillar[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPillars = () => {
    setLoading(true)
    setError(null)
    getPillarsSorted()
      .then((data) => setPillars(data))
      .catch((err: Error) => setError(err.message || 'تعذّر جلب الركائز'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPillars() }, [])

  return (
    <div className="workspace-page">
      <div className="breadcrumb">الرئيسية / مساحات العمل / ركائز كفاءة الإنفاق</div>
      <div className="page-heading">
        <div><span className="eyebrow">ركائز كفاءة الإنفاق</span><h1>ركائز كفاءة الإنفاق</h1><p>الركائز الرسمية من قاعدة البيانات.</p></div>
        <button className="secondary-button" onClick={onBack}>العودة إلى مساحات العمل <Icon name="arrow" size={19}/></button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)', marginTop: 32, textAlign: 'center' }}>جاري تحميل الركائز...</p>
      ) : error ? (
        <div style={{ marginTop: 32, display: 'grid', gap: 12, justifyItems: 'center' }}>
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <button className="secondary-button" onClick={fetchPillars}>إعادة المحاولة</button>
        </div>
      ) : pillars.length === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: 32, textAlign: 'center' }}>لا توجد ركائز متاحة حاليًا.</p>
      ) : (
        <>
          <div className="workspace-summary-grid">
            <article className="summary-card"><span>عدد الركائز</span><strong>{pillars.length}</strong></article>
          </div>
          <div className="pillar-grid">
            {pillars.map((pillar) => (
              <article className="pillar-card" key={pillar.id}>
                <div className="pillar-card-top">
                  <div>
                    <h2>{pillar.name}</h2>
                    <p>{pillar.description ?? '—'}</p>
                  </div>
                  <span className="status">{pillar.code ?? '—'}</span>
                </div>
                <div className="pillar-meta">
                  <span>الترتيب: {pillar.sort_order ?? '—'}</span>
                </div>
                <button className="secondary-button full-width" onClick={() => onOpenDetails(pillar)}>عرض التفاصيل</button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

