import { describe, expect, it } from 'vitest'
import { addDays, bodySummary, isAtBest, isMeasureDue, nextMeasureDate } from './measure'
import type { Measurement } from './types'

const m = (date: string, v: Partial<Measurement>): Measurement => ({
  id: date,
  date,
  weight_kg: null,
  waist: null,
  chest: null,
  shoulders: null,
  arm_relaxed_l: null,
  arm_relaxed_r: null,
  arm_flexed_l: null,
  arm_flexed_r: null,
  forearm_l: null,
  forearm_r: null,
  thigh_l: null,
  thigh_r: null,
  calf_l: null,
  calf_r: null,
  hip: null,
  ...v,
})

describe('body progress', () => {
  // 新しい順
  const list = [
    m('2026-09-27', { weight_kg: 72, waist: 79.5, chest: 100, arm_flexed_l: 37, thigh_l: 56.5 }),
    m('2026-09-13', { weight_kg: 71, waist: 80, chest: 99, arm_flexed_l: 36.5, thigh_l: 57 }),
    m('2026-08-30', { weight_kg: 70, waist: 80, chest: 98, arm_flexed_l: 36, thigh_l: 56 }),
  ]

  it('今が過去いちばんか: 大きくなる項目は最大、ウエストは最小、体重は判定しない', () => {
    expect(isAtBest(list, 'chest')).toBe(true)
    expect(isAtBest(list, 'thigh_l')).toBe(false) // 57 → 56.5 と落ちた
    expect(isAtBest(list, 'waist')).toBe(true)
    expect(isAtBest(list, 'weight_kg')).toBeNull()
    expect(isAtBest(list, 'hip')).toBeNull() // 記録なし
  })

  it('初回からのまとめ: 伸びた項目数・今が最大の数・いちばん伸びた項目', () => {
    const s = bodySummary(list)
    expect(s.total).toBe(3) // chest, arm_flexed_l, thigh_l（体重・ウエストは数えない）
    expect(s.grown).toBe(3)
    expect(s.atBest).toBe(2) // chest, arm_flexed_l
    expect(s.top).toEqual({ key: 'chest', delta: 2 })
  })

  it('1件だけなら何も言わない', () => {
    expect(bodySummary(list.slice(0, 1))).toEqual({ grown: 0, total: 0, atBest: 0, top: null })
  })
})

describe('measure reminder', () => {
  it('月またぎの日付計算', () => {
    expect(addDays('2026-09-27', 14)).toBe('2026-10-11')
    expect(addDays('2026-12-25', 14)).toBe('2027-01-08')
  })

  it('9/27 計測・2週間おき → 10/11 から促す', () => {
    expect(nextMeasureDate('2026-09-27', 14)).toBe('2026-10-11')
    expect(isMeasureDue('2026-09-27', 14, '2026-10-10')).toBe(false)
    expect(isMeasureDue('2026-09-27', 14, '2026-10-11')).toBe(true)
    expect(isMeasureDue('2026-09-27', 14, '2026-11-01')).toBe(true)
  })

  it('記録がなければすぐ促す', () => {
    expect(isMeasureDue(null, 14, '2026-10-07')).toBe(true)
  })
})
