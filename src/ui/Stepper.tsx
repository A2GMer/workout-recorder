import { useEffect, useRef } from 'react'
import { fix } from '../lib/progression'

export interface Editor {
  key: string
  value: number
  step: number
  big?: number
  min?: number
  format?: (v: number) => string
  apply: (v: number) => void
}

function HoldButton({ onFire, children, className }: {
  onFire: () => void
  children: React.ReactNode
  className?: string
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fire = useRef(onFire)
  fire.current = onFire

  const stop = () => clearTimeout(timer.current)
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    fire.current()
    const loop = (delay: number) => {
      timer.current = setTimeout(() => {
        fire.current()
        loop(Math.max(50, delay * 0.85))
      }, delay)
    }
    timer.current = setTimeout(() => loop(90), 350)
  }
  useEffect(() => stop, [])

  return (
    <button
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex h-14 items-center justify-center rounded-xl bg-line font-bold active:bg-dim ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Stepper({ editor, onChange, onClose }: {
  editor: Editor
  onChange: (v: number) => void
  onClose: () => void
}) {
  const value = useRef(editor.value)
  value.current = editor.value

  const add = (d: number) => {
    let v = fix(value.current + d)
    if (editor.min !== undefined) v = Math.max(editor.min, v)
    value.current = v
    onChange(v)
  }
  const fmt = editor.format ?? String

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel">
      <div className="flex items-center gap-2 p-2">
        {editor.big && (
          <HoldButton onFire={() => add(-editor.big!)} className="w-14 text-sm text-dim">
            −{editor.big}
          </HoldButton>
        )}
        <HoldButton onFire={() => add(-editor.step)} className="flex-1 text-3xl">
          −
        </HoldButton>
        <div className="w-20 text-center text-2xl font-bold">{fmt(editor.value)}</div>
        <HoldButton onFire={() => add(editor.step)} className="flex-1 text-3xl">
          ＋
        </HoldButton>
        {editor.big && (
          <HoldButton onFire={() => add(editor.big!)} className="w-14 text-sm text-dim">
            +{editor.big}
          </HoldButton>
        )}
        <button onClick={onClose} className="h-14 w-12 text-2xl text-dim" aria-label="閉じる">
          ✓
        </button>
      </div>
    </div>
  )
}
