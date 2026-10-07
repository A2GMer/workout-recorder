import { useId } from 'react'
import type { DimKey, Figure } from '../lib/ideal'

/** 今と目標の差は小さい（数 cm）ので、目標の輪郭はこの倍率で誇張して描く */
const EXAGGERATE = 3

/**
 * 全身の幾何学図（正面）。周囲 cm を幅に写し、今の体を灰の線、目標の体を白の破線で重ねる。
 * 足りない部位は、その部位の面を斜線で埋めてゆっくり明滅させる（不足が大きいほど濃い）。
 * 幅は周囲から単純に写した象徴的なもの（胴は周囲 ÷ 2.4、腕脚は周囲 ÷ π）。
 */
export function FigureArt({ figure, heightCm, showTarget, className }: {
  figure: Figure
  heightCm: number
  /** 目標の輪郭と斜線を描くか（身長がなければ false） */
  showTarget: boolean
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const W = 200
  const H = 280
  const Y0 = 10
  const s = H / heightCm // px / cm
  const y = (f: number) => Y0 + H * f
  const torsoHalf = (c: number) => (c / 2.4 / 2) * s
  const limbHalf = (c: number) => (c / Math.PI / 2) * s

  // 縦の位置（身長に対する割合）
  const Y = { shoulder: 0.19, chest: 0.29, waist: 0.42, hip: 0.52, knee: 0.73, ankle: 0.96, elbow: 0.44, wrist: 0.63 }

  type Pt = [number, number]
  const P = ([x, yy]: Pt) => `${x.toFixed(1)} ${yy.toFixed(1)}`
  const poly = (pts: Pt[]) => `M${pts.map(P).join('L')}Z`

  /** 胴の右半分の輪郭点（肩 → 胸 → ウエスト → 腰） */
  const torso = (d: Figure['current']): Pt[] => [
    [torsoHalf(d.shoulders), y(Y.shoulder)],
    [torsoHalf(d.chest), y(Y.chest)],
    [torsoHalf(d.waist), y(Y.waist)],
    [torsoHalf(d.hip), y(Y.hip)],
  ]
  const torsoPath = (d: Figure['current']) => {
    const r = torso(d)
    const l = [...r].reverse().map(([x, yy]): Pt => [-x, yy])
    return poly([...r, ...l])
  }

  /** 腕: 肩の外端から下へ、少し外に開く。上腕と前腕の2つの四角形 */
  const armSegs = (d: Figure['current']) => {
    const x0 = torsoHalf(d.shoulders) - limbHalf(d.arm) * 0.4
    const x1 = x0 + 5
    const x2 = x1 + 6
    const upper = quad(x0, y(Y.shoulder) + 4, x1, y(Y.elbow), limbHalf(d.arm), limbHalf(d.arm) * 0.9)
    const fore = quad(x1, y(Y.elbow), x2, y(Y.wrist), limbHalf(d.forearm), limbHalf(d.forearm) * 0.7)
    return { arm: upper, forearm: fore }
  }
  /** 脚: 腰の下から真っ直ぐ。大腿とふくらはぎの2つの四角形 */
  const legSegs = (d: Figure['current']) => {
    const cx = torsoHalf(d.hip) * 0.5
    const thigh = quad(cx, y(Y.hip), cx, y(Y.knee), limbHalf(d.thigh), limbHalf(d.thigh) * 0.75)
    const calf = quad(cx, y(Y.knee), cx, y(Y.ankle), limbHalf(d.calf), limbHalf(d.calf) * 0.6)
    return { thigh, calf }
  }
  /** 中心線 (cx0,y0)→(cx1,y1) に半幅 w0→w1 の四角形。右側。[外上, 外下, 内下, 内上] */
  function quad(cx0: number, y0: number, cx1: number, y1: number, w0: number, w1: number): Pt[] {
    return [
      [cx0 + w0, y0],
      [cx1 + w1, y1],
      [cx1 - w1, y1],
      [cx0 - w0, y0],
    ]
  }
  const mirror = (pts: Pt[]): Pt[] => pts.map(([x, yy]) => [-x, yy])

  /** 胴の右端 x を高さ yy で線形補間 */
  function edgeX(pts: Pt[], yy: number): number {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      if (yy >= y0 && yy <= y1) return x0 + ((x1 - x0) * (yy - y0)) / (y1 - y0)
    }
    return yy < pts[0][1] ? pts[0][0] : pts[pts.length - 1][0]
  }
  /** 胴を肩・胸・ウエスト・腰の4つの帯に分け、その帯の面（左右）を返す */
  function torsoBand(pts: Pt[], key: DimKey): Pt[] {
    const ys = pts.map((p) => p[1])
    const mid = (a: number, b: number) => (a + b) / 2
    const range: Record<string, [number, number]> = {
      shoulders: [ys[0], mid(ys[0], ys[1])],
      chest: [mid(ys[0], ys[1]), mid(ys[1], ys[2])],
      waist: [mid(ys[1], ys[2]), mid(ys[2], ys[3])],
      hip: [mid(ys[2], ys[3]), ys[3]],
    }
    const [top, bottom] = range[key]
    const inner = pts.filter((p) => p[1] > top && p[1] < bottom)
    const right: Pt[] = [[edgeX(pts, top), top], ...inner, [edgeX(pts, bottom), bottom]]
    return [...right, ...mirror([...right].reverse())]
  }

  const cur = figure.current
  // 目標は差を誇張して描く（ウエストは細くなる方向）
  const tgt = { ...figure.target }
  for (const k of Object.keys(tgt) as DimKey[]) tgt[k] = cur[k] + (figure.target[k] - cur[k]) * EXAGGERATE
  const curArm = armSegs(cur)
  const tgtArm = armSegs(tgt)
  const curLeg = legSegs(cur)
  const tgtLeg = legSegs(tgt)
  const tgtTorso = torso(tgt)

  // 足りない部位の面（目標の形で）。不足が大きいほど濃く
  const hatch: { d: string; k: DimKey }[] = []
  if (showTarget) {
    for (const k of ['shoulders', 'chest', 'waist', 'hip'] as DimKey[]) {
      if (figure.lacking.has(k)) hatch.push({ d: poly(torsoBand(tgtTorso, k)), k })
    }
    const limbs: [DimKey, Pt[]][] = [
      ['arm', tgtArm.arm],
      ['forearm', tgtArm.forearm],
      ['thigh', tgtLeg.thigh],
      ['calf', tgtLeg.calf],
    ]
    for (const [k, pts] of limbs) if (figure.lacking.has(k)) hatch.push({ d: poly(pts), k }, { d: poly(mirror(pts)), k })
  }
  const weight = (k: DimKey) => Math.min(1, 0.45 + figure.deficit[k] * 5)
  const both = (pts: Pt[]) => [poly(pts), poly(mirror(pts))]
  const limbPaths = (a: ReturnType<typeof armSegs>, l: ReturnType<typeof legSegs>) =>
    [...both(a.arm), ...both(a.forearm), ...both(l.thigh), ...both(l.calf)]

  const headR = H * 0.06
  const headY = Y0 + headR + 2
  const neckW = 7

  return (
    <svg viewBox={`-${W / 2} 0 ${W} ${H + Y0 * 2}`} fill="none" stroke="currentColor" strokeWidth={1} className={className} aria-hidden="true">
      <defs>
        <pattern id={`${id}-h`} patternUnits="userSpaceOnUse" width={3} height={3}>
          <path d="M0 3L3 0" stroke="currentColor" strokeWidth={0.5} />
        </pattern>
      </defs>
      {/* 頭と首 */}
      <g className="text-fg" vectorEffect="non-scaling-stroke">
        <circle cx={0} cy={headY} r={headR} />
        <path d={`M-${neckW} ${headY + headR - 1}V${y(Y.shoulder)}M${neckW} ${headY + headR - 1}V${y(Y.shoulder)}`} />
      </g>
      {/* 今の体 */}
      <g className={showTarget ? 'text-dim' : 'text-fg'}>
        <path d={torsoPath(cur)} />
        {limbPaths(curArm, curLeg).map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {/* 目標の体 */}
      {showTarget && (
        <g className="text-fg" strokeDasharray="2 3">
          <path d={torsoPath(tgt)} />
          {limbPaths(tgtArm, tgtLeg).map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      )}
      {/* 足りないところ: その部位の面を斜線で。不足が大きいほど濃い */}
      {hatch.length > 0 && (
        <g className="hatch-pulse text-fg" stroke="none" fill={`url(#${id}-h)`}>
          {hatch.map(({ d, k }, i) => (
            <path key={i} d={d} opacity={weight(k)} />
          ))}
        </g>
      )}
    </svg>
  )
}
