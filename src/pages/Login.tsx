import { useState } from 'react'
import { supabase } from '../data/supabase'

const EMAIL_KEY = 'login-email'

function storedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

/** メールに届く確認コードでログイン（初回のみ。以降はセッションを保持） */
export default function Login() {
  const [email, setEmail] = useState(storedEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    setError(!!error)
    if (!error) {
      try {
        localStorage.setItem(EMAIL_KEY, email.trim())
      } catch {
        // 保存できなくても続行
      }
      setStep('code')
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
    setBusy(false)
    setError(!!error)
  }

  const input = 'rounded-lg bg-panel px-4 py-3'
  const button = 'rounded-lg bg-accent py-3 font-bold text-black disabled:opacity-50'

  return step === 'email' ? (
    <form onSubmit={sendCode} className="safe-top mx-auto flex max-w-sm flex-col gap-3 p-6 pt-24">
      <input
        type="email"
        autoComplete="email"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={input}
      />
      {error && <p className="text-sm text-down">×</p>}
      <button disabled={busy || !email.trim()} className={button}>
        →
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className="safe-top mx-auto flex max-w-sm flex-col gap-3 p-6 pt-24">
      <p className="text-center text-sm text-dim">{email}</p>
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        autoFocus
        className={`${input} text-center text-2xl tracking-[0.4em]`}
      />
      {error && <p className="text-center text-sm text-down">×</p>}
      <button disabled={busy || code.length < 6} className={button}>
        →
      </button>
      <button type="button" onClick={() => { setStep('email'); setCode(''); setError(false) }} className="text-sm text-dim">
        ‹
      </button>
    </form>
  )
}
