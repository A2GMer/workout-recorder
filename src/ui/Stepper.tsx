import { useEffect, useRef } from 'react'
import { fix } from '../lib/progression'
import { Icon } from './Icon'

export interface Editor {
  key: string
  value: number
  step: number
  big?: number
  min?: number
  format?: (v: number) => string
  apply: (v: number) => void
}

function HoldButton({ onFire, children, className, label }: {
  onFire: () => void
  children: React.ReactNode
  className?: string
  label: string
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
      aria-label={label}
      className={`flex shrink-0 items-center justify-center rounded-full border border-line transition active:bg-line ${className ?? ''}`}
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
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="glass rounded-[32px] bg-[#101018]/80 p-3">
        <div className="pb-2 text-center text-4xl font-light tracking-tight">{fmt(editor.value)}</div>
        <div className="flex items-center gap-2">
          {editor.big ? (
            <HoldButton label={`−${editor.big}`} onFire={() => add(-editor.big!)} className="h-14 flex-1 text-sm text-dim">
              −{editor.big}
            </HoldButton>
          ) : null}
          <HoldButton label="減らす" onFire={() => add(-editor.step)} className="h-14 flex-[1.4] text-fg">
            <Icon name="minus" size={26} />
          </HoldButton>
          <HoldButton label="増やす" onFire={() => add(editor.step)} className="h-14 flex-[1.4] text-fg">
            <Icon name="plus" size={26} />
          </HoldButton>
          {editor.big ? (
            <HoldButton label={`+${editor.big}`} onFire={() => add(editor.big!)} className="h-14 flex-1 text-sm text-dim">
              +{editor.big}
            </HoldButton>
          ) : null}
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-14 w-11 shrink-0 items-center justify-center rounded-full text-faint active:bg-line"
          >
            <Icon name="down" />
          </button>
        </div>
      </div>
    </div>
  )
}
