import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Icon } from '../../components/layout/Header'
import { activatePlatformUser, createPlatformUser, invitePlatformUser, listPlatformUsers, suspendPlatformUser } from '../../services/platformUserAdminService'
import type { PlatformOrganization } from '../../types/platformAdmin'
import type { PlatformAdminUser } from '../../types/platformUserAdmin'
import { invitationStatusLabels, validatePlatformUserEmail, validatePlatformUserName, validatePrimaryOrganization, validateSuspensionReason, validateTemporaryPassword } from './platformUsersModel'

interface Props { organizations: PlatformOrganization[] }

function formatDate(value: string | null) {
  if (!value) return 'لا يوجد'
  return new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function PlatformUsersSection({ organizations }: Props) {
  const [users, setUsers] = useState<PlatformAdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [suspendTarget, setSuspendTarget] = useState<PlatformAdminUser | null>(null)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const activeOrganizations = organizations.filter((organization) => organization.status === 'active')

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await listPlatformUsers()) }
    catch (error) { setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر تحميل المستخدمين.' }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((user) => user.profileStatus === 'active').length,
    suspended: users.filter((user) => user.profileStatus === 'suspended').length,
    pending: users.filter((user) => !user.emailConfirmed || ['draft', 'sent', 'accepted'].includes(user.invitationStatus ?? '')).length,
  }), [users])

  function openInvite() {
    setEmail(''); setFullName(''); setOrganizationId(''); setErrors({}); setFeedback(null); setInviteOpen(true)
  }

  function openCreate() {
    setEmail(''); setFullName(''); setOrganizationId(''); setTemporaryPassword(''); setErrors({}); setFeedback(null); setCreateOpen(true)
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const emailError = validatePlatformUserEmail(email); const nameError = validatePlatformUserName(fullName); const organizationError = validatePrimaryOrganization(organizationId); const passwordError = validateTemporaryPassword(temporaryPassword)
    if (emailError) nextErrors.email = emailError
    if (nameError) nextErrors.fullName = nameError
    if (organizationError) nextErrors.organizationId = organizationError
    if (passwordError) nextErrors.temporaryPassword = passwordError
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusyId('create'); setFeedback(null)
    try {
      await createPlatformUser({ email, fullName, primaryOrganizationId: organizationId, temporaryPassword })
      setTemporaryPassword(''); setCreateOpen(false)
      setFeedback({ type: 'success', message: 'تم إنشاء المستخدم بنجاح. يجب عليه تغيير كلمة المرور عند أول دخول.' })
      await load()
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر إنشاء المستخدم.' })
    } finally {
      setTemporaryPassword(''); setBusyId(null)
    }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const emailError = validatePlatformUserEmail(email); const nameError = validatePlatformUserName(fullName); const organizationError = validatePrimaryOrganization(organizationId)
    if (emailError) nextErrors.email = emailError
    if (nameError) nextErrors.fullName = nameError
    if (organizationError) nextErrors.organizationId = organizationError
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setBusyId('invite'); setFeedback(null)
    try {
      await invitePlatformUser({ email, fullName, primaryOrganizationId: organizationId })
      setInviteOpen(false); setFeedback({ type: 'success', message: 'تم إرسال الدعوة الرسمية بنجاح.' }); await load()
    } catch (error) { setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر إرسال الدعوة.' }) }
    finally { setBusyId(null) }
  }

  async function submitSuspend(event: FormEvent) {
    event.preventDefault()
    if (!suspendTarget) return
    const error = validateSuspensionReason(reason)
    if (error) { setErrors({ reason: error }); return }
    if (!window.confirm(`هل تريد إيقاف حساب «${suspendTarget.fullName || suspendTarget.email}»؟`)) return
    setBusyId(suspendTarget.userId); setFeedback(null)
    try { await suspendPlatformUser(suspendTarget.userId, reason); setSuspendTarget(null); setFeedback({ type: 'success', message: 'تم إيقاف المستخدم دون حذف أعماله.' }); await load() }
    catch (caught) { setFeedback({ type: 'error', message: caught instanceof Error ? caught.message : 'تعذر إيقاف المستخدم.' }) }
    finally { setBusyId(null) }
  }

  async function activate(user: PlatformAdminUser) {
    if (!window.confirm(`هل تريد إعادة تفعيل حساب «${user.fullName || user.email}»؟`)) return
    setBusyId(user.userId); setFeedback(null)
    try { await activatePlatformUser(user.userId); setFeedback({ type: 'success', message: 'تمت إعادة تفعيل المستخدم.' }); await load() }
    catch (error) { setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'تعذر تفعيل المستخدم.' }) }
    finally { setBusyId(null) }
  }

  return (
    <section className="platform-modules-panel platform-users-panel" aria-labelledby="platform-users-title">
      {createOpen ? <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title"><div className="platform-admin-modal-heading"><div><h2 id="create-user-title">إنشاء مستخدم</h2><p>سيُنشأ الحساب فعالًا بكلمة مرور مؤقتة، ولن يُمنح أي دور أو صلاحية موديل تلقائيًا.</p></div><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => { setTemporaryPassword(''); setCreateOpen(false) }}>×</button></div><form className="platform-module-form" onSubmit={submitCreate} noValidate><label><span>الاسم الكامل <b>*</b></span><input value={fullName} onChange={(event) => setFullName(event.target.value)} />{errors.fullName ? <small className="field-error">{errors.fullName}</small> : null}</label><label><span>البريد الإلكتروني <b>*</b></span><input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />{errors.email ? <small className="field-error">{errors.email}</small> : null}</label><label><span>الجهة الأساسية <b>*</b></span><select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">اختر الجهة</option>{activeOrganizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.organizationNameAr}</option>)}</select>{errors.organizationId ? <small className="field-error">{errors.organizationId}</small> : null}</label><label><span>كلمة مرور مؤقتة <b>*</b></span><input dir="ltr" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} autoComplete="new-password" />{errors.temporaryPassword ? <small className="field-error">{errors.temporaryPassword}</small> : <small>12 حرفًا على الأقل، وحرف كبير وصغير ورقم ورمز خاص.</small>}</label><div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => { setTemporaryPassword(''); setCreateOpen(false) }}>إلغاء</button><button className="primary-button" type="submit" disabled={busyId !== null}>{busyId === 'create' ? 'جاري الإنشاء...' : 'إنشاء المستخدم'}</button></div></form></div></div> : null}
      <div className="platform-modules-header"><div><span className="eyebrow">المستخدمون والدعوات</span><h2 id="platform-users-title">إدارة المستخدمين</h2><p>إنشاء المستخدمين أو دعوتهم ومتابعة حالتهم دون حذف الأعمال أو الإسنادات.</p></div><div className="platform-user-header-actions"><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading || busyId !== null}>تحديث القائمة</button><button className="secondary-button" type="button" onClick={openInvite} disabled={busyId !== null || activeOrganizations.length === 0}>إرسال دعوة بالبريد</button><button className="primary-button" type="button" onClick={openCreate} disabled={busyId !== null || activeOrganizations.length === 0}><Icon name="users" size={18} /> إنشاء مستخدم</button></div></div>
      {activeOrganizations.length === 0 ? <div className="platform-modules-feedback error" role="status">لا يمكن إنشاء مستخدم أو إرسال دعوة قبل وجود جهة فعالة. لم تُنشأ أي بيانات تلقائيًا.</div> : null}
      {feedback ? <div className={`platform-modules-feedback ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</div> : null}
      <div className="platform-user-stats"><div><strong>{counts.total}</strong><span>إجمالي المستخدمين</span></div><div><strong>{counts.active}</strong><span>نشطون</span></div><div><strong>{counts.suspended}</strong><span>موقوفون</span></div><div><strong>{counts.pending}</strong><span>دعوات غير مكتملة</span></div></div>
      {loading ? <div className="platform-modules-empty" role="status">جاري تحميل المستخدمين...</div> : users.length === 0 ? <div className="platform-modules-empty"><h3>لا يوجد مستخدمون</h3><p>ستظهر الحسابات هنا بعد إنشائها أو دعوتها.</p></div> : <div className="platform-modules-table-wrap"><table className="platform-modules-table platform-users-table"><thead><tr><th>المستخدم</th><th>الجهة الأساسية</th><th>حالة الحساب</th><th>البريد</th><th>حالة الدعوة</th><th>آخر دخول</th><th>تاريخ الإنشاء</th><th>الإجراءات</th></tr></thead><tbody>{users.map((user) => <tr key={user.userId}><td><strong>{user.fullName || 'دون اسم'}</strong><code>{user.email}</code></td><td>{user.primaryOrganizationName || 'غير محددة'}</td><td><span className={`status ${user.profileStatus === 'active' ? 'success' : 'danger'}`}>{user.profileStatus === 'active' ? 'فعال' : 'موقوف'}</span></td><td>{user.emailConfirmed ? 'مؤكد' : 'بانتظار التأكيد'}</td><td>{user.invitationStatus ? invitationStatusLabels[user.invitationStatus] ?? user.invitationStatus : 'حساب قائم'}{user.invitationSyncStatus === 'failed' ? <small>تحتاج معالجة</small> : null}</td><td>{formatDate(user.lastSignInAt)}</td><td>{formatDate(user.createdAt)}</td><td>{user.profileStatus === 'active' ? <button className="secondary-button" type="button" onClick={() => { setSuspendTarget(user); setReason(''); setErrors({}) }} disabled={busyId !== null}>إيقاف</button> : <button className="secondary-button" type="button" onClick={() => void activate(user)} disabled={busyId !== null}>{busyId === user.userId ? 'جاري التفعيل...' : 'إعادة تفعيل'}</button>}</td></tr>)}</tbody></table></div>}

      {inviteOpen ? <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal" role="dialog" aria-modal="true" aria-labelledby="invite-user-title"><div className="platform-admin-modal-heading"><div><h2 id="invite-user-title">دعوة مستخدم</h2><p>سيتلقى المستخدم رابطًا رسميًا ليحدد كلمة مروره بنفسه، ولن يُمنح أي دور تلقائيًا.</p></div><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setInviteOpen(false)}>×</button></div><form className="platform-module-form" onSubmit={submitInvite} noValidate><label><span>البريد الإلكتروني <b>*</b></span><input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />{errors.email ? <small className="field-error">{errors.email}</small> : null}</label><label><span>الاسم الكامل <b>*</b></span><input value={fullName} onChange={(event) => setFullName(event.target.value)} />{errors.fullName ? <small className="field-error">{errors.fullName}</small> : null}</label><label><span>الجهة الأساسية <b>*</b></span><select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">اختر الجهة</option>{activeOrganizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.organizationNameAr}</option>)}</select>{errors.organizationId ? <small className="field-error">{errors.organizationId}</small> : null}</label><div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setInviteOpen(false)}>إلغاء</button><button className="primary-button" type="submit" disabled={busyId !== null}>{busyId ? 'جاري الإرسال...' : 'إرسال الدعوة'}</button></div></form></div></div> : null}
      {suspendTarget ? <div className="platform-admin-modal-backdrop" role="presentation"><div className="platform-admin-modal platform-admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="suspend-user-title"><div className="platform-admin-modal-heading"><div><h2 id="suspend-user-title">إيقاف المستخدم</h2><p>لن تُحذف أعمال المستخدم أو أدواره أو إسناداته.</p></div></div><form className="platform-module-form" onSubmit={submitSuspend} noValidate><label><span>سبب الإيقاف <b>*</b></span><textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} />{errors.reason ? <small className="field-error">{errors.reason}</small> : null}</label><div className="platform-admin-modal-actions"><button className="secondary-button" type="button" onClick={() => setSuspendTarget(null)}>إلغاء</button><button className="primary-button platform-danger-button" type="submit" disabled={busyId !== null}>إيقاف المستخدم</button></div></form></div></div> : null}
    </section>
  )
}
