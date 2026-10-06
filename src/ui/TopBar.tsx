import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSyncStatus } from '../data/sync'
import { supabase } from '../data/supabase'
import { Icon } from './Icon'

/** 未送信があるときだけ右上に小さな点を出す */
export function SyncDot() {
  const { pending, syncing, error } = useSyncStatus()
  if (!supabase || (!pending && !error)) return null
  return (
    <span
      aria-label={error ? '同期エラー' : `未送信 ${pending}`}
      className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${error ? 'bg-dim' : 'bg-fg'} ${syncing ? 'animate-pulse' : ''}`}
    />
  )
}

export function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition active:text-fg"
    >
      {children}
    </button>
  )
}

/** 左: 戻る / 中央: タイトル / 右: 任意（左右は同じ幅にして中央を揃える） */
export function TopBar({ title, sub, back, onBack, right, side = 64 }: {
  title?: ReactNode
  sub?: ReactNode
  back?: string
  onBack?: () => void
  right?: ReactNode
  side?: number
}) {
  const nav = useNavigate()
  return (
    <header className="safe-top sticky top-0 z-10 bg-bg">
      <div className="relative flex h-14 items-center px-2">
        <div className="flex shrink-0 items-center" style={{ width: side }}>
          {(back !== undefined || onBack) && (
            <IconButton label="戻る" onClick={() => (onBack ? onBack() : nav(back!))}>
              <Icon name="back" />
            </IconButton>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center">
          {title && <div className="truncate text-[15px] leading-5">{title}</div>}
          {sub && <div className="truncate text-xs leading-4 text-dim">{sub}</div>}
        </div>
        <div className="flex shrink-0 items-center justify-end" style={{ width: side }}>{right}</div>
        <SyncDot />
      </div>
    </header>
  )
}
