import { useMemo, useState } from 'react'
import {
  addFollowUpComment,
  recordOfficialReply,
  recordSentEmail,
  transitionFinancialControlFinding,
  updateCorrectiveActionProgress,
} from '../../services/financialControlService'
import type {
  FinancialControlFinding,
  FinancialControlRole,
} from '../../types/financialControl'
import { formatArabicDate } from './dateFormat'

export type FindingUpdateKind = 'sent_email' | 'official_reply' | 'progress' | 'follow_up' | 'manager_review'

interface FindingUpdatePanelProps {
  finding: FinancialControlFinding
  roles: FinancialControlRole[]
  busy: boolean
  initialKind?: FindingUpdateKind
  triggerLabel?: string
  triggerClassName?: 'primary-button' | 'secondary-button'
  showKindSelector?: boolean
  onRun: (key: string, successMessage: string, operation: () => Promise<void>) => Promise<boolean>
}

const updateKinds: Array<{ value: FindingUpdateKind; label: string }> = [
  { value: 'sent_email', label: 'إرسال بريد رسمي' },
  { value: 'official_reply', label: 'تسجيل رد رسمي' },
  { value: 'progress', label: 'تحديث نسبة الإنجاز' },
  { value: 'follow_up', label: 'إضافة ملاحظة متابعة' },
  { value: 'manager_review', label: 'رفع الملاحظة للمدير' },
]

const fieldStyle = {
  width: '100%',
  minHeight: 44,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: '#fff',
  color: '#17324d',
  padding: '10px 12px',
  font: 'inherit',
} as const

function today() {
  return new Date().toISOString().slice(0, 10)
}

function eventTimestamp(date: string) {
  return `${date}T12:00:00+03:00`
}

