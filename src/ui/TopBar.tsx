import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSyncStatus } from '../data/sync'
import { supabase } from '../data/supabase'

export function SyncDot() {
  const { pending, syncing, error } = useSyncStatus()
  if (!supabase) return null
  const color = error ? 'bg-down' : pending > 0 ? 'bg-accent' : 'bg-line'
  return (
    <span
      aria-label={pending > 0 ? `未送信 ${pending}` : '同期済み'}
      className={`inline-block h-2 w-2 rounded-full ${color} ${syncing ? 'animate-pulse' : ''}`}
    />
  )
}

export function TopBar({
  title,
  back,
  right,
}: {
  title?: ReactNode
  back?: string
  right?: ReactNode
}) {
  const nav = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-10 bg-bg/95 backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-3">
        {back !== undefined && (
          <button onClick={() => nav(back)} className="-ml-1 px-2 text-2xl text-dim" aria-label="戻る">
            ‹
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-base font-bold">{title}</div>
        {right}
        <SyncDot />
      </div>
    </header>
  )
}
