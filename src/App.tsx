import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './data/supabase'
import { syncNow } from './data/sync'
import Home from './pages/Home'
import SessionPage from './pages/SessionPage'
import History from './pages/History'
import SettingsPage from './pages/SettingsPage'
import Login from './pages/Login'

export default function App() {
  const [auth, setAuth] = useState<Session | null | undefined>(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setAuth(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setAuth(s)
      if (event === 'SIGNED_IN') void syncNow()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (auth === undefined) return null
  if (supabase && !auth) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:id" element={<SessionPage />} />
      <Route path="/history" element={<History />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  )
}
