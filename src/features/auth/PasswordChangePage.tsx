import { useState, type FormEvent } from 'react'
import shcLogo from '../../assets/shc-logo.png'
import { changeOwnTemporaryPassword } from '../../services/platformUserAdminService'
import { validateTemporaryPassword } from '../platform-admin/platformUsersModel'

interface Props {
  onChanged: () => Promise<void> | void
  onSignOut: () => Promise<void> | void
  mode?: 'required' | 'voluntary'
  onCancel?: () => void
}

export function PasswordChangePage({ onChanged, onSignOut, mode = 'required', onCancel }: Props) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const passwordError = validateTemporaryPassword(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirmation) { setError('تأكيد كلمة المرور غير مطابق.'); return }

    setLoading(true)
    setError(null)
    try {
      await changeOwnTemporaryPassword(password)
      setPassword('')
      setConfirmation('')
      await onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تغيير كلمة المرور.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" aria-labelledby="change-password-title">
        <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="auth-logo" />
        <div className="auth-heading">
          <span>{mode === 'required' ? 'إجراء أمني إلزامي' : 'إعدادات الحساب'}</span>
          <h1 id="change-password-title">تغيير كلمة المرور</h1>
          <p>{mode === 'required' ? 'يجب استبدال كلمة المرور المؤقتة قبل الدخول إلى المنصة.' : 'استخدم كلمة مرور قوية لحماية حسابك.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label htmlFor="new-password">كلمة المرور الجديدة</label>
          <input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" disabled={loading} />
          <small className="auth-hint">يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف ورقم.</small>
          <label htmlFor="confirm-password">تأكيد كلمة المرور</label>
          <input id="confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" disabled={loading} />
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'جاري تغيير كلمة المرور...' : mode === 'required' ? 'تغيير كلمة المرور والدخول' : 'حفظ كلمة المرور الجديدة'}</button>
          {mode === 'voluntary' && onCancel ? <button className="auth-secondary" type="button" onClick={onCancel} disabled={loading}>العودة إلى المنصة</button> : null}
          <button className="auth-secondary" type="button" onClick={() => void onSignOut()} disabled={loading}>تسجيل الخروج</button>
        </form>
      </section>
    </main>
  )
}
