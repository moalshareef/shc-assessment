import { useState } from 'react'
import { formatArabicDateTime } from './dateFormat'
import type {
  FinancialControlFinding,
  FinancialControlFollowUp,
  FinancialControlOrganization,
  FinancialControlProfile,
  SetFinancialControlFollowUpStatusInput,
} from '../../types/financialControl'
import {
  buildUpcomingFollowUps,
  followUpStatusLabels,
  followUpTypeLabels,
} from './followUpModel'
import type {
  ManagerDashboardFilterKey,
  ManagerDashboardItemDefinition,
  ManagerDashboardViewModel,
} from './managerDashboardViewModel'

interface ManagerDashboardProps {
  model: ManagerDashboardViewModel
  activeFilter: ManagerDashboardFilterKey | null
  onSelectFilter: (key: ManagerDashboardFilterKey) => void
  onClearFilter: () => void
  findings: FinancialControlFinding[]
  followUps: FinancialControlFollowUp[]
  profiles: FinancialControlProfile[]
  organizations: FinancialControlOrganization[]
  busy: boolean
  onOpenFinding: (findingId: string) => void
  onSetFollowUpStatus: (input: SetFinancialControlFollowUpStatusInput) => void
}

function QueueButton({
  item,
  activeFilter,
  onSelect,
}: {
  item: ManagerDashboardItemDefinition
  activeFilter: ManagerDashboardFilterKey | null
  onSelect: (key: ManagerDashboardFilterKey) => void
}) {
  return (
    <button
      className="manager-queue-card"
      type="button"
      aria-pressed={activeFilter === item.key}
      onClick={() => onSelect(item.key)}
    >
      <span>{item.label}</span>
      <strong>{item.count}</strong>
      <small>{item.description}</small>
    </button>
  )
}

