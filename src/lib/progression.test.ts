import { describe, expect, it } from 'vitest'
import {
  backoffWeight,
  challenge,
  neededBackoffReps,
  roundToStep,
  suggest,
  volume,
  type PrevPerformance,
} from './progression'
import type { Exercise } from './types'

const bench: Exercise = {
  id: 'e1',
  name: 'ベンチ',
  equipment: 'barbell',
  weight_step: 2.5,
  target_reps: 3,
  main_sets: 5,
  pyramid: true,
  backoff_ratio: 0.6,
  sort_order: 0,
  archived: false,
}
const pullup: Exercise = { ...bench, id: 'e2', name: '懸垂', equipment: 'bodyweight' }
const ctx = { bodyWeight: 70, ezBarKg: 10, smithBarKg: 20 }

const sets = (w: number, ...reps: number[]) => reps.map((r) => ({ weight_kg: w, reps: r }))
const prev = (p: Partial<PrevPerformance>): PrevPerformance => ({
  main: [],
  backoff: [],
  fatigue: 50,
  body_weight_kg: 70,
  ...p,
})

describe('roundToStep', () => {
  it('最も近い倍数、同距離は軽い方', () => {
    expect(roundToStep(63, 2.5)).toBe(62.5)
    expect(roundToStep(61.5, 2.5)).toBe(62.5)
    expect(roundToStep(61.25, 2.5)).toBe(60)
    expect(roundToStep(-22, 2.5)).toBe(-22.5)
  })
})

describe('suggest', () => {
  it('前回なし', () => {
    const s = suggest(bench, null)
    expect(s.mainWeight).toBeNull()
    expect(s.mainReps).toEqual([3, 3, 3, 3, 3])
  })

  it('全セット達成: 軽 +7.5 / 普 +5 / 重 +2.5', () => {
    const main = sets(100, 3, 3, 3, 3, 3)
    expect(suggest(bench, prev({ main, fatigue: 10 })).mainWeight).toBe(107.5)
    expect(suggest(bench, prev({ main, fatigue: 50 })).mainWeight).toBe(105)
    expect(suggest(bench, prev({ main, fatigue: 90 })).mainWeight).toBe(102.5)
    expect(suggest(bench, prev({ main, fatigue: 90 })).mainReps).toEqual([3, 3, 3, 3, 3])
  })

  it('未達: 据え置きで一番少ないセットを +1', () => {
    const s = suggest(bench, prev({ main: sets(100, 3, 3, 3, 2, 2), fatigue: 0 }))
    expect(s.mainWeight).toBe(100)
    expect(s.mainReps).toEqual([3, 3, 3, 3, 2])
    expect(s.achieved).toBe(false)
  })

  it('セット数不足は未達扱い: 足りないセットを目標回数で足すだけ（済んだセットは増やさない）', () => {
    const s = suggest(bench, prev({ main: sets(100, 3, 3, 3, 3) }))
    expect(s.achieved).toBe(false)
    expect(s.mainWeight).toBe(100)
    expect(s.mainReps).toEqual([3, 3, 3, 3, 3])
    expect(suggest(bench, prev({ main: sets(100, 3, 3, 2, 2) })).mainReps).toEqual([3, 3, 2, 2, 3])
  })

  it('回数は揃ったが重量が揃っていない → 最大重量で目標回数（回数は増やさない）', () => {
    const s = suggest(bench, prev({ main: [...sets(100, 3, 3, 3), ...sets(95, 3, 3)] }))
    expect(s.achieved).toBe(false)
    expect(s.mainWeight).toBe(100)
    expect(s.mainReps).toEqual([3, 3, 3, 3, 3])
  })

  it('+1 しても目標回数は超えない', () => {
    const s = suggest(bench, prev({ main: sets(100, 3, 3, 3, 3, 2) }))
    expect(s.mainReps).toEqual([3, 3, 3, 3, 3])
    expect(Math.max(...s.mainReps)).toBeLessThanOrEqual(bench.target_reps)
  })

  it('チート分を除いた厳密回数が目標に届かなければ未達', () => {
    const s = suggest(bench, prev({ main: sets(100, 3, 3, 3, 3, 2) }))
    expect(s.achieved).toBe(false)
    expect(s.mainReps).toEqual([3, 3, 3, 3, 3])
  })

  it('前回ボリュームはバックオフ込み', () => {
    const s = suggest(bench, prev({ main: sets(100, 3, 3, 3, 3, 3), backoff: sets(60, 10) }))
    expect(s.prevVolume).toBe(2100)
  })

  it('自重は前回時点の体重で換算', () => {
    const s = suggest(pullup, prev({ main: sets(-10, 3, 3, 3, 3, 3), body_weight_kg: 70 }))
    expect(s.prevVolume).toBe(60 * 15)
    expect(s.mainWeight).toBe(-5) // 補助を 5kg 減らす
  })
})

describe('challenge', () => {
  const main = sets(100, 3, 3, 3, 3, 3)
  it('増量幅が大きいほど高い', () => {
    const light = challenge(bench, prev({ main, fatigue: 10 }))
    const normal = challenge(bench, prev({ main, fatigue: 50 }))
    const heavy = challenge(bench, prev({ main, fatigue: 90 }))
    const retry = challenge(bench, prev({ main: sets(100, 3, 3, 3, 2, 2) }))
    const first = challenge(bench, null)
    expect(light).toBeGreaterThan(normal)
    expect(normal).toBeGreaterThan(heavy)
    expect(heavy).toBeGreaterThan(retry)
    expect(retry).toBeGreaterThan(first)
  })
})

describe('backoff', () => {
  it('設計書の例: 105kg → 62.5kg × ≥9 で前回 2100 を超える', () => {
    const bw = backoffWeight(bench, 105, ctx)
    expect(bw).toBe(62.5)
    const mainV = volume(sets(105, 3, 3, 3, 3, 3), 'barbell', 70)
    expect(mainV).toBe(1575)
    expect(neededBackoffReps(2100, mainV, bw)).toBe(9)
  })

  it('バーベルはバー重量未満にしない', () => {
    expect(backoffWeight(bench, 25, ctx)).toBe(20)
  })

  it('自重は有効重量の60%を加重に換算', () => {
    expect(backoffWeight(pullup, 10, ctx)).toBe(-22.5)
  })

  it('メインで既に超えていれば 0、前回なしは null', () => {
    expect(neededBackoffReps(1000, 1500, 60)).toBe(0)
    expect(neededBackoffReps(null, 1500, 60)).toBeNull()
  })

  it('ちょうど +1 になる回数', () => {
    // 2100 - 1500 + 1 = 601 → 60kg なら 11回 (660)
    expect(neededBackoffReps(2100, 1500, 60)).toBe(11)
    // 2099 - 1500 + 1 = 600 → 10回ちょうど
    expect(neededBackoffReps(2099, 1500, 60)).toBe(10)
  })
})
