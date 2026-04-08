import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../hooks/useToast'

export function AuthScreen({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const addToast = useToast()

  const configured = (
    import.meta.env.VITE_SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    !!import.meta.env.VITE_SUPABASE_URL
  )

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (!email || !password) { setError('กรุณากรอกอีเมลและรหัสผ่าน'); return }
    setLoading(true)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) { setError(authError.message); return }
    addToast('เข้าสู่ระบบสำเร็จ', 'success')
    onLogin(data.user)
  }

  return (
    <div className="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">บัญชี<span>รายการ</span></div>
        <div className="auth-sub">Thai Bank Ledger System</div>

        {!configured && (
          <div className="config-notice">
            ⚠ กรุณากำหนดค่า Supabase ก่อนใช้งาน<br />
            เพิ่ม VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ในไฟล์ .env
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="accountant@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="error-msg" role="alert">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            style={{ marginTop: '1.25rem' }}
            disabled={loading}
          >
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>
      </div>
    </div>
  )
}
