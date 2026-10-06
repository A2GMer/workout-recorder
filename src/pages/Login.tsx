import { useState } from 'react'
import { supabase } from '../data/supabase'
import { Icon } from '../ui/Icon'

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

  const field = 'glass h-14 w-full rounded-full px-6 text-center placeholder:text-faint'
  const go = (disabled: boolean) => (
    <button
      disabled={disabled}
      aria-label="次へ"
      className="grad mx-auto flex h-14 w-14 items-center justify-center rounded-full text-bg shadow-[0_0_32px_rgb(169_155_255/0.45)] transition disabled:opacity-30 disabled:shadow-none"
    >
      <Icon name="arrow" />
    </button>
  )

  return (
    <div className="safe-top safe-bottom flex min-h-full flex-col items-center justify-center px-8">
      <div className="mb-14 h-28 w-28 rounded-full grad opacity-80 blur-[2px] shadow-[0_0_80px_rgb(169_155_255/0.5)]" />
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex w-full max-w-xs flex-col gap-6">
          <input
            type="email"
            autoComplete="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          {go(busy || !email.trim())}
        </form>
      ) : (
        <form onSubmit={verify} className="flex w-full max-w-xs flex-col gap-6">
          <p className="truncate text-center text-sm text-dim">{email}</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="······"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
            className={`${field} text-2xl font-light tracking-[0.5em]`}
          />
          {go(busy || code.length < 6)}
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setError(false)
            }}
            aria-label="戻る"
            className="mx-auto flex h-11 w-11 items-center justify-center text-faint"
          >
            <Icon name="back" />
          </button>
        </form>
      )}
      <p className={`mt-4 h-5 text-sm text-down transition ${error ? 'opacity-100' : 'opacity-0'}`}>×</p>
    </div>
  )
}
