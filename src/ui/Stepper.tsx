import { useEffect, useRef } from 'react'
import { fix } from '../lib/progression'
import { Icon } from './Icon'

export interface Editor {
  key: string
  label?: string
  unit?: string
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
      className={`flex items-center justify-center rounded-full bg-chip transition active:bg-line ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** 画面下の数値調整パネル */
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
    <div className="fixed inset-x-0 bottom-0 z-20 rounded-t-[28px] border-t border-line bg-panel px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="relative flex h-12 items-center justify-center">
        {editor.label && <span className="absolute left-1 text-[11px] tracking-[0.15em] text-dim">{editor.label}</span>}
        <span className="text-4xl leading-none">{fmt(editor.value)}</span>
        {editor.unit && <span className="ml-1.5 self-end pb-1 text-xs text-dim">{editor.unit}</span>}
        <button onClick={onClose} aria-label="閉じる" className="absolute right-0 flex h-11 w-11 items-center justify-center text-dim">
          <Icon name="down" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {editor.big ? (
          <HoldButton label={`−${editor.big}`} onFire={() => add(-editor.big!)} className="h-14 flex-1 text-sm text-dim">
            −{editor.big}
          </HoldButton>
        ) : null}
        <HoldButton label="減らす" onFire={() => add(-editor.step)} className="h-14 flex-[1.5] text-fg">
          <Icon name="minus" size={26} />
        </HoldButton>
        <HoldButton label="増やす" onFire={() => add(editor.step)} className="h-14 flex-[1.5] text-fg">
          <Icon name="plus" size={26} />
        </HoldButton>
        {editor.big ? (
          <HoldButton label={`+${editor.big}`} onFire={() => add(editor.big!)} className="h-14 flex-1 text-sm text-dim">
            +{editor.big}
          </HoldButton>
        ) : null}
      </div>
    </div>
  )
}
