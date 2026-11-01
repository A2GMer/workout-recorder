import { useEffect, useRef, useState } from 'react'
import { num } from '../lib/format'

export interface TimePoint {
  date: string // YYYY-MM-DD
  value: number
}

/** 左の余白（縦の最大・最小の数字）と、線の左右の余白。並べるグラフで同じにして横をそろえる */
const GUTTER = 36
const PAD = 6

/** 日付 → 横の位置（px）。範囲が1日なら真ん中 */
export function xOf(date: string, width: number, domain: [string, string]): number {
  const [t0, t1] = domain.map(Date.parse)
  const left = GUTTER + PAD
  const span = width - left - PAD
  return t1 === t0 ? left + span / 2 : left + (span * (Date.parse(date) - t0)) / (t1 - t0)
}

/** 横の位置（px）に一番近い日付（dates の中から。縦の細線はここに吸い付く） */
export function nearestDate(dates: string[], x: number, width: number, domain: [string, string]): string {
  return dates.reduce((a, b) => (Math.abs(xOf(b, width, domain) - x) < Math.abs(xOf(a, width, domain) - x) ? b : a))
}

/** その日の値 = その日以前で一番新しい点。なければ null */
export function valueAt<T extends TimePoint>(points: T[], date: string): T | null {
  let out: T | null = null
  for (const p of points) if (p.date <= date) out = p
  return out
}

/**
 * 時間軸の細い折れ線（モノクロ・線の色は currentColor）。
 * 横は domain の日付の範囲（並べるグラフと同じ）、縦はこの系列の最小〜最大。左の余白に最大・最小。
 * 最後の点に面の色の輪つきの丸。at の日付に縦の細線と、その日の値の点
 */
export function TimeLine({ points, domain, at, className }: {
  points: TimePoint[]
  domain: [string, string]
  at: string | null
  className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current!
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const y = (v: number) => (max === min ? h / 2 : h - PAD - ((h - PAD * 2) * (v - min)) / (max - min))
  const x = (d: string) => xOf(d, w, domain)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join('')
  const last = points[points.length - 1]
  // 丸: なぞっている間はその日の値（その日より前に点がなければ出さない）、ふだんは最後の点
  const hit = at ? valueAt(points, at) : last

  return (
    <svg ref={ref} className={`block w-full overflow-visible ${className ?? ''}`} aria-hidden="true">
      {w > 0 && points.length > 0 && (
        <>
          {/* 縦の最大・最小（同じなら1つ） */}
          <g fill="var(--color-faint)" fontSize={10} textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <text x={GUTTER - 8} y={y(max) + 3.5}>{num(max)}</text>
            {max !== min && <text x={GUTTER - 8} y={y(min) + 3.5}>{num(min)}</text>}
          </g>
          {at && <line x1={x(at)} x2={x(at)} y1={0} y2={h} stroke="var(--color-faint)" strokeWidth={1} />}
          <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hit && <circle cx={x(hit.date)} cy={y(hit.value)} r={4} fill="currentColor" stroke="var(--color-bg)" strokeWidth={2} />}
        </>
      )}
    </svg>
  )
}
