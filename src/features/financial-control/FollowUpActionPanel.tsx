import { useMemo, useState } from 'react'
import type {
  CreateFinancialControlFollowUpInput,
  FinancialControlFinding,
  FinancialControlFollowUpPriority,
  FinancialControlOrganization,
  FinancialControlProfile,
} from '../../types/financialControl'
import { formatArabicDateTime } from './dateFormat'
import { reminderSummary } from './followUpModel'

interface FollowUpActionPanelProps {
  finding: FinancialControlFinding
  profiles: FinancialControlProfile[]
  organizations: FinancialControlOrganization[]
  busy: boolean
  onCreate: (input: CreateFinancialControlFollowUpInput) => Promise<boolean>
}

type OpenForm = 'reminder' | 'employee_direction' | null

function defaultDueValue() {
  const nextWeek = new Date(Date.now() + 7 * 86_400_000)
  const local = new Date(nextWeek.getTime() - nextWeek.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function FollowUpActionPanel({
  finding,
  profiles,
  organizations,
  busy,
  onCreate,
}: FollowUpActionPanelProps) {
  const [openForm, setOpenForm] = useState<OpenForm>(null)
  const [targetOrganizationId, setTargetOrganizationId] = useState(organizations[0]?.id ?? '')
  const [targetUserId, setTargetUserId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<FinancialControlFollowUpPriority>('normal')
  const [dueAt, setDueAt] = useState(defaultDueValue)
  const reminders = reminderSummary(finding.follow_ups ?? [])
  const profilesById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.full_name])), [profiles])
  const assignedEmployees = useMemo(() => Array.from(new Set(
    finding.corrective_actions
      .map((action) => action.responsible_user_id)
      .filter((id): id is string => Boolean(id)),
  )).map((id) => ({ id, name: profilesById.get(id) ?? 'موظف مسند' })), [finding.corrective_actions, profilesById])

  const closeForm = () => {
    setOpenForm(null)
    setBody('')
    setTitle('')
    setPriority('normal')
    setDueAt(defaultDueValue())
  }

  const open = (type: Exclude<OpenForm, null>) => {
    setOpenForm(type)
    if (type === 'reminder') setTargetOrganizationId(organizations[0]?.id ?? '')
    if (type === 'employee_direction') setTargetUserId(assignedEmployees[0]?.id ?? '')
  }

  const submit = async () => {
    if (!openForm) return
    const success = await onCreate({
      findingId: finding.id,
      followUpType: openForm,
      targetOrganizationId: openForm === 'reminder' ? targetOrganizationId || null : null,
      targetUserId: openForm === 'employee_direction' ? targetUserId || null : null,
      title: openForm === 'reminder' ? title : 'توجيه الموظف',
      body,
      priority: openForm === 'employee_direction' ? priority : 'normal',
      dueAt,
    })
    if (success) closeForm()
  }

  const submitDisabled = busy
    || !body.trim()
    || !dueAt
    || (openForm === 'reminder' && (!targetOrganizationId || !title.trim()))
    || (openForm === 'employee_direction' && !targetUserId)

  return (
    <section className="detail-section follow-up-actions" data-testid="manager-follow-up-actions">
      <div className="manager-section__header">
        <div>
          <span className="eyebrow">إجراءات المتابعة</span>
          <h2>تذكير الإدارة وتوجيه الموظف</h2>
        </div>
        <div className="follow-up-reminder-summary">
          <strong>{reminders.count}</strong>
          <span>تذكير مسجل</span>
        </div>
      </div>
      <p className="manager-last-update">
        آخر تذكير: {reminders.latest ? formatArabicDateTime(reminders.latest.created_at) : 'لا يوجد'}
      </p>
      <div className="follow-up-action-buttons">
        <button className="secondary-button" type="button" onClick={() => open('reminder')} disabled={organizations.length === 0 || busy}>
          إرسال تذكير
        </button>
        <button className="secondary-button" type="button" onClick={() => open('employee_direction')} disabled={assignedEmployees.length === 0 || busy}>
          توجيه الموظف
        </button>
      </div>
      <p className="manager-last-update">التذكير يسجل داخل المنصة فقط ولا يرسل بريدًا فعليًا.</p>

      {openForm ? (
        <div className="follow-up-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
          <section className="follow-up-modal" role="dialog" aria-modal="true" aria-labelledby="follow-up-dialog-title">
            <div className="manager-section__header">
              <h2 id="follow-up-dialog-title">{openForm === 'reminder' ? 'إرسال تذكير' : 'توجيه الموظف'}</h2>
              <button className="text-button" type="button" onClick={closeForm}>إغلاق</button>
            </div>
            {openForm === 'reminder' ? (
              <>
                <label>الجهة المستهدفة
                  <select value={targetOrganizationId} onChange={(event) => setTargetOrganizationId(event.target.value)} required>
                    {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.organization_name_ar}</option>)}
                  </select>
                </label>
                <label>عنوان التذكير
                  <input value={title} onChange={(event) => setTitle(event.target.value)} required />
                </label>
              </>
            ) : (
              <>
                <label>الموظف المستهدف
                  <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} required>
                    {assignedEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                </label>
                <label>الأولوية
                  <select value={priority} onChange={(event) => setPriority(event.target.value as FinancialControlFollowUpPriority)}>
                    <option value="normal">عادية</option>
                    <option value="urgent">عاجلة</option>
                  </select>
                </label>
              </>
            )}
            <label>{openForm === 'reminder' ? 'نص مختصر' : 'نص التوجيه'}
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} required />
            </label>
            <label>{openForm === 'reminder' ? 'تاريخ المتابعة القادمة' : 'الموعد المطلوب'}
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required />
            </label>
            <button className="primary-button" type="button" onClick={() => void submit()} disabled={submitDisabled}>
              {busy ? 'جاري الحفظ...' : openForm === 'reminder' ? 'تسجيل التذكير' : 'حفظ التوجيه'}
            </button>
          </section>
        </div>
      ) : null}
    </section>
  )
}
