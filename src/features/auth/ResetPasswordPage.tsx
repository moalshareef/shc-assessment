import { useState, type FormEvent } from 'react'
import shcLogo from '../../assets/shc-logo.png'
import { supabase } from '../../lib/supabase'
import { validateTemporaryPassword } from '../platform-admin/platformUsersModel'
import './auth.css'

interface ResetPasswordPageProps {
  authReady: boolean
  recoveryVerified: boolean
  onBackToLogin: () => Promise<void> | void
}

export function ResetPasswordPage({
  authReady,
  recoveryVerified,
  onBackToLogin,
}: ResetPasswordPageProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const passwordError = validateTemporaryPassword(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirmation) { setError('تأكيد كلمة المرور غير مطابق.'); return }

    setLoading(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError('تعذّر تعيين كلمة المرور. قد يكون رابط الاستعادة منتهيًا؛ اطلب رابطًا جديدًا.')
      return
    }

    setPassword('')
    setConfirmation('')
    setCompleted(true)
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" aria-labelledby="reset-password-title">
        <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="auth-logo" />
        <div className="auth-heading">
          <span>استعادة الحساب</span>
          <h1 id="reset-password-title">تعيين كلمة مرور جديدة</h1>
          <p>استخدم رابط الاستعادة المرسل إلى بريدك لتعيين كلمة مرور آمنة.</p>
        </div>

        {!authReady ? <p className="auth-help">جاري التحقق من رابط الاستعادة...</p> : null}
        {authReady && !recoveryVerified ? (
          <>
            <p className="auth-error" role="alert">رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا من شاشة الدخول.</p>
            <button className="auth-secondary" type="button" onClick={() => void onBackToLogin()}>العودة إلى تسجيل الدخول</button>
          </>
        ) : null}
        {authReady && recoveryVerified && !completed ? (
          <form className="auth-form" onSubmit={submit} noValidate>
            <label htmlFor="recovery-new-password">كلمة المرور الجديدة</label>
            <input id="recovery-new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" disabled={loading} />
            <small className="auth-hint">يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف ورقم.</small>
            <label htmlFor="recovery-confirm-password">تأكيد كلمة المرور</label>
            <input id="recovery-confirm-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" disabled={loading} />
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'جاري الحفظ...' : 'تعيين كلمة المرور الجديدة'}</button>
          </form>
        ) : null}
        {completed ? (
          <div className="auth-form">
            <p className="auth-success" role="status">تم تعيين كلمة المرور الجديدة بنجاح. يمكنك الآن تسجيل الدخول.</p>
            <button className="auth-submit" type="button" onClick={() => void onBackToLogin()}>العودة إلى تسجيل الدخول</button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
