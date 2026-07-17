import { useState } from 'react'
import type { FormEvent } from 'react'
import shcLogo from '../../assets/shc-logo.png'
import { supabase } from '../../lib/supabase'
import './auth.css'

const defaultEmail = 'm.alshareef@shc.gov.sa'

function getArabicAuthError(message: string): string {
  if (message.toLowerCase().includes('invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
  }
  if (message.toLowerCase().includes('email not confirmed')) {
    return 'البريد الإلكتروني غير مؤكد. يرجى التواصل مع مسؤول النظام.'
  }
  return 'تعذّر تسجيل الدخول. تحقق من بياناتك واتصالك ثم حاول مرة أخرى.'
}

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'recovery'>('login')
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(getArabicAuthError(signInError.message))
      setLoading(false)
    }
  }

  const handleRecoverySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })

    if (resetError) {
      setError('تعذّر إرسال رابط الاستعادة. تحقق من البريد ثم حاول مرة أخرى.')
    } else {
      setMessage('إذا كان البريد مسجلًا، فسيصلك رابط آمن لتعيين كلمة مرور جديدة.')
    }
    setLoading(false)
  }

  const switchMode = (nextMode: 'login' | 'recovery') => {
    setMode(nextMode)
    setError(null)
    setMessage(null)
    setPassword('')
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" aria-labelledby="login-title">
        <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="auth-logo" />
        <div className="auth-heading">
          <span>المجلس الصحي السعودي</span>
          <h1 id="login-title">{mode === 'login' ? 'تسجيل الدخول' : 'استعادة كلمة المرور'}</h1>
          <p>منصة إدارة المتابعة والاعتماد</p>
        </div>

        <form className="auth-form" onSubmit={mode === 'login' ? handleSubmit : handleRecoverySubmit}>
          <label htmlFor="login-email">البريد الإلكتروني</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
            disabled={loading}
          />

          {mode === 'login' ? (
            <>
              <label htmlFor="login-password">كلمة المرور</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </>
          ) : (
            <p className="auth-help">أدخل البريد المسجل وسنرسل إليه رابطًا آمنًا لتعيين كلمة مرور جديدة.</p>
          )}

          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          {message ? <p className="auth-success" role="status">{message}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? mode === 'login' ? 'جاري تسجيل الدخول...' : 'جاري إرسال الرابط...'
              : mode === 'login' ? 'تسجيل الدخول' : 'إرسال رابط الاستعادة'}
          </button>
          <button
            className="auth-link-button"
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'recovery' : 'login')}
            disabled={loading}
          >
            {mode === 'login' ? 'نسيت كلمة المرور؟' : 'العودة إلى تسجيل الدخول'}
          </button>
        </form>
      </section>
    </main>
  )
}
