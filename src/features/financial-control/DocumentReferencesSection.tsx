import { useEffect, useState } from 'react'
import {
  addDocumentReference,
  decideDocumentReference,
  deleteDocumentReference,
  updateDocumentReference,
} from '../../services/financialControlService'
import type {
  CorrectiveActionDocumentReference,
  DocumentReferenceFieldsInput,
  DocumentStorageLocation,
  FinancialControlCorrectiveAction,
  FinancialControlFindingStatus,
  FinancialControlRole,
} from '../../types/financialControl'
import { formatArabicDate, formatArabicDateTime } from './dateFormat'

interface DocumentReferencesSectionProps {
  action: FinancialControlCorrectiveAction
  findingStatus: FinancialControlFindingStatus
  roles: FinancialControlRole[]
  currentUserId: string | null
  busy: boolean
  onRun: (key: string, successMessage: string, operation: () => Promise<void>) => Promise<boolean>
  compact?: boolean
  openAddRequest?: number
  expandRequest?: number
}

type ReferenceForm = Omit<DocumentReferenceFieldsInput, 'correctiveActionId'>

const statusLabels = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
} as const

const storageLabels: Record<DocumentStorageLocation, string> = {
  share_folder: 'مجلد مشترك',
  official_email: 'البريد الرسمي',
  internal_system: 'نظام داخلي',
  other: 'أخرى',
}

const editableFindingStatuses: FinancialControlFindingStatus[] = [
  'imported_pending_review',
  'not_started',
  'in_progress',
  'returned_for_revision',
  'reopened',
]

const controlStyle = {
  width: '100%',
  minHeight: 44,
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: '#fff',
  color: '#17324d',
  padding: '0 12px',
  font: 'inherit',
} as const

function localDateValue() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function emptyForm(): ReferenceForm {
  return {
    documentNumber: '',
    documentName: '',
    documentType: '',
    documentDate: localDateValue(),
    issuingEntity: '',
    storageLocation: 'official_email',
    locationReference: '',
    description: '',
  }
}

function formFromReference(reference: CorrectiveActionDocumentReference): ReferenceForm {
  return {
    documentNumber: reference.document_number,
    documentName: reference.document_name,
    documentType: reference.document_type,
    documentDate: reference.document_date,
    issuingEntity: reference.issuing_entity,
    storageLocation: reference.storage_location,
    locationReference: reference.location_reference,
    description: reference.description ?? '',
  }
}

