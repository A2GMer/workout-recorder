import { useEffect, useRef } from 'react'
import type { DimKey, Figure } from '../lib/ideal'

/**
 * 全身のワイヤーフレーム（3D）。周囲 cm から断面の輪を積み上げ、経線でつないだ幾何学の格子。
 * 左右のスワイプで回転し、放すと惰性で回り、触らなければゆっくり回り続ける。
 * 奥の線は薄く、手前の線は濃く。足りない部位は輪が白く、目標の輪が破線で重なって明滅する。
 * 寸法は周囲から写した象徴的なもの（胴は横長の楕円、腕脚は円）。差は小さいので目標は EXAGGERATE 倍に誇張。
 */
const EXAGGERATE = 3
const N = 24 // 輪の点の数
const MERIDIANS = 6 // 経線の本数

/**
 * 縦の位置（身長に対する割合）。人体の標準比率に合わせる。計測値ではここは変わらない
 * 肩 0.18 / 胸 0.27 / へそ 0.40 / 股 0.50 / 肘 0.41 / 手首 0.56 / 膝 0.73 / くるぶし 0.95
 */
const Y = { shoulder: 0.18, chest: 0.27, waist: 0.4, hip: 0.5, elbow: 0.41, wrist: 0.56, knee: 0.73, ankle: 0.95 }
const W = 200
const H = 280
const Y0 = 12

type Part = DimKey | 'head' | 'neck'
interface Ring {
  y: number // cm（頭頂から）
  cx: number // cm（左右）
  rx: number
  rz: number
  part: Part
  target?: { rx: number; rz: number }
}
/** 輪のつながり（経線を引く範囲） */
type Segment = Ring[]

const TAU = Math.PI * 2

function torsoSection(c: number) {
  const r = c / TAU
  return { rx: r * 1.35, rz: r * 0.65 }
}
function limbSection(c: number) {
  const r = c / TAU
  return { rx: r, rz: r }
}

/** 寸法から輪の列（セグメントごと）を組み立てる */
export function buildSegments(figure: Figure, heightCm: number, showTarget: boolean): Segment[] {
  const h = heightCm
  const cur = figure.current
  const tgt = { ...figure.target }
  for (const k of Object.keys(tgt) as DimKey[]) tgt[k] = cur[k] + (figure.target[k] - cur[k]) * EXAGGERATE
  const lacking = (k: DimKey) => showTarget && figure.lacking.has(k)
  const segs: Segment[] = []

  // 頭: 球の緯線（3本）
  const headR = h * 0.058
  const headY = Y0 / (H / h) + headR
  const head: Segment = []
  for (const deg of [-50, -5, 40]) {
    const a = (deg * Math.PI) / 180
    head.push({ y: headY + headR * Math.sin(a), cx: 0, rx: headR * Math.cos(a), rz: headR * Math.cos(a), part: 'head' })
  }
  segs.push(head)
  // 首（1本。経線で頭と肩をつなぐために2点）
  segs.push([
    { y: h * 0.14, cx: 0, rx: h * 0.034, rz: h * 0.034, part: 'neck' },
    { y: h * 0.17, cx: 0, rx: h * 0.038, rz: h * 0.038, part: 'neck' },
  ])

  // 胴: 肩 → 胸 → ウエスト → 腰 を補間（7本）
  const keys: { f: number; k: DimKey }[] = [
    { f: Y.shoulder, k: 'shoulders' },
    { f: Y.chest, k: 'chest' },
    { f: Y.waist, k: 'waist' },
    { f: Y.hip, k: 'hip' },
  ]
  const torso: Segment = []
  const torsoStep = (Y.hip - Y.shoulder) / 6
  for (let f = Y.shoulder; f <= Y.hip + 1e-6; f += torsoStep) {
    let i = 0
    while (i < keys.length - 2 && f > keys[i + 1].f) i++
    const a = keys[i]
    const b = keys[i + 1]
    const t = (f - a.f) / (b.f - a.f)
    const c = cur[a.k] + (cur[b.k] - cur[a.k]) * t
    const ct = tgt[a.k] + (tgt[b.k] - tgt[a.k]) * t
    const part = t < 0.5 ? a.k : b.k
    const ring: Ring = { y: h * f, cx: 0, ...torsoSection(c), part }
    if (lacking(part)) ring.target = torsoSection(ct)
    torso.push(ring)
  }
  segs.push(torso)

  /** 等間隔に n 本の輪（両端を含む） */
  const span = (from: number, to: number, n: number, make: (f: number, t: number) => Ring): Ring[] =>
    Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1)
      return make(from + (to - from) * t, t)
    })

  // 腕: 肩の外側から、少し外へ開きながら下へ（上腕3本・前腕3本）
  const shoulderRx = torsoSection(cur.shoulders).rx
  for (const side of [-1, 1]) {
    const armR = limbSection(cur.arm).rx
    const x0 = side * (shoulderRx + armR * 0.75)
    const upper = span(Y.shoulder + 0.02, Y.elbow, 3, (f, t) => {
      const taper = 1 - 0.12 * t
      const ring: Ring = { y: h * f, cx: x0 + side * h * 0.012 * t, ...limbSection(cur.arm * taper), part: 'arm' }
      if (lacking('arm')) ring.target = limbSection(tgt.arm * taper)
      return ring
    })
    const fore = span(Y.elbow + 0.03, Y.wrist, 3, (f, t) => {
      const taper = 1 - 0.3 * t
      const ring: Ring = { y: h * f, cx: x0 + side * h * (0.012 + 0.02 * t), ...limbSection(cur.forearm * taper), part: 'forearm' }
      if (lacking('forearm')) ring.target = limbSection(tgt.forearm * taper)
      return ring
    })
    segs.push([...upper, ...fore])
  }

  // 脚: 腰の下から真っ直ぐ（大腿4本・ふくらはぎ4本）
  const hipRx = torsoSection(cur.hip).rx
  for (const side of [-1, 1]) {
    const cx = side * hipRx * 0.5
    const thigh = span(Y.hip + 0.02, Y.knee, 4, (f, t) => {
      const taper = 1 - 0.25 * t
      const ring: Ring = { y: h * f, cx, ...limbSection(cur.thigh * taper), part: 'thigh' }
      if (lacking('thigh')) ring.target = limbSection(tgt.thigh * taper)
      return ring
    })
    const calf = span(Y.knee + 0.03, Y.ankle, 4, (f, t) => {
      const taper = t < 0.3 ? 1 : 1 - 0.4 * ((t - 0.3) / 0.7)
      const ring: Ring = { y: h * f, cx, ...limbSection(cur.calf * taper), part: 'calf' }
      if (lacking('calf')) ring.target = limbSection(tgt.calf * taper)
      return ring
    })
    segs.push([...thigh, ...calf])
  }
  return segs
}

