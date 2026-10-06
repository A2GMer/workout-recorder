import { useEffect, useRef } from 'react'

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  history: 'M4 7h16M4 12h16M4 17h10',
  settings: 'M4 8h10M18 8h2M4 16h2M10 16h10M16 6v4M8 14v4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  comment: 'M5 6.5A2.5 2.5 0 017.5 4h9A2.5 2.5 0 0119 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4 4v-4h0.5A2.5 2.5 0 015 13.5z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** 中央の線画。ゆっくり揺れる正弦波の束 */
export function WaveArt({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  const W = 300
  const H = 420
  const LINES = 6

  useEffect(() => {
    const svg = ref.current!
    const paths = [...svg.querySelectorAll('path')]
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      if (t - last < 33) return // 30fps で十分
      last = t
      const time = reduce ? 0 : t / 4000
      paths.forEach((p, k) => {
        const i = k >> 1
        const sign = k % 2 ? -1 : 1
        const amp = (30 + i * 16) * intensity
        let d = ''
        for (let y = 0; y <= H; y += 6) {
          const env = Math.sin((Math.PI * y) / H)
          const x = W / 2 + sign * amp * env * Math.sin((y / H) * Math.PI * 3 + time + i * 0.7)
          d += `${y ? 'L' : 'M'}${x.toFixed(1)} ${y}`
        }
        p.setAttribute('d', d)
      })
      if (reduce) cancelAnimationFrame(raf)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [intensity])

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} fill="none" stroke="currentColor" strokeWidth={1} className={className} aria-hidden="true">
      {Array.from({ length: LINES * 2 }, (_, k) => (
        <path key={k} opacity={0.35 + 0.65 * (1 - (k >> 1) / LINES)} />
      ))}
    </svg>
  )
}
