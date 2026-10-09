import { useEffect, useRef } from 'react'

/**
 * 疲労度のゲージ（0 = 軽 〜 100 = 重）。
 * 横長の長方形の中を左から右へ。つまみは縦線で、長方形の高さいっぱい。
 * 左端からつまみまでのあいだに幾何学の曲線の束を描く。
 * 軽いほど本数が少なく、ゆるやかに、ゆっくり流れる。重いほど本数が増え、振幅と周波数が上がり、速く、細かく震える。
 * 束は左端とつまみの位置で1点に集まる（レンズ形）。
 */
const W = 1000
const H = 100
const MAX_LINES = 8

export function FatigueGauge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const current = useRef(value)
  current.current = value

  useEffect(() => {
    const el = svg.current!
    const paths = [...el.querySelectorAll('path')]
    const thumb = el.querySelector('line[data-thumb]') as SVGLineElement
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = -1e9
    const draw = (now: number) => {
      if (!still) raf = requestAnimationFrame(draw)
      if (now - last < 33) return // 30fps
      last = now
      const k = Math.min(1, Math.max(0, current.current / 100))
      const p = (W * current.current) / 100 // つまみの位置
      const t = still ? 0 : now / 1000
      const lines = 2 + Math.round(6 * k)
      const amp = 12 + 30 * k
      const cycles = 1 + 3 * k
      const speed = 0.4 + 3.6 * k
      const tremor = k * k * 6
      thumb.setAttribute('x1', p.toFixed(1))
      thumb.setAttribute('x2', p.toFixed(1))
      paths.forEach((path, i) => {
        if (i >= lines || p < 20) {
          path.setAttribute('d', '')
          return
        }
        const f = lines === 1 ? 0 : i / (lines - 1) - 0.5 // -0.5〜0.5
        const phase = i * 0.9
        let d = ''
        for (let x = 0; x <= p + 0.01; x += Math.max(6, p / 60)) {
          const u = x / p
          const env = Math.sin(Math.PI * u) // 両端で 0
          const wave = Math.sin(u * Math.PI * 2 * cycles + t * speed + phase)
          const jitter = tremor * Math.sin(x * 0.2 + t * 11 + i)
          const y = H / 2 + env * (amp * wave * (0.6 + 0.8 * Math.abs(f)) * Math.sign(f || 1) + jitter)
          d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
        }
        path.setAttribute('d', d)
        path.setAttribute('opacity', (0.3 + 0.55 * k * (1 - Math.abs(f) * 0.6)).toFixed(2))
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="relative h-16 flex-1 overflow-hidden rounded-md border border-line">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        {/* 曲線の束 */}
        {Array.from({ length: MAX_LINES }, (_, i) => (
          <path key={i} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {/* つまみ: 縦線 */}
        <line data-thumb x1={0} y1={0} x2={0} y2={H} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="gauge-tall absolute inset-0 h-full w-full"
        aria-label="疲労度"
      />
    </div>
  )
}
