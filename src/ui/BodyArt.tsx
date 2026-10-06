import { useEffect, useId, useRef } from 'react'
import type { BodyPart } from '../lib/types'

/**
 * 部位を象徴する線画。intensity(0〜1) が高いほど線が増え、速く大きく揺れる。
 * 座標は [-1, 1] で組み立て、viewBox 200×200 に写す。
 *
 * 胸   : 胸骨から肩へ集まる扇（大胸筋の繊維）
 * 背中 : 上背部から腰へ絞れる V 字（広背筋）
 * 肩   : 重なるドーム（三角筋の丸み）
 * 腕   : 紡錘形に編まれた波（力こぶ）
 * 脚   : 上で外へ張り出し膝へ絞れる2本の柱（大腿四頭筋）
 * 腹   : 2×3 の区画（腹直筋）
 */

type Pt = [number, number]
type Gen = (t: number, k: number, d: number) => string[]

const S = (v: number) => (100 + v * 90).toFixed(1)
const P = ([x, y]: Pt) => `${S(x)} ${S(y)}`
const noise = (t: number, s: number) => 0.5 * Math.sin(t * 1.3 + s) + 0.5 * Math.sin(t * 2.1 + s * 1.7)
const count = (base: number, extra: number, k: number, d: number) =>
  Math.max(2, Math.round((base + extra * k) * d))
const wobble = (k: number) => 0.03 + 0.17 * k
/** 高強度のときだけ出る細かい震え */
const tremor = (t: number, k: number, s: number) => k * k * 0.035 * Math.sin(t * 9 + s * 2.3)

const chest: Gen = (t, k, d) => {
  const n = count(5, 6, k, d)
  const out = [`M${P([0, -0.6])}L${P([0, 0.5])}`]
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1)
      const a: Pt = [0, -0.55 + f]
      const b: Pt = [side * 0.92, -0.62 + f * 0.18]
      const c: Pt = [side * 0.55 + tremor(t, k, i), a[1] + 0.22 + 0.18 * f + wobble(k) * noise(t, i + side * 7)]
      out.push(`M${P(a)}Q${P(c)} ${P(b)}`)
    }
  }
  return out
}

const back: Gen = (t, k, d) => {
  const n = count(5, 6, k, d)
  const out = [`M${P([0, -0.85])}L${P([0, 0.92])}`]
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1)
      const a: Pt = [side * (0.18 + 0.74 * f), -0.72 + 0.12 * f]
      const b: Pt = [side * 0.06, 0.88]
      const c: Pt = [side * (0.15 + 0.8 * f) + wobble(k) * noise(t, i + side * 5) + tremor(t, k, i), 0.2]
      out.push(`M${P(a)}Q${P(c)} ${P(b)}`)
    }
  }
  return out
}

const shoulders: Gen = (t, k, d) => {
  const n = count(4, 5, k, d)
  const base = 0.4
  const out = [`M${P([-0.95, base])}L${P([0.95, base])}`]
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 1 : i / (n - 1)
    const r = 0.22 + 0.7 * f + wobble(k) * 0.5 * noise(t, i) + tremor(t, k, i)
    const ry = r * (1.05 + 0.15 * Math.sin(t * 0.8 + i))
    out.push(`M${P([-r, base])}A${(r * 90).toFixed(1)} ${(ry * 90).toFixed(1)} 0 0 1 ${P([r, base])}`)
  }
  return out
}

const arms: Gen = (t, k, d) => {
  const n = count(3, 4, k, d)
  const freq = 1.5 + 1.5 * k
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const amp = (0.25 + 0.5 * (i / Math.max(1, n - 1))) * (0.8 + 0.4 * k)
    for (const sign of [-1, 1]) {
      let p = ''
      for (let y = -1; y <= 1.0001; y += 0.05) {
        const env = Math.cos((y * Math.PI) / 2)
        const x = sign * amp * env * Math.sin((y + 1) * Math.PI * freq + t + i * 0.7) + env * tremor(t, k, i)
        p += `${p ? 'L' : 'M'}${P([x, y * 0.95])}`
      }
      out.push(p)
    }
  }
  return out
}

