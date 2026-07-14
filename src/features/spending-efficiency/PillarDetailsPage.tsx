import { useEffect, useState } from 'react'
import { Icon } from '../../components/layout/Header'
import { getPillarDetails } from '../../services/spendingEfficiencyService'
import type { PillarDetailData, SupabasePillar } from '../../types/spendingEfficiency'

const requirementStatusMap: Record<string, string> = {
  not_started: 'لم يبدأ',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  delayed: 'متأخر',
}

function formatRequirementStatus(status: string | null | undefined): string {
  if (!status) return '—'
  return requirementStatusMap[status] || status
}

interface PillarDetailsPageProps {
  pillar: SupabasePillar
  onBack: () => void
}

export function PillarDetailsPage({ pillar, onBack }: PillarDetailsPageProps) {
  const [detail, setDetail] = useState<PillarDetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = () => {
    setLoading(true)
    setError(null)
    getPillarDetails(pillar.id)
      .then((data) => setDetail(data))
      .catch((err: Error) => setError(err.message || 'تعذّر جلب التفاصيل'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchDetail() }, [pillar.id])

  return (
    <div className="workspace-page">
      <div className="breadcrumb">الرئيسية / مساحات العمل / ركائز كفاءة الإنفاق / {pillar.name}</div>
      <div className="page-heading">
        <div><span className="eyebrow">تفاصيل الركيزة</span><h1>{pillar.name}</h1><p>{pillar.description ?? 'بيانات رسمية من قاعدة البيانات.'}</p></div>
        <button className="secondary-button" onClick={onBack}>العودة إلى ركائز كفاءة الإنفاق <Icon name="arrow" size={19}/></button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)', marginTop: 32, textAlign: 'center' }}>جاري تحميل التفاصيل...</p>
      ) : error ? (
        <div style={{ marginTop: 32, display: 'grid', gap: 12, justifyItems: 'center' }}>
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <button className="secondary-button" onClick={fetchDetail}>إعادة المحاولة</button>
        </div>
      ) : (
        <section className="detail-panel">
          <div className="detail-grid">
            <article className="detail-card">
              <h2>معلومات الركيزة</h2>
              <div className="detail-item"><span>الرمز</span><strong>{pillar.code ?? '—'}</strong></div>
              <div className="detail-item"><span>الترتيب</span><strong>{pillar.sort_order ?? '—'}</strong></div>
              <div className="detail-item"><span>عدد الركائز الفرعية</span><strong>{detail?.subPillars.length ?? '—'}</strong></div>
              <div className="detail-item"><span>عدد الأسئلة</span><strong>{detail?.questions.length ?? '—'}</strong></div>
              <div className="detail-item"><span>عدد المعايير</span><strong>{detail?.requirements.length ?? '—'}</strong></div>
            </article>
          </div>

          {detail && detail.subPillars.length > 0 ? (
            <div className="detail-section">
              <h2>الركائز الفرعية</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {detail.subPillars.map((sp) => {
                  const spQuestions = detail.questions.filter((q) => q.sub_pillar_id === sp.id)
                  return (
                    <article className="detail-card" key={sp.id}>
                      <div className="detail-item"><span>{sp.code ?? '—'}</span><strong>{sp.name}</strong></div>
                      {sp.description ? <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{sp.description}</p> : null}
                      {spQuestions.length > 0 ? (
                        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                          {spQuestions.map((q) => {
                            const qReqs = detail.requirements.filter((r) => r.question_id === q.id)
                            return (
                              <div key={q.id} className="detail-card" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                                <p style={{ margin: 0, fontWeight: 600 }}>{q.code ? `${q.code} — ` : ''}{q.question_text}</p>
                                {qReqs.length > 0 ? (
                                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                                    {qReqs.map((req) => (
                                      <div key={req.id} className="detail-item" style={{ flexWrap: 'wrap', gap: 6 }}>
                                        <span style={{ minWidth: 80 }}>{req.code || req.canonical_code || '—'}</span>
                                        <strong style={{ flex: 1 }}>{req.title || 'بدون عنوان'}</strong>
                                        <span className="status">{formatRequirementStatus(req.status)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p style={{ color: 'var(--muted)', fontSize: 12, margin: '6px 0 0' }}>لا توجد معايير مرتبطة.</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            </div>
          ) : detail ? (
            <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 24 }}>لا توجد ركائز فرعية لهذه الركيزة.</p>
          ) : null}
        </section>
      )}
    </div>
  )
}

