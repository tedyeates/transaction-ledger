import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useToast, ToastProvider } from './hooks/useToast'
import { Spinner } from './components/Spinner'
import { AuthScreen } from './components/AuthScreen'
import { AppShell } from './components/AppShell'

function App() {
  const [user, setUser]   = useState(null)
  const [role, setRole]   = useState(null)
  const [ready, setReady] = useState(false)
  const addToast = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        resolveRole(session.user).then(() => setReady(true))
      } else {
        setReady(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setUser(null); setRole(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const resolveRole = async authUser => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authUser.id)
      .single()
    setUser(authUser)
    setRole(data?.role ?? null)
  }

  const handleLogin = async authUser => { await resolveRole(authUser) }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
    addToast('ออกจากระบบแล้ว')
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
        <Spinner />
      </div>
    )
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />

  return <AppShell user={user} role={role} onLogout={handleLogout} />
}

export default function RootApp() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}
