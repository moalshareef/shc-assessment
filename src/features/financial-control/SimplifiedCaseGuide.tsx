import type { ReactNode } from 'react'
import type { SimplifiedCaseViewModel } from './simplifiedCaseViewModel'

interface SimplifiedCaseGuideProps {
  model: SimplifiedCaseViewModel
  primaryControl: ReactNode
  secondaryControls?: ReactNode
}

const actorTitles = {
  employee: 'ماذا أفعل الآن؟',
  manager: 'قرارك الحالي',
  viewer: 'حالة الملاحظة',
} as const

export function SimplifiedCaseGuide({
  model,
  primaryControl,
  secondaryControls,
}: SimplifiedCaseGuideProps) {
  return (
    <section className={`simplified-guide simplified-guide--${model.actorType}`} data-testid="simplified-case-guide">
      <div className="simplified-guide__heading">
        <div>
          <span className="eyebrow">{model.actorType === 'manager' ? 'مسار المدير' : model.actorType === 'employee' ? 'مسار الموظف' : 'عرض مبسط'}</span>
          <h2>{actorTitles[model.actorType]}</h2>
        </div>
        {model.actorType === 'employee' ? (
          <span className="simplified-guide__step">الخطوة {model.currentStep} من {model.totalSteps}</span>
        ) : null}
      </div>

      <ol className="simplified-stage-bar" aria-label="مراحل متابعة الملاحظة">
        {model.stages.map((stage) => (
          <li key={stage.key} className={`simplified-stage simplified-stage--${stage.state}`}>
            <span className="simplified-stage__dot" aria-hidden="true" />
            <span>{stage.label}</span>
            <small>{stage.state === 'completed' ? 'مكتملة' : stage.state === 'current' ? 'الحالية' : stage.state === 'needs_action' ? 'تحتاج إجراء' : 'قادمة'}</small>
          </li>
        ))}
      </ol>

      <div className="simplified-guide__body">
        <div className="simplified-guide__summary">
          <span className="simplified-guide__kicker">{model.stepName}</span>
          <p>{model.description}</p>
          {model.returnReason ? (
            <div className="simplified-return-reason" role="note">
              <strong>سبب الإرجاع من المدير</strong>
              <p>{model.returnReason}</p>
            </div>
          ) : null}
          <div className="simplified-guide__metrics">
            <span>الإنجاز <strong>{model.progress}%</strong></span>
            <span>المراجع <strong>{model.referenceCounts.total}</strong></span>
            {model.actorType === 'manager' ? (
              <>
                <span>بانتظار القرار <strong>{model.referenceCounts.pending}</strong></span>
                <span>مرفوضة <strong>{model.referenceCounts.rejected}</strong></span>
              </>
            ) : null}
          </div>
        </div>

        <div className="simplified-guide__action">
          <span>الإجراء التالي</span>
          <strong>{model.nextAction}</strong>
          {model.blockingRequirements.length > 0 ? (
            <div className="simplified-requirements" role="note">
              <span>المطلوب قبل الانتقال:</span>
              <ul>{model.blockingRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
            </div>
          ) : (
            <small className="simplified-ready">لا توجد متطلبات ناقصة لهذه الخطوة.</small>
          )}
          <div className="simplified-guide__primary">{primaryControl}</div>
          {secondaryControls ? <div className="simplified-guide__secondary">{secondaryControls}</div> : null}
        </div>
      </div>
    </section>
  )
}
