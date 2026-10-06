import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSyncStatus } from '../data/sync'
import { supabase } from '../data/supabase'
import { Icon } from './Icon'

export function SyncDot() {
  const { pending, syncing, error } = useSyncStatus()
  if (!supabase) return null
  const color = error ? 'bg-down' : pending > 0 ? 'bg-warm' : 'bg-faint'
  return (
    <span
      aria-label={pending > 0 ? `未送信 ${pending}` : '同期済み'}
      className={`mx-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color} ${syncing ? 'animate-pulse' : ''}`}
    />
  )
}

export function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full text-dim transition active:bg-panel active:text-fg"
    >
      {children}
    </button>
  )
}

export function TopBar({ title, back, right }: { title?: ReactNode; back?: string; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-10 bg-bg/40 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-1 px-2">
        {back !== undefined ? (
          <IconButton label="戻る" onClick={() => nav(back)}>
            <Icon name="back" />
          </IconButton>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-wide text-dim">{title}</div>
        {right}
        <SyncDot />
      </div>
    </header>
  )
}
