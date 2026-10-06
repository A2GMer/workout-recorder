import type { Equipment, Exercise } from './types'

export const BARBELL_KG = 20
const EPS = 1e-9

export interface Ctx {
  bodyWeight: number
  ezBarKg: number
}

export interface SetLike {
  weight_kg: number
  reps: number
}

export interface PrevPerformance {
  main: SetLike[]
  backoff: SetLike[]
  fatigue: number
  body_weight_kg: number
}

export interface Suggestion {
  /** null = 前回記録なし（重量は手動） */
  mainWeight: number | null
  mainReps: number[]
  /** 前回の種目ボリューム。前回なしは null */
  prevVolume: number | null
  achieved: boolean
  increase: number
}

export function barWeight(eq: Equipment, ezBarKg: number): number {
  if (eq === 'barbell') return BARBELL_KG
  if (eq === 'ez') return ezBarKg
  return 0
}

/** 最も近い step の倍数へ丸める（同距離なら軽い方） */
export function roundToStep(x: number, step: number): number {
  const q = x / step
  const lo = Math.floor(q + EPS)
  const r = q - lo > 0.5 + EPS ? lo + 1 : lo
  return fix(r * step)
}

/** 浮動小数の誤差を落とす */
export function fix(x: number): number {
  return Math.round(x * 1000) / 1000
}

export function effectiveWeight(eq: Equipment, weight: number, bodyWeight: number): number {
  return eq === 'bodyweight' ? bodyWeight + weight : weight
}

export function volume(sets: SetLike[], eq: Equipment, bodyWeight: number): number {
  return fix(sets.reduce((s, x) => s + effectiveWeight(eq, x.weight_kg, bodyWeight) * x.reps, 0))
}

export type FatigueLevel = 'light' | 'normal' | 'heavy'

export function fatigueLevel(f: number): FatigueLevel {
  if (f <= 33) return 'light'
  if (f <= 66) return 'normal'
  return 'heavy'
}

const INCREASE_MULT: Record<FatigueLevel, number> = { light: 3, normal: 2, heavy: 1 }

export function suggest(ex: Exercise, prev: PrevPerformance | null): Suggestion {
  const target = Array.from({ length: ex.main_sets }, () => ex.target_reps)
  if (!prev || prev.main.length === 0) {
    return { mainWeight: null, mainReps: target, prevVolume: null, achieved: false, increase: 0 }
  }
  const prevVolume = volume([...prev.main, ...prev.backoff], ex.equipment, prev.body_weight_kg)
  const maxW = Math.max(...prev.main.map((s) => s.weight_kg))
  const achieved =
    prev.main.length >= ex.main_sets &&
    prev.main.every((s) => s.weight_kg >= maxW - EPS && s.reps >= ex.target_reps)

  if (achieved) {
    const increase = fix(ex.weight_step * INCREASE_MULT[fatigueLevel(prev.fatigue)])
    return { mainWeight: fix(maxW + increase), mainReps: target, prevVolume, achieved, increase }
  }

  // 未達: 重量据え置き、一番少ないセットを +1
  const reps = target.map((t, i) => prev.main[i]?.reps ?? t)
  let lo = 0
  reps.forEach((r, i) => {
    if (r < reps[lo]) lo = i
  })
  reps[lo] += 1
  return { mainWeight: maxW, mainReps: reps, prevVolume, achieved, increase: 0 }
}

/**
 * 次回提案の挑戦度 (0〜1)。模様の激しさに使う。
 * 増量幅が大きいほど高い: 軽(+3刻み) > 普(+2刻み) > 重(+1刻み) > 未達の再挑戦(+1回) > 初回
 */
export function challenge(ex: Exercise, prev: PrevPerformance | null): number {
  if (!prev || prev.main.length === 0) return 0.2
  const s = suggest(ex, prev)
  if (!s.achieved) return 0.35
  return { light: 1, normal: 0.75, heavy: 0.55 }[fatigueLevel(prev.fatigue)]
}

/** バックオフ重量（記録する重量の単位で返す。自重は加重分） */
export function backoffWeight(ex: Exercise, mainWeight: number, ctx: Ctx): number {
  if (ex.equipment === 'bodyweight') {
    const eff = (ctx.bodyWeight + mainWeight) * ex.backoff_ratio
    return roundToStep(eff - ctx.bodyWeight, ex.weight_step)
  }
  const w = roundToStep(mainWeight * ex.backoff_ratio, ex.weight_step)
  return Math.max(w, barWeight(ex.equipment, ctx.ezBarKg), ex.weight_step)
}

/** 前回の種目ボリュームを上回るのに必要なバックオフ回数。計算不能なら null */
export function neededBackoffReps(
  prevVolume: number | null,
  mainVolume: number,
  backoffEffWeight: number,
): number | null {
  if (prevVolume === null || backoffEffWeight <= 0) return null
  const need = prevVolume - mainVolume + 1
  if (need <= 0) return 0
  return Math.ceil(need / backoffEffWeight - EPS)
}