function isWebLink(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function DocumentReferencesSection({
  action,
  findingStatus,
  roles,
  currentUserId,
  busy,
  onRun,
  compact = false,
  openAddRequest = 0,
  expandRequest = 0,
}: DocumentReferencesSectionProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CorrectiveActionDocumentReference | null>(null)
  const [form, setForm] = useState<ReferenceForm>(emptyForm)
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(!compact)
  const assignedEmployee = roles.includes('action_owner') && action.responsible_user_id === currentUserId
  const employeeCanManage = assignedEmployee && editableFindingStatuses.includes(findingStatus)
  const managerCanDecide = (roles.includes('manager') || roles.includes('owner'))
    && findingStatus === 'under_manager_review'

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  useEffect(() => {
    if (openAddRequest > 0 && employeeCanManage) {
      setExpanded(true)
      openAdd()
    }
  // openAddRequest is an explicit one-shot signal from the simplified guide.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAddRequest])

  useEffect(() => {
    if (expandRequest > 0) setExpanded(true)
  }, [expandRequest])

  const openEdit = (reference: CorrectiveActionDocumentReference) => {
    setEditing(reference)
    setForm(formFromReference(reference))
    setFormOpen(true)
  }

  const save = async () => {
    const operation = editing
      ? async () => {
          await updateDocumentReference({
            correctiveActionId: action.id,
            documentReferenceId: editing.id,
            expectedLockVersion: editing.lock_version,
            ...form,
          })
        }
      : async () => {
          await addDocumentReference({ correctiveActionId: action.id, ...form })
        }
    const succeeded = await onRun(
      `document-reference-${editing?.id ?? action.id}`,
      editing ? 'تم تعديل المستند المرجعي بنجاح.' : 'تمت إضافة المستند المرجعي بنجاح.',
      operation,
    )
    if (succeeded) {
      setFormOpen(false)
      setEditing(null)
    }
  }

  const remove = async (reference: CorrectiveActionDocumentReference) => {
    if (deleteTarget !== reference.id) {
      setDeleteTarget(reference.id)
      return
    }
    const succeeded = await onRun(
      `document-reference-${reference.id}`,
      'تم حذف المستند المرجعي بنجاح.',
      () => deleteDocumentReference({
        documentReferenceId: reference.id,
        expectedLockVersion: reference.lock_version,
      }),
    )
    if (succeeded) setDeleteTarget(null)
  }

  const decide = async (reference: CorrectiveActionDocumentReference, decision: 'approved' | 'rejected') => {
    const note = decisionNotes[reference.id] ?? ''
    await onRun(
      `document-reference-${reference.id}`,
      decision === 'approved' ? 'تم اعتماد المستند المرجعي.' : 'تم رفض المستند المرجعي وإرسال السبب للموظف.',
      () => decideDocumentReference({
        documentReferenceId: reference.id,
        decision,
        decisionNote: note,
        expectedLockVersion: reference.lock_version,
      }),
    )
  }

  const requiredComplete = form.documentNumber.trim()
    && form.documentName.trim()
    && form.documentType.trim()
    && form.documentDate
    && form.issuingEntity.trim()
    && form.locationReference.trim()

  return (
    <section aria-label="المستندات المرجعية" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>المستندات المرجعية</h3>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>عدد المستندات: {action.document_references.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {compact ? (
            <button className="secondary-button" type="button" onClick={() => setExpanded((current) => !current)}>
              {expanded ? 'إخفاء التفاصيل' : 'عرض المستندات'}
            </button>
          ) : null}
          {employeeCanManage ? (
            <button className="secondary-button" type="button" onClick={() => { setExpanded(true); openAdd() }} disabled={busy || formOpen}>
              إضافة مستند مرجعي
            </button>
          ) : null}
        </div>
      </div>

      {expanded && formOpen ? (
        <div className="detail-card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>{editing ? 'تعديل المستند المرجعي' : 'إضافة مستند مرجعي'}</strong>
            <button className="secondary-button" type="button" onClick={() => setFormOpen(false)} disabled={busy}>إغلاق</button>
          </div>
          <label>رقم المستند<input aria-label="رقم المستند" value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} style={controlStyle}/></label>
          <label>اسم المستند<input aria-label="اسم المستند" value={form.documentName} onChange={(event) => setForm({ ...form, documentName: event.target.value })} style={controlStyle}/></label>
          <label>النوع<input aria-label="نوع المستند" value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })} style={controlStyle}/></label>
          <label>التاريخ<input aria-label="تاريخ المستند" type="date" value={form.documentDate} onChange={(event) => setForm({ ...form, documentDate: event.target.value })} style={controlStyle}/></label>
          <label>الجهة المصدرة<input aria-label="الجهة المصدرة" value={form.issuingEntity} onChange={(event) => setForm({ ...form, issuingEntity: event.target.value })} style={controlStyle}/></label>
          <label>موقع الحفظ<select aria-label="موقع الحفظ" value={form.storageLocation} onChange={(event) => setForm({ ...form, storageLocation: event.target.value as DocumentStorageLocation })} style={controlStyle}>
            {Object.entries(storageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>المسار أو المرجع<input aria-label="المسار أو المرجع" value={form.locationReference} onChange={(event) => setForm({ ...form, locationReference: event.target.value })} style={controlStyle}/></label>
          <label>الوصف<textarea aria-label="وصف المستند" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} style={{ ...controlStyle, minHeight: 88, padding: 12, resize: 'vertical' }}/></label>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13 }}>يسجل هذا النموذج مرجع المستند فقط؛ لا يتم رفع أي ملف أو تخزين محتوى حساس.</p>
          <button className="primary-button" type="button" onClick={() => void save()} disabled={busy || !requiredComplete}>
            {busy ? 'جاري الحفظ...' : editing ? 'حفظ التعديل' : 'حفظ المستند المرجعي'}
          </button>
        </div>
      ) : null}

      {expanded && action.document_references.length > 0 ? action.document_references.map((reference) => (
        <article key={reference.id} className="detail-card" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong>{reference.document_name}</strong>
            <span className={`status ${reference.manager_verification_status === 'approved' ? 'success' : reference.manager_verification_status === 'rejected' ? 'danger' : ''}`}>
              {statusLabels[reference.manager_verification_status]}
            </span>
          </div>
          <div className="detail-item"><span>رقم المستند</span><strong>{reference.document_number}</strong></div>
          <div className="detail-item"><span>النوع</span><strong>{reference.document_type}</strong></div>
          <div className="detail-item"><span>التاريخ</span><strong>{formatArabicDate(reference.document_date)}</strong></div>
          <div className="detail-item"><span>الجهة المصدرة</span><strong>{reference.issuing_entity}</strong></div>
          <div className="detail-item"><span>موقع الحفظ</span><strong>{storageLabels[reference.storage_location]}</strong></div>
          <div className="detail-item"><span>المسار أو المرجع</span><strong style={{ overflowWrap: 'anywhere' }}>{reference.location_reference}</strong></div>
          <div className="detail-item"><span>الوصف</span><strong>{reference.description || 'لا يوجد'}</strong></div>
          <div className="detail-item"><span>قرار المدير وملاحظته</span><strong>{reference.manager_decision_note || (reference.manager_verification_status === 'pending' ? 'بانتظار القرار' : 'لا توجد ملاحظة')}</strong></div>
          {reference.manager_verified_at ? <div className="detail-item"><span>تاريخ القرار</span><strong>{formatArabicDateTime(reference.manager_verified_at)}</strong></div> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isWebLink(reference.location_reference) ? (
              <a className="secondary-button" href={reference.location_reference} target="_blank" rel="noreferrer">فتح الموقع</a>
            ) : (
              <button className="secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(reference.location_reference)}>نسخ المسار</button>
            )}
            {employeeCanManage ? <button className="secondary-button" type="button" onClick={() => openEdit(reference)} disabled={busy}>تعديل</button> : null}
            {employeeCanManage ? (
              <button className="secondary-button" type="button" onClick={() => void remove(reference)} disabled={busy}>
                {deleteTarget === reference.id ? 'تأكيد الحذف' : 'حذف'}
              </button>
            ) : null}
          </div>
          {managerCanDecide ? (
            <div style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <textarea
                aria-label={`ملاحظة قرار المدير للمستند ${reference.document_number}`}
                value={decisionNotes[reference.id] ?? ''}
                onChange={(event) => setDecisionNotes((current) => ({ ...current, [reference.id]: event.target.value }))}
                placeholder="سبب الرفض إلزامي، وملاحظة الاعتماد اختيارية"
                rows={3}
                style={{ ...controlStyle, minHeight: 88, padding: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="primary-button" type="button" disabled={busy} onClick={() => void decide(reference, 'approved')}>اعتماد المرجع</button>
                <button className="secondary-button" type="button" disabled={busy || !(decisionNotes[reference.id] ?? '').trim()} onClick={() => void decide(reference, 'rejected')}>رفض المرجع</button>
              </div>
            </div>
          ) : null}
        </article>
      )) : expanded ? (
        <p style={{ color: 'var(--muted)', margin: 0 }}>لا توجد مستندات مرجعية مسجلة لهذا الإجراء.</p>
      ) : null}
    </section>
  )
}
