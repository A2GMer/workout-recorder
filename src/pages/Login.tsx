import { useState } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import { Icon, WaveArt } from '../ui/Icon'

const EMAIL_KEY = 'login-email'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function storedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function sendError(e: AuthError): string {
  if (e.status === 429) return 'しばらく待ってから再送してください'
  if (/signup|not allowed|not found/i.test(e.message)) return '登録されていないアドレスです'
  return '送信できませんでした'
}

/** メールに届く確認コードでログイン（各端末で初回のみ） */
export default function Login() {
  const [email, setEmail] = useState(storedEmail)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = EMAIL_RE.test(email.trim())

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return setError('アドレスの形式が正しくありません')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    })
    setBusy(false)
    if (error) return setError(sendError(error))
    setError('')
    try {
      localStorage.setItem(EMAIL_KEY, email.trim())
    } catch {
      // 保存できなくても続行
    }
    setStep('code')
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase!.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
    setBusy(false)
    setError(error ? 'コードが正しくありません' : '')
  }

  const field = 'h-14 w-full rounded-2xl bg-panel px-5 text-center placeholder:text-faint'
  const submit = (disabled: boolean) => (
    <button
      disabled={disabled}
      aria-label="次へ"
      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-fg text-bg transition active:scale-95 disabled:bg-chip disabled:text-faint"
    >
      <Icon name="arrow" />
    </button>
  )

  return (
    <div className="safe-top flex min-h-full flex-col items-center justify-center px-8 pb-[env(safe-area-inset-bottom)]">
      <WaveArt className="mb-10 h-44 w-auto text-fg" intensity={0.8} />
      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex w-full max-w-xs flex-col gap-5" noValidate>
          <input
            type="email"
            autoComplete="email"
            placeholder="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
            className={field}
          />
          {submit(busy || !email.trim())}
        </form>
      ) : (
        <form onSubmit={verify} className="flex w-full max-w-xs flex-col gap-5">
          <p className="truncate text-center text-sm text-dim">{email}</p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''))
              setError('')
            }}
            autoFocus
            className={`${field} text-2xl tracking-[0.4em]`}
          />
          {submit(busy || code.length < 6)}
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setCode('')
              setError('')
            }}
            className="mx-auto h-11 px-4 text-sm text-dim"
          >
            アドレスを変更
          </button>
        </form>
      )}
      <p className="mt-4 h-5 text-center text-sm text-dim">{error}</p>
    </div>
  )
}
