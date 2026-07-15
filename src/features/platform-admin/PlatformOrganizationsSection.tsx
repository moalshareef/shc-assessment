import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/layout/Header'
import {
  changePlatformOrganizationStatus,
  createPlatformOrganization,
  PlatformOrganizationConflictError,
  updatePlatformOrganization,
} from '../../services/platformAdminService'
import type {
  PlatformOrganization,
  PlatformOrganizationStatus,
  PlatformOrganizationType,
} from '../../types/platformAdmin'
import {
  nextOrganizationStatus,
  organizationStatusActionLabel,
  platformOrganizationStatusLabels,
  platformOrganizationTypeLabels,
  validateOrganizationCode,
  validateOrganizationName,
  validateOrganizationStatusChange,
  validateOrganizationType,
} from './platformOrganizationsModel'

interface Props {
  organizations: PlatformOrganization[]
  onReload: () => Promise<void>
}

type Editor = { mode: 'create' } | { mode: 'edit'; organization: PlatformOrganization } | null

function formatArabicDate(value: string) {
  if (!value) return 'غير متاح'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusClass(status: PlatformOrganizationStatus) {
  if (status === 'active') return 'success'
  if (status === 'disabled') return 'danger'
  return 'muted'
}

export function PlatformOrganizationsSection({ organizations, onReload }: Props) {
  const [editor, setEditor] = useState<Editor>(null)
  const [nameAr, setNameAr] = useState('')
  const [code, setCode] = useState('')
  const [type, setType] = useState<PlatformOrganizationType>('secretariat')
  const [description, setDescription] = useState('')
  const [disabledOrganization, setDisabledOrganization] = useState<PlatformOrganization | null>(null)
  const [disabledReason, setDisabledReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function openCreate() {
    setEditor({ mode: 'create' }); setNameAr(''); setCode(''); setType('secretariat'); setDescription('')
    setErrors({}); setFeedback(null)
  }

  function openEdit(organization: PlatformOrganization) {
    setEditor({ mode: 'edit', organization }); setNameAr(organization.organizationNameAr)
    setCode(organization.organizationCode); setType(organization.organizationType)
    setDescription(organization.description ?? ''); setErrors({}); setFeedback(null)
  }

  async function handleConflict(error: unknown) {
    if (!(error instanceof PlatformOrganizationConflictError)) return false
    setFeedback({ type: 'error', message: error.message }); setEditor(null); setDisabledOrganization(null)
    await onReload()
    return true
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const nextErrors: Record<string, string> = {}
    const nameError = validateOrganizationName(nameAr)
    if (nameError) nextErrors.nameAr = nameError
    if (editor.mode === 'create') {
      const codeError = validateOrganizationCode(code)
      if (codeError) nextErrors.code = codeError
    }
    if (!validateOrganizationType(type)) nextErrors.type = 'نوع الجهة غير معتمد.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setBusyId(editor.mode === 'create' ? 'create-organization' : editor.organization.id)
    setFeedback(null)
    try {
      if (editor.mode === 'create') {
        await createPlatformOrganization({ organizationCode: code, organizationNameAr: nameAr, organizationType: type, description })
        setFeedback({ type: 'success', message: 'تم إنشاء الجهة كمسودة بنجاح.' })
      } else {
        await updatePlatformOrganization({
          organizationId: editor.organization.id,
          organizationCode: editor.organization.organizationCode,
          organizationNameAr: nameAr,
          organizationType: type,
          description,
          expectedLockVersion: editor.organization.lockVersion,
        })
        setFeedback({ type: 'success', message: 'تم تحديث بيانات الجهة بنجاح.' })
      }
      setEditor(null)
      await onReload()
    } catch (error) {
      if (!await handleConflict(error)) setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر حفظ الجهة.' })
    } finally {
      setBusyId(null)
    }
  }

  async function changeStatus(organization: PlatformOrganization, newStatus: PlatformOrganizationStatus, reason = '') {
    const validationError = validateOrganizationStatusChange(organization.status, newStatus, reason)
    if (validationError) { setFeedback({ type: 'error', message: validationError }); return }
    const action = newStatus === 'disabled' ? 'تعطيل' : 'تفعيل'
    if (!window.confirm(`هل تريد ${action} الجهة «${organization.organizationNameAr}»؟`)) return
    setBusyId(organization.id); setFeedback(null)
    try {
      await changePlatformOrganizationStatus({
        organizationId: organization.id,
        newStatus,
        disabledReason: reason,
        expectedLockVersion: organization.lockVersion,
      })
      setDisabledOrganization(null); setDisabledReason('')
      setFeedback({ type: 'success', message: `تم ${action} الجهة بنجاح.` })
      await onReload()
    } catch (error) {
      if (!await handleConflict(error)) setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر تغيير حالة الجهة.' })
    } finally {
      setBusyId(null)
    }
  }

  function requestStatusChange(organization: PlatformOrganization) {
    const nextStatus = nextOrganizationStatus(organization.status)
    if (!nextStatus) return
    if (nextStatus === 'disabled') {
      setDisabledOrganization(organization); setDisabledReason(''); setErrors({})
    } else void changeStatus(organization, nextStatus)
  }

  function submitDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!disabledOrganization) return
    const error = validateOrganizationStatusChange(disabledOrganization.status, 'disabled', disabledReason)
    if (error) { setErrors({ disabledReason: error }); return }
    void changeStatus(disabledOrganization, 'disabled', disabledReason)
  }

  return (
    <section className="platform-modules-panel" aria-labelledby="platform-organizations-title">
      <div className="platform-modules-header">
        <div>
          <span className="eyebrow">سجل الجهات</span>
          <h2 id="platform-organizations-title">إدارة الجهات</h2>
          <p>إنشاء الجهات كمسودات وإدارة بياناتها وحالتها دون حذف أو ربط تلقائي بالموديلات أو المستخدمين أو الأقسام.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate} disabled={busyId !== null}>
          <Icon name="workspace" size={18} /> إنشاء جهة جديدة
        </button>
      </div>

      {feedback ? <div className={`platform-modules-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</div> : null}

      {organizations.length === 0 ? (
        <div className="platform-modules-empty">
          <Icon name="workspace" size={30} /><h3>لا توجد جهات مسجلة حتى الآن</h3>
          <p>يمكن لمالك النظام إنشاء أول جهة كمسودة من الزر أعلاه.</p>
        </div>
      ) : (
        <div className="platform-modules-table-wrap">
          <table className="platform-modules-table platform-organizations-table">
            <thead><tr><th>الجهة</th><th>النوع</th><th>الوصف</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>آخر تحديث</th><th>lock_version</th><th>الإجراءات</th></tr></thead>
            <tbody>{organizations.map((organization) => (
              <tr key={organization.id}>
                <td><strong>{organization.organizationNameAr}</strong><code>{organization.organizationCode}</code></td>
                <td>{platformOrganizationTypeLabels[organization.organizationType]}</td>
                <td>{organization.description || 'لا يوجد وصف'}</td>
                <td><span className={`status ${statusClass(organization.status)}`}>{platformOrganizationStatusLabels[organization.status]}</span>{organization.disabledReason ? <small>{organization.disabledReason}</small> : null}</td>
                <td>{formatArabicDate(organization.createdAt)}</td><td>{formatArabicDate(organization.updatedAt)}</td>
                <td><span className="platform-module-version">{organization.lockVersion}</span></td>
                <td><div className="platform-module-actions"><button className="secondary-button" type="button" onClick={() => openEdit(organization)} disabled={busyId !== null}>تعديل</button><button className="secondary-button" type="button" onClick={() => requestStatusChange(organization)} disabled={busyId !== null}>{busyId === organization.id ? 'جاري التنفيذ...' : organizationStatusActionLabel(organization.status)}</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {editor ? (
        <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="organization-editor-title">
          <div className="platform-admin-modal-heading"><div><h2 id="organization-editor-title">{editor.mode === 'create' ? 'إنشاء جهة جديدة' : 'تحديث الجهة'}</h2><p>{editor.mode === 'create' ? 'ستُنشأ الجهة بالحالة «مسودة» تلقائيًا.' : 'يمكن تعديل الاسم والنوع والوصف فقط.'}</p></div><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setEditor(null)} disabled={busyId !== null}>×</button></div>
          <form className="platform-module-form" onSubmit={submitEditor} noValidate>
            <label><span>اسم الجهة بالعربية <b>*</b></span><input value={nameAr} onChange={(event) => setNameAr(event.target.value)} aria-invalid={Boolean(errors.nameAr)} />{errors.nameAr ? <small className="field-error">{errors.nameAr}</small> : null}</label>
            <label><span>رمز الجهة <b>*</b></span><input dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} readOnly={editor.mode === 'edit'} aria-invalid={Boolean(errors.code)} />{editor.mode === 'edit' ? <small>الرمز ثابت ولا يمكن تغييره بعد الإنشاء.</small> : null}{errors.code ? <small className="field-error">{errors.code}</small> : null}</label>
            <label><span>نوع الجهة <b>*</b></span><select value={type} onChange={(event) => setType(event.target.value as PlatformOrganizationType)} aria-invalid={Boolean(errors.type)}>{Object.entries(platformOrganizationTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{errors.type ? <small className="field-error">{errors.type}</small> : null}</label>
            <label><span>الوصف</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setEditor(null)} disabled={busyId !== null}>إلغاء</button><button className="primary-button" type="submit" disabled={busyId !== null}>{busyId ? 'جاري الحفظ...' : 'حفظ'}</button></div>
          </form>
        </div></div>
      ) : null}

      {disabledOrganization ? (
        <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal platform-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="disable-organization-title">
          <div className="platform-admin-modal-heading"><div><h2 id="disable-organization-title">تعطيل الجهة</h2><p>أدخل سبب تعطيل «{disabledOrganization.organizationNameAr}» قبل المتابعة.</p></div></div>
          <form className="platform-module-form" onSubmit={submitDisable} noValidate><label><span>سبب التعطيل <b>*</b></span><textarea rows={4} value={disabledReason} onChange={(event) => setDisabledReason(event.target.value)} aria-invalid={Boolean(errors.disabledReason)} />{errors.disabledReason ? <small className="field-error">{errors.disabledReason}</small> : null}</label><div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setDisabledOrganization(null)} disabled={busyId !== null}>إلغاء</button><button className="primary-button platform-danger-button" type="submit" disabled={busyId !== null}>{busyId ? 'جاري التعطيل...' : 'تعطيل الجهة'}</button></div></form>
        </div></div>
      ) : null}
    </section>
  )
}