const legs: Gen = (t, k, d) => {
  const n = count(4, 4, k, d)
  const out: string[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1)
      const top: Pt = [side * (0.1 + 0.48 * f), -0.92]
      const bottom: Pt = [side * (0.16 + 0.14 * f), 0.92]
      const c1: Pt = [side * (0.18 + 0.7 * f) + wobble(k) * noise(t, i + side * 3) + tremor(t, k, i), -0.2]
      const c2: Pt = [side * (0.14 + 0.24 * f), 0.5]
      out.push(`M${P(top)}C${P(c1)} ${P(c2)} ${P(bottom)}`)
    }
  }
  return out
}

const core: Gen = (t, k, d) => {
  const m = count(1, 2, k, Math.min(1, d + 0.2))
  const out = [`M${P([0, -0.92])}L${P([0, 0.92])}`]
  const w = 0.66
  const h = 0.5
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 3; row++) {
      const x0 = col === 0 ? -0.08 - w : 0.08
      const y0 = -0.86 + row * (h + 0.11)
      for (let j = 0; j < m; j++) {
        const inset = j * 0.08
        const s = wobble(k) * 0.35 * noise(t, col * 3 + row + j) + tremor(t, k, row + j)
        const x = x0 + inset + s * (col ? 1 : -1)
        const y = y0 + inset
        const ww = w - inset * 2
        const hh = h - inset * 2
        const r = Math.min(ww, hh) * 0.3
        out.push(
          `M${P([x + r, y])}H${S(x + ww - r)}Q${P([x + ww, y])} ${P([x + ww, y + r])}V${S(y + hh - r)}` +
            `Q${P([x + ww, y + hh])} ${P([x + ww - r, y + hh])}H${S(x + r)}Q${P([x, y + hh])} ${P([x, y + hh - r])}` +
            `V${S(y + r)}Q${P([x, y])} ${P([x + r, y])}`,
        )
      }
    }
  }
  return out
}

const plain: Gen = (t, k, d) => {
  const n = count(3, 4, k, d)
  return Array.from({ length: n }, (_, i) => {
    const r = (0.25 + 0.65 * (i / Math.max(1, n - 1)) + wobble(k) * 0.3 * noise(t, i)) * 90
    return `M${100 - r} 100a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`
  })
}

const GENERATORS: Record<BodyPart, Gen> = { chest, back, shoulders, arms, legs, core }

export function BodyArt({
  parts,
  intensity = 0.3,
  detail = 1,
  clip = false,
  animate = true,
  className,
}: {
  parts: BodyPart[]
  intensity?: number
  /** 線の本数の倍率（小さいアイコンでは減らす） */
  detail?: number
  clip?: boolean
  animate?: boolean
  className?: string
}) {
  const g = useRef<SVGGElement>(null)
  const id = useId()
  const key = parts.join(',')

  useEffect(() => {
    const gens = parts.length ? parts.slice(0, 2).map((p) => GENERATORS[p]) : [plain]
    const k = Math.min(1, Math.max(0, intensity))
    const speed = 0.25 + 1.6 * k
    const still = !animate || matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = -1e9
    const draw = (now: number) => {
      if (!still) raf = requestAnimationFrame(draw)
      if (now - last < 33) return // 30fps で十分
      last = now
      const t = still ? 0 : (now / 1000) * speed
      g.current!.innerHTML = gens
        .map((gen, gi) =>
          gen(t + gi * 1.7, k, detail)
            .map((d, i) => `<path d="${d}" opacity="${(gi ? 0.55 : 1) * (0.55 + 0.45 * ((i % 3) / 2))}"/>`)
            .join(''),
        )
        .join('')
    }
    // 最初の1枚はすぐ描く（タブが裏にあっても空白にしない）
    draw(still ? 0 : performance.now())
    return () => cancelAnimationFrame(raf)
  }, [key, intensity, detail, animate]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth={clip ? 2.2 : 1} strokeLinecap="round" className={className} aria-hidden="true">
      {clip && (
        <>
          <defs>
            <clipPath id={id}>
              <circle cx="100" cy="100" r="92" />
            </clipPath>
          </defs>
          <circle cx="100" cy="100" r="92" />
        </>
      )}
      <g ref={g} clipPath={clip ? `url(#${id})` : undefined} transform={clip ? 'translate(100 100) scale(0.82) translate(-100 -100)' : undefined} />
    </svg>
  )
}
