import { useState, type FormEvent } from 'react'
import { Icon } from '../../components/layout/Header'
import {
  changePlatformModuleStatus,
  createPlatformModule,
  PlatformModuleConflictError,
  updatePlatformModule,
} from '../../services/platformAdminService'
import type { PlatformModule, PlatformModuleStatus } from '../../types/platformAdmin'
import {
  moduleStatusActionLabel,
  nextModuleStatus,
  platformModuleStatusLabels,
  validateModuleCode,
  validateModuleName,
  validateModuleStatusChange,
} from './platformModulesModel'

interface PlatformModulesSectionProps {
  modules: PlatformModule[]
  onReload: () => Promise<void>
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; module: PlatformModule }
  | null

function formatArabicDate(value: string) {
  if (!value) return 'غير متاح'
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusClass(status: PlatformModuleStatus) {
  if (status === 'active') return 'success'
  if (status === 'disabled') return 'danger'
  return 'muted'
}

export function PlatformModulesSection({ modules, onReload }: PlatformModulesSectionProps) {
  const [editor, setEditor] = useState<EditorState>(null)
  const [nameAr, setNameAr] = useState('')
  const [moduleCode, setModuleCode] = useState('')
  const [description, setDescription] = useState('')
  const [disabledModule, setDisabledModule] = useState<PlatformModule | null>(null)
  const [disabledReason, setDisabledReason] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function openCreate() {
    setEditor({ mode: 'create' })
    setNameAr('')
    setModuleCode('')
    setDescription('')
    setFieldErrors({})
    setFeedback(null)
  }

  function openEdit(module: PlatformModule) {
    setEditor({ mode: 'edit', module })
    setNameAr(module.moduleNameAr)
    setModuleCode(module.moduleCode)
    setDescription(module.description ?? '')
    setFieldErrors({})
    setFeedback(null)
  }

  async function handleConflict(error: unknown) {
    if (!(error instanceof PlatformModuleConflictError)) return false
    setFeedback({ type: 'error', message: error.message })
    setEditor(null)
    setDisabledModule(null)
    await onReload()
    return true
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return

    const errors: Record<string, string> = {}
    const nameError = validateModuleName(nameAr)
    if (nameError) errors.nameAr = nameError
    if (editor.mode === 'create') {
      const codeError = validateModuleCode(moduleCode)
      if (codeError) errors.moduleCode = codeError
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const operationId = editor.mode === 'create' ? 'create' : editor.module.id
    setBusyId(operationId)
    setFeedback(null)
    try {
      if (editor.mode === 'create') {
        await createPlatformModule({ moduleCode, moduleNameAr: nameAr, description })
        setFeedback({ type: 'success', message: 'تم إنشاء الموديل كمسودة بنجاح.' })
      } else {
        await updatePlatformModule({
          moduleId: editor.module.id,
          moduleCode: editor.module.moduleCode,
          moduleNameAr: nameAr,
          description,
          expectedLockVersion: editor.module.lockVersion,
        })
        setFeedback({ type: 'success', message: 'تم تحديث بيانات الموديل بنجاح.' })
      }
      setEditor(null)
      await onReload()
    } catch (error) {
      if (!await handleConflict(error)) {
        setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذّر حفظ الموديل.' })
      }
    } finally {
      setBusyId(null)
    }
  }

  async function changeStatus(module: PlatformModule, newStatus: PlatformModuleStatus, reason = '') {
    const validationError = validateModuleStatusChange(module.moduleStatus, newStatus, reason)
    if (validationError) {
      setFeedback({ type: 'error', message: validationError })
      return
    }

    const action = newStatus === 'disabled' ? 'تعطيل' : 'تفعيل'
    if (!window.confirm(`هل تريد ${action} الموديل «${module.moduleNameAr}»؟`)) return

    setBusyId(module.id)
    setFeedback(null)
    try {
      await changePlatformModuleStatus({
        moduleId: module.id,
        newStatus,
        disabledReason: reason,
        expectedLockVersion: module.lockVersion,
      })
      setDisabledModule(null)
      setDisabledReason('')
      setFeedback({ type: 'success', message: `تم ${action} الموديل بنجاح.` })
      await onReload()
    } catch (error) {
      if (!await handleConflict(error)) {
        setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذّر تغيير حالة الموديل.' })
      }
    } finally {
      setBusyId(null)
    }
  }

  function requestStatusChange(module: PlatformModule) {
    const nextStatus = nextModuleStatus(module.moduleStatus)
    if (!nextStatus) return
    if (nextStatus === 'disabled') {
      setDisabledModule(module)
      setDisabledReason('')
      setFieldErrors({})
      return
    }
    void changeStatus(module, nextStatus)
  }

  function submitDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!disabledModule) return
    const error = validateModuleStatusChange(disabledModule.moduleStatus, 'disabled', disabledReason)
    if (error) {
      setFieldErrors({ disabledReason: error })
      return
    }
    void changeStatus(disabledModule, 'disabled', disabledReason)
  }

  return (
    <section className="platform-modules-panel" aria-labelledby="platform-modules-title">
      <div className="platform-modules-header">
        <div>
          <span className="eyebrow">سجل الموديلات</span>
          <h2 id="platform-modules-title">إدارة الموديلات</h2>
          <p>إنشاء الموديلات كمسودات وإدارة بياناتها وحالتها دون حذف أو ربط تلقائي بمساحات العمل.</p>
        </div>
        <button className="primary-button" type="button" onClick={openCreate} disabled={busyId !== null}>
          <Icon name="settings" size={18} /> إنشاء موديل جديد
        </button>
      </div>

      {feedback ? (
        <div className={`platform-modules-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </div>
      ) : null}

      {modules.length === 0 ? (
        <div className="platform-modules-empty">
          <Icon name="settings" size={30} />
          <h3>لا توجد موديلات مسجلة حتى الآن</h3>
          <p>يمكن لمالك النظام إنشاء أول موديل كمسودة من الزر أعلاه.</p>
        </div>
      ) : (
        <div className="platform-modules-table-wrap">
          <table className="platform-modules-table">
            <thead>
              <tr>
                <th>الموديل</th>
                <th>الوصف</th>
                <th>الحالة</th>
                <th>تاريخ الإنشاء</th>
                <th>آخر تحديث</th>
                <th>lock_version</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.id}>
                  <td><strong>{module.moduleNameAr}</strong><code>{module.moduleCode}</code></td>
                  <td>{module.description || 'لا يوجد وصف'}</td>
                  <td>
                    <span className={`status ${statusClass(module.moduleStatus)}`}>
                      {platformModuleStatusLabels[module.moduleStatus]}
                    </span>
                    {module.moduleStatus === 'disabled' && module.disabledReason ? <small>{module.disabledReason}</small> : null}
                  </td>
                  <td>{formatArabicDate(module.createdAt)}</td>
                  <td>{formatArabicDate(module.updatedAt)}</td>
                  <td><span className="platform-module-version">{module.lockVersion}</span></td>
                  <td>
                    <div className="platform-module-actions">
                      <button className="secondary-button" type="button" onClick={() => openEdit(module)} disabled={busyId !== null}>تعديل</button>
                      <button className="secondary-button" type="button" onClick={() => requestStatusChange(module)} disabled={busyId !== null}>
                        {busyId === module.id ? 'جاري التنفيذ...' : moduleStatusActionLabel(module.moduleStatus)}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor ? (
        <div className="platform-admin-modal-backdrop" role="presentation">
          <div className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="module-editor-title">
            <div className="platform-admin-modal-heading">
              <div>
                <h2 id="module-editor-title">{editor.mode === 'create' ? 'إنشاء موديل جديد' : 'تحديث الموديل'}</h2>
                <p>{editor.mode === 'create' ? 'سيُنشأ الموديل بالحالة «مسودة» تلقائيًا.' : 'يمكن تعديل الاسم والوصف فقط.'}</p>
              </div>
              <button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setEditor(null)} disabled={busyId !== null}>×</button>
            </div>
            <form className="platform-module-form" onSubmit={submitEditor} noValidate>
              <label>
                <span>الاسم العربي <b>*</b></span>
                <input value={nameAr} onChange={(event) => setNameAr(event.target.value)} aria-invalid={Boolean(fieldErrors.nameAr)} />
                {fieldErrors.nameAr ? <small className="field-error">{fieldErrors.nameAr}</small> : null}
              </label>
              <label>
                <span>الرمز <b>*</b></span>
                <input dir="ltr" value={moduleCode} onChange={(event) => setModuleCode(event.target.value)} readOnly={editor.mode === 'edit'} aria-invalid={Boolean(fieldErrors.moduleCode)} />
                {editor.mode === 'edit' ? <small>الرمز ثابت ولا يمكن تغييره بعد الإنشاء.</small> : null}
                {fieldErrors.moduleCode ? <small className="field-error">{fieldErrors.moduleCode}</small> : null}
              </label>
              <label>
                <span>الوصف</span>
                <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
              </label>
              <div className="platform-admin-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setEditor(null)} disabled={busyId !== null}>إلغاء</button>
                <button className="primary-button" type="submit" disabled={busyId !== null}>{busyId ? 'جاري الحفظ...' : 'حفظ'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {disabledModule ? (
        <div className="platform-admin-modal-backdrop" role="presentation">
          <div className="platform-admin-modal platform-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="disable-module-title">
            <div className="platform-admin-modal-heading">
              <div>
                <h2 id="disable-module-title">تعطيل الموديل</h2>
                <p>أدخل سبب تعطيل «{disabledModule.moduleNameAr}» قبل المتابعة.</p>
              </div>
            </div>
            <form className="platform-module-form" onSubmit={submitDisable} noValidate>
              <label>
                <span>سبب التعطيل <b>*</b></span>
                <textarea rows={4} value={disabledReason} onChange={(event) => setDisabledReason(event.target.value)} aria-invalid={Boolean(fieldErrors.disabledReason)} />
                {fieldErrors.disabledReason ? <small className="field-error">{fieldErrors.disabledReason}</small> : null}
              </label>
              <div className="platform-admin-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setDisabledModule(null)} disabled={busyId !== null}>إلغاء</button>
                <button className="primary-button platform-danger-button" type="submit" disabled={busyId !== null}>{busyId ? 'جاري التعطيل...' : 'تعطيل الموديل'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
