import { GROWTH_KEYS, MEASURE_ITEMS, type BodyPart, type Measurement, type MeasureKey } from './types'

/**
 * プロポーションの推奨目標（独自ロジック）。
 *
 * 根拠にした指標:
 * - ウエスト / 身長 = 0.45    … WHtR。健康と見た目の両面で良いとされる 0.40〜0.50 の中央
 * - 肩周り / ウエスト = 1.618 … 黄金比（いわゆる Adonis index）。男性が最も魅力的に映る肩と腰の比
 * - ウエスト / 臀囲 = 0.90    … 男性で最も魅力的と評価された WHR（Singh の一連の研究）
 * - 胸囲 = ウエスト ÷ 0.70、上腕 = 胸囲 × 0.36、前腕 × 0.29、大腿 × 0.53、ふくらはぎ × 0.34
 *                           … McCallum の古典的な理想比率（上腕 ≒ ふくらはぎ、Reeves の対称律とも整合）
 *
 * 基準となるウエストは「今のウエスト」と「身長 × 0.45」の小さい方。
 * ウエストが理想より太ければ理想値を基準にし（細くする側の目標が立つ）、
 * すでに細ければ今の値を基準にする（細い人に太るよう勧めない）。
 */
export const IDEAL = {
  waistToHeight: 0.45,
  shouldersToWaist: 1.618,
  waistToHip: 0.9,
  chestToWaist: 1 / 0.7,
  armToChest: 0.36,
  forearmToChest: 0.29,
  thighToChest: 0.53,
  calfToChest: 0.34,
} as const

/** 目標を立てる項目と、鍛える部位 */
export const PART_OF_MEASURE: Partial<Record<MeasureKey, BodyPart[]>> = {
  waist: ['core'],
  chest: ['chest'],
  shoulders: ['shoulders', 'back'],
  arm_flexed_l: ['arms'],
  arm_flexed_r: ['arms'],
  forearm_l: ['arms'],
  forearm_r: ['arms'],
  thigh_l: ['legs'],
  thigh_r: ['legs'],
  calf_l: ['legs'],
  calf_r: ['legs'],
  hip: ['legs'],
}

export interface Target {
  key: MeasureKey
  target: number
  current: number | null
  /** 足りない量 cm。ウエストは超過分。マイナスは達成済み。未計測は null */
  gap: number | null
}

const half = (x: number) => Math.round(x * 2) / 2

/** 身長と直近の計測から各項目の目標。身長がなければ null */
export function idealTargets(m: Measurement | null, heightCm: number | null): Target[] | null {
  if (!heightCm) return null
  const idealWaist = heightCm * IDEAL.waistToHeight
  const anchor = m?.waist != null ? Math.min(m.waist, idealWaist) : idealWaist
  const chest = anchor * IDEAL.chestToWaist
  const by: Partial<Record<MeasureKey, number>> = {
    waist: idealWaist,
    shoulders: anchor * IDEAL.shouldersToWaist,
    hip: anchor / IDEAL.waistToHip,
    chest,
    arm_flexed_l: chest * IDEAL.armToChest,
    arm_flexed_r: chest * IDEAL.armToChest,
    forearm_l: chest * IDEAL.forearmToChest,
    forearm_r: chest * IDEAL.forearmToChest,
    thigh_l: chest * IDEAL.thighToChest,
    thigh_r: chest * IDEAL.thighToChest,
    calf_l: chest * IDEAL.calfToChest,
    calf_r: chest * IDEAL.calfToChest,
  }
  return (Object.keys(by) as MeasureKey[]).map((key) => {
    const target = half(by[key]!)
    const current = m?.[key] ?? null
    const gap = current == null ? null : half(key === 'waist' ? current - target : target - current)
    return { key, target, current, gap }
  })
}

export interface Proposal {
  label: string
  keys: MeasureKey[]
  /** 足りない量 cm（左右があれば弱い方） */
  gap: number
  /** 目標に対する不足の割合。強調と並び順に使う */
  ratio: number
  parts: BodyPart[]
}

/** 足りない項目を、不足の割合が大きい順に。tol cm 未満の差は達成扱い */
export function proposals(targets: Target[] | null, tol = 0.5): Proposal[] {
  if (!targets) return []
  const out: Proposal[] = []
  for (const item of MEASURE_ITEMS) {
    const ts = item.keys.map((k) => targets.find((t) => t.key === k)).filter((t): t is Target => !!t && t.gap !== null)
    if (!ts.length) continue
    const worst = ts.reduce((a, b) => (b.gap! > a.gap! ? b : a))
    if (worst.gap! < tol) continue
    out.push({
      label: item.label,
      keys: item.keys,
      gap: worst.gap!,
      ratio: worst.gap! / worst.target,
      parts: PART_OF_MEASURE[worst.key] ?? [],
    })
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}

/** 全身図に使う寸法（周囲 cm）。左右は平均 */
export type DimKey = 'shoulders' | 'chest' | 'waist' | 'hip' | 'arm' | 'forearm' | 'thigh' | 'calf'
export type Dims = Record<DimKey, number>
const DIM_KEYS: Record<DimKey, MeasureKey[]> = {
  shoulders: ['shoulders'],
  chest: ['chest'],
  waist: ['waist'],
  hip: ['hip'],
  arm: ['arm_flexed_l', 'arm_flexed_r'],
  forearm: ['forearm_l', 'forearm_r'],
  thigh: ['thigh_l', 'thigh_r'],
  calf: ['calf_l', 'calf_r'],
}

/** 計測も身長もないときの標準体（身長 170 の目標比） */
const FALLBACK = idealTargets(null, 170)!

export interface Figure {
  current: Dims
  target: Dims
  /** 足りない部位。tol 以上の不足 */
  lacking: Set<DimKey>
  /** 部位ごとの不足の割合（0〜）。強調の強さに使う */
  deficit: Record<DimKey, number>
}

/** 全身図の入力。計測がない項目は目標値で埋める（差を出さない） */
export function figureOf(m: Measurement | null, targets: Target[] | null, tol = 0.5): Figure {
  const ts = targets ?? FALLBACK
  const avg = (keys: MeasureKey[], pick: (k: MeasureKey) => number | null | undefined) => {
    const vs = keys.map(pick).filter((v): v is number => v != null)
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
  }
  const current = {} as Dims
  const target = {} as Dims
  const deficit = {} as Record<DimKey, number>
  const lacking = new Set<DimKey>()
  for (const d of Object.keys(DIM_KEYS) as DimKey[]) {
    const keys = DIM_KEYS[d]
    target[d] = avg(keys, (k) => ts.find((t) => t.key === k)?.target) ?? 0
    current[d] = (targets ? avg(keys, (k) => m?.[k]) : null) ?? target[d]
    const gap = d === 'waist' ? current[d] - target[d] : target[d] - current[d]
    deficit[d] = Math.max(0, gap / target[d])
    if (targets && gap >= tol) lacking.add(d)
  }
  return { current, target, lacking, deficit }
}

/** GROWTH_KEYS のうち目標を持つもの（からだ画面の表示用） */
export const TARGET_KEYS: MeasureKey[] = ['waist', ...GROWTH_KEYS.filter((k) => k !== 'arm_relaxed_l' && k !== 'arm_relaxed_r')]
