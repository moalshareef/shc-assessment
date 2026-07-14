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
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-card" aria-labelledby="login-title">
        <img src={shcLogo} alt="شعار المجلس الصحي السعودي" className="auth-logo" />
        <div className="auth-heading">
          <span>المجلس الصحي السعودي</span>
          <h1 id="login-title">تسجيل الدخول</h1>
          <p>منصة إدارة المتابعة والاعتماد</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
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

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </section>
    </main>
  )
}