export function ManagerDashboard({
  model,
  activeFilter,
  onSelectFilter,
  onClearFilter,
  findings,
  followUps,
  profiles,
  organizations,
  busy,
  onOpenFinding,
  onSetFollowUpStatus,
}: ManagerDashboardProps) {
  const [showAllDepartments, setShowAllDepartments] = useState(false)
  const activeLabel = [...model.waiting, ...model.alerts, ...model.decisions]
    .find((item) => item.key === activeFilter)?.label
  const displayedDepartments = showAllDepartments ? model.departments : model.departments.slice(0, 6)
  const departmentIndicator = {
    overdue: { label: 'متأخرة', tone: 'danger' },
    needs_follow_up: { label: 'تحتاج متابعة', tone: 'danger' },
    on_track: { label: 'على المسار', tone: 'success' },
    no_current_deviation: { label: 'لا يوجد انحراف حالي', tone: 'muted' },
  } as const
  const upcomingFollowUps = buildUpcomingFollowUps(followUps, findings, profiles, organizations)

  return (
    <div className="manager-dashboard" data-testid="manager-dashboard">
      <section className="panel manager-section" aria-labelledby="manager-overview-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">نظرة قيادية</span><h2 id="manager-overview-title">الحالة العامة</h2></div>
          <span className="manager-last-update">آخر تحديث: {model.summary.lastUpdatedAt ? formatArabicDateTime(model.summary.lastUpdatedAt) : 'غير متاح'}</span>
        </div>
        <div className="manager-overview-grid">
          <div><span>إجمالي الملاحظات</span><strong>{model.summary.total}</strong></div>
          <div><span>متوسط نسبة الإنجاز</span><strong>{model.summary.overallProgressPercent}%</strong></div>
          <div><span>نسبة الإغلاق</span><strong>{model.summary.closurePercent}%</strong></div>
          <div><span>الملاحظات المفتوحة</span><strong>{model.summary.open}</strong></div>
          <div className="manager-metric--danger"><span>المتأخرة</span><strong>{model.summary.overdue}</strong></div>
          <div className="manager-metric--warning"><span>المعرضة للتأخر</span><strong>{model.summary.atRisk}</strong></div>
        </div>
      </section>

      <section className="panel manager-section" aria-labelledby="manager-waiting-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">مسار العمل الحالي</span><h2 id="manager-waiting-title">ما ينتظرنا</h2></div>
          {activeLabel ? <button className="text-button" type="button" onClick={onClearFilter}>إلغاء الفلتر</button> : null}
        </div>
        {activeLabel ? <div className="manager-active-filter" role="status">الفلتر النشط: <strong>{activeLabel}</strong></div> : null}
        <div className="manager-queue-grid">
          {model.waiting.map((item) => <QueueButton key={item.key} item={item} activeFilter={activeFilter} onSelect={onSelectFilter} />)}
        </div>
      </section>

      <section className="panel manager-section" aria-labelledby="manager-alerts-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">أولوية المتابعة</span><h2 id="manager-alerts-title">الانحرافات والتنبيهات</h2></div>
        </div>
        <div className="manager-list">
          {model.alerts.map((item) => (
            <button key={item.key} type="button" className="manager-list__item" aria-pressed={activeFilter === item.key} onClick={() => onSelectFilter(item.key)}>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <b className={item.count > 0 ? 'manager-count manager-count--alert' : 'manager-count'}>{item.count}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="panel manager-section" aria-labelledby="manager-upcoming-follow-ups-title" data-testid="manager-upcoming-follow-ups">
        <div className="manager-section__header">
          <div><span className="eyebrow">إجراءات مسجلة</span><h2 id="manager-upcoming-follow-ups-title">متابعات قادمة</h2></div>
          <span className="status">{upcomingFollowUps.length} مفتوحة</span>
        </div>
        {upcomingFollowUps.length > 0 ? (
          <div className="follow-up-upcoming-list">
            {upcomingFollowUps.map(({ followUp, organizationLabel, findingLabel, responsibleLabel }) => (
              <article className="follow-up-upcoming-card" key={followUp.id}>
                <div className="follow-up-upcoming-card__heading">
                  <div><strong>{organizationLabel}</strong><span>{findingLabel}</span></div>
                  <span className={`status ${followUp.priority === 'urgent' ? 'danger' : ''}`}>{followUpTypeLabels[followUp.follow_up_type]}</span>
                </div>
                <div className="follow-up-upcoming-meta">
                  <span>التاريخ: <strong>{followUp.due_at ? formatArabicDateTime(followUp.due_at) : 'غير محدد'}</strong></span>
                  <span>المسؤول: <strong>{responsibleLabel}</strong></span>
                  <span>الحالة: <strong>{followUpStatusLabels[followUp.status]}</strong></span>
                </div>
                <p>{followUp.title ?? followUp.body}</p>
                <div className="follow-up-upcoming-actions">
                  <button className="text-button" type="button" onClick={() => onOpenFinding(followUp.finding_id)}>فتح الملاحظة</button>
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => onSetFollowUpStatus({ followUpId: followUp.id, status: 'completed', expectedLockVersion: followUp.lock_version })}>إنجاز</button>
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => onSetFollowUpStatus({ followUpId: followUp.id, status: 'cancelled', expectedLockVersion: followUp.lock_version })}>إلغاء</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="manager-empty">لا توجد متابعات قادمة مفتوحة.</p>}
      </section>

      <section className="panel manager-section" aria-labelledby="manager-departments-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">حسب الجهة المسؤولة</span><h2 id="manager-departments-title">متابعة الإدارات</h2></div>
        </div>
        {model.departments.length > 0 ? (
          <div className="manager-department-grid">
            {displayedDepartments.map((department) => (
              <article className="manager-department-card" key={department.name}>
                <div className="manager-department-card__heading">
                  <h3>{department.name}</h3>
                  <span className={`status ${departmentIndicator[department.indicator].tone}`}>
                    {departmentIndicator[department.indicator].label}
                  </span>
                </div>
                <div className="manager-department-metrics">
                  <span>الملاحظات <strong>{department.total}</strong></span>
                  <span>المغلقة <strong>{department.closed}</strong></span>
                  <span>المفتوحة <strong>{department.total - department.closed}</strong></span>
                  <span>المتأخرة <strong>{department.overdue}</strong></span>
                </div>
                <div className="progress-cell"><div className="progress-track"><span style={{ width: `${department.progressPercent}%` }} /></div><strong>{department.progressPercent}%</strong></div>
                <small>النشطة: {department.inProgress}</small>
                <small>آخر تحديث: {department.lastUpdatedAt ? formatArabicDateTime(department.lastUpdatedAt) : 'غير متاح'}</small>
              </article>
            ))}
            {model.departments.length > 6 ? (
              <button className="secondary-button" type="button" onClick={() => setShowAllDepartments((current) => !current)}>
                {showAllDepartments ? 'عرض أقل' : 'عرض جميع الإدارات'}
              </button>
            ) : null}
          </div>
        ) : <p className="manager-empty">لا تتوفر أسماء إدارات في البيانات الحالية.</p>}
      </section>

      <section className="panel manager-section" aria-labelledby="manager-decisions-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">إجراءات إدارية</span><h2 id="manager-decisions-title">قرارات المدير</h2></div>
        </div>
        {model.decisions.some((item) => item.count > 0) ? (
          <div className="manager-list manager-list--decisions">
            {model.decisions.map((item) => (
              <button key={item.key} type="button" className="manager-list__item" aria-pressed={activeFilter === item.key} onClick={() => onSelectFilter(item.key)}>
                <span><strong>{item.label}</strong><small>{item.description}</small></span><b className="manager-count">{item.count}</b>
              </button>
            ))}
          </div>
        ) : <p className="manager-empty">لا توجد قرارات معلقة ضمن البيانات الحالية.</p>}
      </section>

      <section className="panel manager-section" aria-labelledby="manager-goals-title">
        <div className="manager-section__header">
          <div><span className="eyebrow">المؤشرات الحالية</span><h2 id="manager-goals-title">تحقيق الأهداف</h2></div>
          <div style={{ display: 'grid', justifyItems: 'end', gap: 2 }}>
            <small className="manager-last-update">نسبة الإغلاق المحققة</small>
            <strong className="manager-goal-progress">{model.goals.progressPercent}%</strong>
          </div>
        </div>
        <div className="progress-track manager-goal-track"><span style={{ width: `${model.goals.progressPercent}%` }} /></div>
        <div className="manager-goal-metrics">
          <span>إجمالي المستهدف <strong>{model.goals.target}</strong></span>
          <span>المنجز <strong>{model.goals.completed}</strong></span>
          <span>قيد الإنجاز <strong>{model.goals.inProgress}</strong></span>
          <span>المتبقي <strong>{model.goals.remaining}</strong></span>
        </div>
      </section>
    </div>
  )
}
