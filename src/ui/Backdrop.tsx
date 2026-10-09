import { useEffect, useRef } from 'react'

/**
 * ホームの背景。黒地に白の粒子がゆっくり昇り、中央からさざ波の輪が広がって消える。
 * すべて白の濃淡だけ。減速モーション設定では粒子を止め、輪は出さない。
 */
const PARTICLES = 35
const RIPPLE_PERIOD = 7000 // ms
const RIPPLES = 3

interface Particle {
  x: number
  y: number
  r: number
  speed: number
  phase: number
  alpha: number
}

export function Backdrop({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(devicePixelRatio, 2)
    const resize = () => {
      c.width = Math.max(1, Math.round(c.clientWidth * dpr))
      c.height = Math.max(1, Math.round(c.clientHeight * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(c)

    const ps: Particle[] = Array.from({ length: PARTICLES }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.2,
      speed: 0.006 + Math.random() * 0.014, // 画面高さ / 秒
      phase: Math.random() * Math.PI * 2,
      alpha: 0.06 + Math.random() * 0.12,
    }))

    let raf = 0
    let last = -1e9
    let prev = performance.now()
    const draw = (now: number) => {
      if (!still) raf = requestAnimationFrame(draw)
      if (now - last < 33) return // 30fps
      last = now
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      const W = c.width
      const H = c.height
      ctx.clearRect(0, 0, W, H)

      // 粒子
      for (const p of ps) {
        if (!still) {
          p.y -= p.speed * dt
          if (p.y < -0.02) {
            p.y = 1.02
            p.x = Math.random()
          }
        }
        const x = (p.x + 0.012 * Math.sin(now / 3000 + p.phase)) * W
        const y = p.y * H
        ctx.beginPath()
        ctx.arc(x, y, p.r * dpr, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.alpha.toFixed(3)})`
        ctx.fill()
      }

      // さざ波: 全身図のあたり（上から 42%）を中心に、全身図の外側（r0）から広がりながら消える輪
      if (!still) {
        const cx = W / 2
        const cy = H * 0.42
        const r0 = Math.min(W, H) * 0.28
        const maxR = Math.max(W, H) * 0.7
        ctx.lineWidth = dpr
        for (let i = 0; i < RIPPLES; i++) {
          const f = ((now / RIPPLE_PERIOD + i / RIPPLES) % 1 + 1) % 1
          const r = r0 + f * (maxR - r0)
          const a = (1 - f) * (1 - f) * 0.1
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`
          ctx.stroke()
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