export function FindingUpdatePanel({
  finding,
  roles,
  busy,
  initialKind = 'sent_email',
  triggerLabel = 'إضافة تحديث',
  triggerClassName = 'primary-button',
  showKindSelector = true,
  onRun,
}: FindingUpdatePanelProps) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FindingUpdateKind>(initialKind)
  const [date, setDate] = useState(today())
  const [party, setParty] = useState('')
  const [subject, setSubject] = useState('')
  const [reference, setReference] = useState('')
  const [text, setText] = useState('')
  const [obstacles, setObstacles] = useState('')
  const [progress, setProgress] = useState(String(finding.corrective_actions[0]?.progress_percent ?? 0))
  const [actionId, setActionId] = useState(finding.corrective_actions[0]?.id ?? '')

  const canEdit = roles.some((role) => ['owner', 'manager', 'specialist', 'action_owner'].includes(role))
  const canRaiseToManager = roles.some((role) => role === 'owner' || role === 'specialist')
    && ['in_progress', 'returned_for_revision'].includes(finding.workflow_status)
  const selectedAction = useMemo(
    () => finding.corrective_actions.find((action) => action.id === actionId) ?? null,
    [actionId, finding.corrective_actions],
  )

  if (!canEdit) return null

  const resetAndClose = () => {
    setOpen(false)
    setParty('')
    setSubject('')
    setReference('')
    setText('')
    setObstacles('')
    setDate(today())
    setKind(initialKind)
  }

  const openPanel = () => {
    setKind(initialKind)
    setOpen(true)
  }

  const submit = async () => {
    let operation: (() => Promise<void>) | null = null
    let successMessage = ''

    if (kind === 'sent_email' && party.trim() && subject.trim() && reference.trim() && text.trim()) {
      operation = () => recordSentEmail({
        workspaceId: finding.workspace_id,
        findingId: finding.id,
        sentAt: eventTimestamp(date),
        recipient: party,
        subject,
        reference,
        summary: text,
      })
      successMessage = 'تم تسجيل البريد الرسمي المرسل.'
    }

    if (kind === 'official_reply' && party.trim() && reference.trim() && text.trim()) {
      operation = () => recordOfficialReply({
        workspaceId: finding.workspace_id,
        findingId: finding.id,
        repliedAt: eventTimestamp(date),
        sender: party,
        reference,
        replyText: text,
      })
      successMessage = 'تم تسجيل الرد الرسمي.'
    }

    if (kind === 'progress' && selectedAction && text.trim()) {
      const progressPercent = Number(progress)
      const executionDetails = obstacles.trim()
        ? `وصف التقدم: ${text.trim()}\nالعوائق: ${obstacles.trim()}`
        : `وصف التقدم: ${text.trim()}\nالعوائق: لا توجد عوائق مسجلة.`
      operation = () => updateCorrectiveActionProgress({
        correctiveActionId: selectedAction.id,
        progressPercent,
        executionDetails,
        expectedLockVersion: selectedAction.lock_version,
      })
      successMessage = 'تم تحديث نسبة الإنجاز والتقدم.'
    }

    if (kind === 'follow_up' && text.trim()) {
      operation = () => addFollowUpComment({
        workspaceId: finding.workspace_id,
        findingId: finding.id,
        activityDate: eventTimestamp(date),
        body: text,
      })
      successMessage = 'تمت إضافة ملاحظة المتابعة.'
    }

    if (kind === 'manager_review' && canRaiseToManager && text.trim() && obstacles.trim()) {
      operation = () => transitionFinancialControlFinding({
        findingId: finding.id,
        toStatus: 'submitted_for_manager_review',
        reason: `ملخص الموظف: ${text.trim()}\nسبب الرفع: ${obstacles.trim()}`,
        expectedLockVersion: finding.lock_version,
      })
      successMessage = 'تم رفع الملاحظة للمدير عبر مسار الاعتماد.'
    }

    if (!operation) return
    if (await onRun(`finding-update-${finding.id}`, successMessage, operation)) resetAndClose()
  }

  if (!open) {
    return (
      <button className={triggerClassName} type="button" onClick={openPanel} data-testid="add-finding-update">
        {triggerLabel}
      </button>
    )
  }

  const isValid = kind === 'sent_email'
    ? Boolean(date && party.trim() && subject.trim() && reference.trim() && text.trim())
    : kind === 'official_reply'
      ? Boolean(date && party.trim() && reference.trim() && text.trim())
      : kind === 'progress'
        ? Boolean(selectedAction && text.trim() && Number(progress) >= 0 && Number(progress) <= 100)
        : kind === 'follow_up'
          ? Boolean(date && text.trim())
          : Boolean(canRaiseToManager && text.trim() && obstacles.trim())

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(10, 28, 45, 0.58)', display: 'grid', placeItems: 'center', padding: 18 }}
    >
      <section
        className="panel"
        data-testid="finding-update-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finding-update-title"
        style={{ display: 'grid', gap: 14, width: 'min(680px, 100%)', maxHeight: 'calc(100vh - 36px)', overflowY: 'auto', boxShadow: '0 24px 70px rgba(8, 28, 45, 0.28)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <span className="eyebrow">تحديث تشغيلي</span>
            <h2 id="finding-update-title" style={{ margin: '4px 0 0' }}>إضافة تحديث</h2>
          </div>
          <button className="secondary-button" type="button" onClick={resetAndClose} disabled={busy}>إلغاء</button>
        </div>

        {showKindSelector ? (
          <label>
            <span>نوع التحديث</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as FindingUpdateKind)} style={fieldStyle}>
              {updateKinds.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
        ) : null}

        {(kind === 'sent_email' || kind === 'official_reply' || kind === 'follow_up') ? (
          <label>
            <span>
              {kind === 'official_reply' ? 'تاريخ الرد' : kind === 'sent_email' ? 'تاريخ الإرسال' : 'التاريخ'}
              {' — '}{formatArabicDate(date)}
            </span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={fieldStyle}/>
          </label>
        ) : null}

      {(kind === 'sent_email' || kind === 'official_reply') ? (
        <label><span>{kind === 'sent_email' ? 'الجهة المرسل إليها' : 'الجهة المرسلة'}</span><input value={party} onChange={(event) => setParty(event.target.value)} style={fieldStyle}/></label>
      ) : null}

      {kind === 'sent_email' ? (
        <label><span>موضوع البريد</span><input value={subject} onChange={(event) => setSubject(event.target.value)} style={fieldStyle}/></label>
      ) : null}

      {(kind === 'sent_email' || kind === 'official_reply') ? (
        <label><span>مرجع البريد أو رقم المعاملة</span><input value={reference} onChange={(event) => setReference(event.target.value)} style={fieldStyle}/></label>
      ) : null}

      {kind === 'progress' ? (
        <>
          <label>
            <span>الإجراء التصحيحي</span>
            <select value={actionId} onChange={(event) => {
              const nextId = event.target.value
              const nextAction = finding.corrective_actions.find((action) => action.id === nextId)
              setActionId(nextId)
              setProgress(String(nextAction?.progress_percent ?? 0))
            }} style={fieldStyle}>
              {finding.corrective_actions.map((action) => <option value={action.id} key={action.id}>الإجراء {action.action_no}</option>)}
            </select>
          </label>
          <label><span>النسبة من 0 إلى 100</span><input type="number" min="0" max="100" value={progress} onChange={(event) => setProgress(event.target.value)} style={fieldStyle}/></label>
        </>
      ) : null}

      <label>
        <span>{kind === 'sent_email' ? 'ملخص غير حساس' : kind === 'official_reply' ? 'نص الرد المنسوخ' : kind === 'manager_review' ? 'ملخص الموظف' : kind === 'progress' ? 'وصف مختصر للتقدم' : 'نص الملاحظة'}</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} style={{ ...fieldStyle, resize: 'vertical' }}/>
      </label>

      {(kind === 'progress' || kind === 'manager_review') ? (
        <label>
          <span>{kind === 'progress' ? 'العوائق إن وجدت' : 'سبب الرفع'}</span>
          <textarea value={obstacles} onChange={(event) => setObstacles(event.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }}/>
        </label>
      ) : null}

      {kind === 'official_reply' ? (
        <div role="note" style={{ background: '#fff8e7', color: '#7b5b13', borderRadius: 10, padding: 12 }}>
          لا تدخل بيانات سرية أو شخصية حساسة. انسخ فقط النص اللازم لمتابعة الملاحظة.
        </div>
      ) : null}

      {kind === 'manager_review' && !canRaiseToManager ? (
        <div role="alert" style={{ background: '#fff0f0', color: 'var(--danger)', borderRadius: 10, padding: 12 }}>
          لا يمكن رفع الملاحظة للمدير من حالتها الحالية أو بصلاحيتك الحالية.
        </div>
      ) : null}

        <button className="primary-button" type="button" onClick={() => void submit()} disabled={busy || !isValid}>
          {busy ? 'جاري الحفظ...' : 'حفظ التحديث'}
        </button>
      </section>
    </div>
  )
}
