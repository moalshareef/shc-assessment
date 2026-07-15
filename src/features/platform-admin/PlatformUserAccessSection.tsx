import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { listPlatformUsers } from '../../services/platformUserAdminService'
import {
  grantPlatformUserAccess,
  listOperationalWorkspaces,
  listPlatformUserAccess,
  PlatformUserAccessConflictError,
  revokePlatformUserAccess,
  updatePlatformUserAccess,
} from '../../services/platformUserAccessService'
import type { PlatformOrganization } from '../../types/platformAdmin'
import type { PlatformAdminUser } from '../../types/platformUserAdmin'
import type { OperationalAccessScope, OperationalRoleCode, OperationalWorkspace, PlatformUserAccess } from '../../types/platformUserAccess'
import { operationalRoleLabels, operationalScopeLabels, validateAccessForm } from './platformUserAccessModel'

interface Props { organizations: PlatformOrganization[] }
type Feedback = { type: 'success' | 'error'; message: string }

const statusLabels = { scheduled: 'مجدولة', active: 'فعالة', expired: 'منتهية', revoked: 'مسحوبة' }

function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIso(value: string) { return value ? new Date(value).toISOString() : '' }
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'غير محدد'
}

export function PlatformUserAccessSection({ organizations }: Props) {
  const [accessRows, setAccessRows] = useState<PlatformUserAccess[]>([])
  const [users, setUsers] = useState<PlatformAdminUser[]>([])
  const [workspaces, setWorkspaces] = useState<OperationalWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<PlatformUserAccess | 'new' | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<PlatformUserAccess | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [userId, setUserId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [roleCode, setRoleCode] = useState<OperationalRoleCode>('financial_control_employee')
  const [accessScope, setAccessScope] = useState<OperationalAccessScope>('assigned_records')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const activeOrganizations = organizations.filter((organization) => organization.status === 'active')
  const activeUsers = useMemo(() => users.filter((user) => user.profileStatus === 'active'), [users])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextAccess, nextUsers, nextWorkspaces] = await Promise.all([
        listPlatformUserAccess(), listPlatformUsers(), listOperationalWorkspaces(),
      ])
      setAccessRows(nextAccess); setUsers(nextUsers); setWorkspaces(nextWorkspaces)
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر تحميل الصلاحيات التشغيلية.' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditor('new'); setUserId(''); setOrganizationId(''); setWorkspaceId(workspaces[0]?.id ?? '')
    setRoleCode('financial_control_employee'); setAccessScope('assigned_records')
    setStartsAt(toLocalInput(new Date().toISOString())); setEndsAt(''); setErrors({}); setFeedback(null)
  }

  function openEdit(row: PlatformUserAccess) {
    setEditor(row); setUserId(row.userId); setOrganizationId(row.organizationId); setWorkspaceId(row.workspaceId)
    setRoleCode(row.roleCode); setAccessScope(row.accessScope); setStartsAt(toLocalInput(row.startsAt)); setEndsAt(toLocalInput(row.endsAt)); setErrors({}); setFeedback(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validateAccessForm({ userId, organizationId, workspaceId, roleCode, accessScope, startsAt, endsAt })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusy(true); setFeedback(null)
    try {
      if (editor === 'new') {
        await grantPlatformUserAccess({ userId, organizationId, workspaceId, roleCode, accessScope, startsAt: toIso(startsAt), endsAt: toIso(endsAt) })
        setFeedback({ type: 'success', message: 'تم منح الصلاحية التشغيلية وتسجيل العملية في سجل التدقيق.' })
      } else if (editor) {
        await updatePlatformUserAccess({ accessId: editor.id, roleCode, accessScope, startsAt: toIso(startsAt), endsAt: toIso(endsAt), expectedLockVersion: editor.lockVersion })
        setFeedback({ type: 'success', message: 'تم تحديث الصلاحية التشغيلية.' })
      }
      setEditor(null); await load()
    } catch (error) {
      if (error instanceof PlatformUserAccessConflictError) { setEditor(null); await load() }
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر حفظ الصلاحية.' })
    } finally { setBusy(false) }
  }

  async function revoke(event: FormEvent) {
    event.preventDefault()
    if (!revokeTarget) return
    if (!revokeReason.trim()) { setErrors({ revokeReason: 'سبب السحب إلزامي.' }); return }
    setBusy(true); setFeedback(null)
    try {
      await revokePlatformUserAccess(revokeTarget.id, revokeReason, revokeTarget.lockVersion)
      setRevokeTarget(null); setRevokeReason(''); setFeedback({ type: 'success', message: 'تم سحب الصلاحية مع الاحتفاظ بسجلها التاريخي.' }); await load()
    } catch (error) {
      if (error instanceof PlatformUserAccessConflictError) { setRevokeTarget(null); await load() }
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر سحب الصلاحية.' })
    } finally { setBusy(false) }
  }

  return (
    <section className="platform-modules-panel platform-access-panel" aria-labelledby="platform-access-title">
      <div className="platform-modules-header">
        <div><span className="eyebrow">الصلاحيات التشغيلية</span><h2 id="platform-access-title">إدارة صلاحيات المستخدمين</h2><p>دور تشغيلي واحد لكل مستخدم ومساحة عمل وجهة، دون منح أي دور منصي.</p></div>
        <div className="platform-user-header-actions">
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading || busy}>تحديث القائمة</button>
          <button className="primary-button" type="button" onClick={openCreate} disabled={busy || activeUsers.length === 0 || activeOrganizations.length === 0 || workspaces.length === 0}>منح صلاحية</button>
        </div>
      </div>

      {feedback ? <div className={`platform-modules-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</div> : null}
      {loading ? <div className="platform-admin-refreshing" role="status">جاري تحميل الصلاحيات...</div> : accessRows.length === 0 ? <div className="platform-modules-empty">لا توجد صلاحيات تشغيلية مركزية حتى الآن.</div> : (
        <div className="platform-access-table-wrap"><table className="platform-access-table"><thead><tr><th>المستخدم</th><th>الجهة</th><th>المساحة</th><th>الدور</th><th>النطاق</th><th>الفترة والحالة</th><th>الإجراءات</th></tr></thead><tbody>
          {accessRows.map((row) => <tr key={row.id}><td><strong>{row.fullName}</strong><small>{row.email}</small></td><td>{row.organizationNameAr}</td><td>{row.workspaceName}</td><td>{operationalRoleLabels[row.roleCode]}</td><td>{operationalScopeLabels[row.accessScope]}</td><td><span className={`status ${row.status === 'active' ? 'success' : row.status === 'revoked' ? 'danger' : ''}`}>{statusLabels[row.status]}</span><small>{formatDate(row.startsAt)} — {formatDate(row.endsAt)}</small></td><td><div className="platform-access-actions"><button className="secondary-button" type="button" onClick={() => openEdit(row)} disabled={busy || !['active', 'scheduled'].includes(row.status)}>تعديل</button><button className="secondary-button" type="button" onClick={() => { setRevokeTarget(row); setRevokeReason(''); setErrors({}) }} disabled={busy || row.status === 'revoked'}>سحب</button></div></td></tr>)}
        </tbody></table></div>
      )}

      {editor ? <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="access-editor-title"><div className="platform-admin-modal-heading"><div><h2 id="access-editor-title">{editor === 'new' ? 'منح صلاحية تشغيلية' : 'تعديل الصلاحية'}</h2><p>الصلاحية لا تمنح أي دور داخل الإدارة المركزية.</p></div><button className="icon-button" type="button" onClick={() => setEditor(null)}>×</button></div><form className="platform-module-form" onSubmit={save} noValidate>
        <label><span>المستخدم <b>*</b></span><select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={editor !== 'new'}><option value="">اختر المستخدم</option>{activeUsers.map((user) => <option key={user.userId} value={user.userId}>{user.fullName} — {user.email}</option>)}</select>{errors.userId ? <small className="field-error">{errors.userId}</small> : null}</label>
        <label><span>الجهة <b>*</b></span><select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} disabled={editor !== 'new'}><option value="">اختر الجهة</option>{activeOrganizations.map((org) => <option key={org.id} value={org.id}>{org.organizationNameAr}</option>)}</select>{errors.organizationId ? <small className="field-error">{errors.organizationId}</small> : null}</label>
        <label><span>مساحة العمل <b>*</b></span><select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} disabled={editor !== 'new'}><option value="">اختر المساحة</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>{errors.workspaceId ? <small className="field-error">{errors.workspaceId}</small> : null}</label>
        <label><span>الدور <b>*</b></span><select value={roleCode} onChange={(e) => setRoleCode(e.target.value as OperationalRoleCode)}>{Object.entries(operationalRoleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>نطاق الوصول <b>*</b></span><select value={accessScope} onChange={(e) => setAccessScope(e.target.value as OperationalAccessScope)}>{Object.entries(operationalScopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>تاريخ البداية <b>*</b></span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />{errors.startsAt ? <small className="field-error">{errors.startsAt}</small> : null}</label>
        <label><span>تاريخ الانتهاء</span><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />{errors.endsAt ? <small className="field-error">{errors.endsAt}</small> : null}</label>
        <div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setEditor(null)}>إلغاء</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'جاري الحفظ...' : 'حفظ الصلاحية'}</button></div>
      </form></div></div> : null}

      {revokeTarget ? <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal platform-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="revoke-access-title"><div className="platform-admin-modal-heading"><div><h2 id="revoke-access-title">سحب الصلاحية</h2><p>سيبقى السجل محفوظًا لأغراض التدقيق.</p></div></div><form className="platform-module-form" onSubmit={revoke}><label><span>سبب السحب <b>*</b></span><textarea value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} rows={3} />{errors.revokeReason ? <small className="field-error">{errors.revokeReason}</small> : null}</label><div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setRevokeTarget(null)}>إلغاء</button><button className="primary-button platform-danger-button" type="submit" disabled={busy}>{busy ? 'جاري السحب...' : 'تأكيد السحب'}</button></div></form></div></div> : null}
    </section>
  )
}
