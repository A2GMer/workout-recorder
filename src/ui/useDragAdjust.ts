import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

export interface DragAdjustOptions {
  /** x: 右が増える / y: 上が増える */
  axis: 'x' | 'y'
  pixelsPerStep: number
  onStart: () => void
  /** 開始位置からの歩数（整数が変わるたびに呼ぶ） */
  onSteps: (steps: number) => void
  onEnd: () => void
  /** 長押しにならなかったふつうのタップ */
  onTap: (el: HTMLElement) => void
}

const SLOP = 8
const HOLD_MS = 350

/** 長押しのあと指をスライドして数字を調整する（1ジェスチャーで何段も動かす） */
export function useDragAdjust(opts: DragAdjustOptions) {
  const o = useRef(opts)
  o.current = opts
  const s = useRef({
    active: false,
    drag: false,
    cancelled: false,
    x: 0,
    y: 0,
    steps: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  })

  const reset = () => {
    clearTimeout(s.current.timer)
    s.current.active = false
    s.current.drag = false
    s.current.cancelled = false
    s.current.steps = 0
  }
  useEffect(() => () => clearTimeout(s.current.timer), [])

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      reset()
      const st = s.current
      st.active = true
      st.x = e.clientX
      st.y = e.clientY
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // 取れなくても続ける
      }
      st.timer = setTimeout(() => {
        if (!st.active || st.cancelled) return
        st.drag = true
        try {
          navigator.vibrate?.(10)
        } catch {
          // 対応していない端末は無視
        }
        o.current.onStart()
      }, HOLD_MS)
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const st = s.current
      if (!st.active || st.cancelled) return
      const dx = e.clientX - st.x
      const dy = e.clientY - st.y
      if (!st.drag) {
        // 長押しの前に動いた = スクロールやスワイプ
        if (Math.hypot(dx, dy) > SLOP) {
          st.cancelled = true
          clearTimeout(st.timer)
        }
        return
      }
      const { axis, pixelsPerStep } = o.current
      const delta = axis === 'x' ? dx : -dy
      const steps = Math.round(delta / pixelsPerStep)
      if (steps !== st.steps) {
        st.steps = steps
        o.current.onSteps(steps)
      }
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const st = s.current
      if (!st.active) return
      const el = e.currentTarget
      const moved = Math.hypot(e.clientX - st.x, e.clientY - st.y)
      const wasDrag = st.drag
      const wasCancelled = st.cancelled
      reset()
      if (wasDrag) o.current.onEnd()
      else if (!wasCancelled && moved < SLOP) o.current.onTap(el)
    },
    onPointerCancel() {
      const st = s.current
      const wasDrag = st.drag
      reset()
      if (wasDrag) o.current.onEnd()
    },
  }
}
