import { useState } from 'react'
import type { AuthError } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
import { Icon, WaveArt } from '../ui/Icon'

const EMAIL_KEY = 'login-email'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 6

type Mode = 'login' | 'signup'

function storedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function authError(e: AuthError): string {
  if (e.status === 429) return 'しばらく待ってから試してください'
  if (/invalid login credentials/i.test(e.message)) return 'アドレスかパスワードが違います'
  if (/email not confirmed/i.test(e.message)) return '確認メールのリンクを開いてください'
  if (/already registered|already exists/i.test(e.message)) return '登録済みのアドレスです'
  if (/password/i.test(e.message)) return `パスワードは${MIN_PASSWORD}文字以上にしてください`
  if (/signups? not allowed|disabled/i.test(e.message)) return '新規登録は受け付けていません'
  return '処理できませんでした'
}

/** メール + パスワード。ログイン / 新規登録（各端末で初回のみ。以降はセッションを保持） */
export default function Login() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState(storedEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  function remember() {
    try {
      localStorage.setItem(EMAIL_KEY, email.trim())
    } catch {
      // 保存できなくても続行
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setMessage('アドレスの形式が正しくありません')
    if (signup) {
      if (password.length < MIN_PASSWORD) return setMessage(`パスワードは${MIN_PASSWORD}文字以上にしてください`)
      if (password !== confirm) return setMessage('パスワードが一致しません')
    }
    setBusy(true)
    if (signup) {
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      setBusy(false)
      if (error) return setMessage(authError(error))
      remember()
      // 確認メールが有効な設定ではセッションが返らない
      if (!data.session) {
        setMode('login')
        setConfirm('')
        setMessage('確認メールを送りました。リンクを開いてからログインしてください')
      }
      return
    }
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) return setMessage(authError(error))
    remember()
  }

  function switchMode() {
    setMode(signup ? 'login' : 'signup')
    setPassword('')
    setConfirm('')
    setMessage('')
  }

  const field = 'h-14 w-full rounded-2xl bg-panel px-5 text-center placeholder:text-faint'
  const change = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value)
    setMessage('')
  }

  return (
    <div className="safe-top flex min-h-full flex-col items-center justify-center px-8 pb-[env(safe-area-inset-bottom)]">
      <WaveArt className="mb-10 h-44 w-auto text-fg" intensity={0.8} />
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3" noValidate>
        <input
          type="email"
          autoComplete={signup ? 'email' : 'username'}
          placeholder="email"
          value={email}
          onChange={change(setEmail)}
          className={field}
        />
        <input
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          placeholder="password"
          value={password}
          onChange={change(setPassword)}
          className={field}
        />
        {signup && (
          <input
            type="password"
            autoComplete="new-password"
            placeholder="password（確認）"
            value={confirm}
            onChange={change(setConfirm)}
            className={field}
          />
        )}
        <button
          disabled={busy || !email.trim() || !password || (signup && !confirm)}
          aria-label={signup ? '登録' : 'ログイン'}
          className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-fg text-bg transition active:scale-95 disabled:bg-chip disabled:text-faint"
        >
          <Icon name="arrow" />
        </button>
      </form>
      <p className="mt-4 min-h-5 max-w-xs text-center text-sm leading-5 text-dim">{message}</p>
      <button type="button" onClick={switchMode} className="mt-4 h-11 px-4 text-sm text-dim active:text-fg">
        {signup ? 'ログインに戻る' : '新規登録'}
      </button>
    </div>
  )
}