export function FigureArt({ figure, heightCm, showTarget, className }: {
  figure: Figure
  heightCm: number
  /** 目標の輪を描くか（身長がなければ false） */
  showTarget: boolean
  className?: string
}) {
  const g = useRef<SVGGElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const yaw = useRef(-0.35)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const lastX = useRef(0)

  useEffect(() => {
    const segs = buildSegments(figure, heightCm, showTarget)
    const lacking = showTarget ? figure.lacking : new Set<DimKey>()
    const s = H / heightCm // px / cm
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const maxR = 32 // 奥行きの濃淡に使う（cm）

    let raf = 0
    let last = -1e9
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 33) return // 30fps
      last = now
      if (!dragging.current) {
        if (Math.abs(velocity.current) > 0.0005) {
          yaw.current += velocity.current
          velocity.current *= 0.94
        } else if (!still) {
          yaw.current += 0.004
        }
      }
      const th = yaw.current
      const cos = Math.cos(th)
      const sin = Math.sin(th)
      const pulse = still ? 0.8 : 0.55 + 0.45 * Math.sin(now / 420)

      type P = { x: number; y: number; z: number }
      const project = (ring: Ring, k: number, rx: number, rz: number): P => {
        const a = (k / N) * TAU
        const x = ring.cx + rx * Math.cos(a)
        const z = rz * Math.sin(a)
        const xr = x * cos + z * sin
        const zr = -x * sin + z * cos
        const p = 1 / (1 + zr / 420) // わずかな遠近
        return { x: W / 2 + xr * s * p, y: Y0 + ring.y * s * p, z: zr }
      }
      const path = (pts: P[], close: boolean) =>
        pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + (close ? 'Z' : '')
      const depth = (z: number) => 0.22 + 0.78 * Math.min(1, Math.max(0, (z + maxR) / (2 * maxR)))

      const out: string[] = []
      for (const seg of segs) {
        // 輪: 手前半分と奥半分で濃さを変えるため、点ごとに短い線で描く
        for (const ring of seg) {
          const isLack = lacking.has(ring.part as DimKey)
          const base = ring.part === 'head' || ring.part === 'neck' ? 0.7 : isLack ? 1 : 0.5
          const pts = Array.from({ length: N }, (_, k) => project(ring, k, ring.rx, ring.rz))
          for (let k = 0; k < N; k++) {
            const a = pts[k]
            const b = pts[(k + 1) % N]
            const o = base * depth((a.z + b.z) / 2)
            out.push(`<path d="M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}" opacity="${o.toFixed(2)}"/>`)
          }
          if (ring.target) {
            const tp = Array.from({ length: N }, (_, k) => project(ring, k, ring.target!.rx, ring.target!.rz))
            const zAvg = tp.reduce((m, p) => m + p.z, 0) / N
            out.push(
              `<path d="${path(tp, true)}" stroke-dasharray="1.5 2.5" opacity="${(pulse * depth(zAvg)).toFixed(2)}"/>`,
            )
          }
        }
        // 経線
        for (let m = 0; m < MERIDIANS; m++) {
          const k = Math.round((m / MERIDIANS) * N)
          const pts = seg.map((ring) => project(ring, k, ring.rx, ring.rz))
          const zAvg = pts.reduce((acc, p) => acc + p.z, 0) / pts.length
          const isLack = seg.some((r) => lacking.has(r.part as DimKey))
          const o = (isLack ? 0.9 : 0.45) * depth(zAvg)
          out.push(`<path d="${path(pts, false)}" opacity="${o.toFixed(2)}"/>`)
        }
      }
      if (g.current) g.current.innerHTML = out.join('')
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [figure, heightCm, showTarget])

  // スワイプで回す（縦のスクロールは邪魔しない）
  function down(e: React.PointerEvent) {
    dragging.current = true
    lastX.current = e.clientX
    velocity.current = 0
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return
    const w = svgRef.current?.clientWidth || W
    const d = ((e.clientX - lastX.current) / w) * Math.PI * 1.2
    lastX.current = e.clientX
    yaw.current += d
    velocity.current = d
  }
  function up() {
    dragging.current = false
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H + Y0 * 2}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={0.65}
      strokeLinecap="round"
      className={`touch-pan-y cursor-grab select-none active:cursor-grabbing ${className ?? ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      aria-label="全身図。左右にスワイプで回転"
      role="img"
    >
      <g ref={g} />
    </svg>
  )
}
