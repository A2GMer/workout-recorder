import { describe, expect, it } from 'vitest'
import { bestE1rm, changeIn, e1rm, measureSeries, perWeek } from './growth'
import type { Measurement } from './types'

describe('e1rm', () => {
  it('Epley。1回ならその重量、0.5kg 刻み', () => {
    expect(e1rm(100, 1)).toBe(100)
    expect(e1rm(100, 3)).toBe(110)
    expect(e1rm(105, 3)).toBe(115.5)
    expect(e1rm(60, 8)).toBe(76)
    expect(e1rm(100, 0)).toBe(0)
  })
})

describe('bestE1rm', () => {
  it('メインセットのうち一番高いセット。チーティングは入れない', () => {
    const r = bestE1rm(
      [
        { weight_kg: 100, reps: 3, cheat_reps: 2 },
        { weight_kg: 95, reps: 5 },
        { weight_kg: 100, reps: 2 },
      ],
      'barbell',
      70,
    )
    expect(r?.value).toBe(111)
    expect(r?.set).toEqual({ weight_kg: 95, reps: 5 })
  })

  it('自重は体重込みで換算', () => {
    expect(bestE1rm([{ weight_kg: 10, reps: 3 }], 'bodyweight', 70)?.value).toBe(88)
  })

  it('換算できるセットがなければ null', () => {
    expect(bestE1rm([], 'barbell', 70)).toBeNull()
    expect(bestE1rm([{ weight_kg: 100, reps: 0 }], 'barbell', 70)).toBeNull()
  })
})

describe('measureSeries', () => {
  const m = (date: string, c: Partial<Measurement>): Measurement => ({
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
    ...c,
  })

  it('部位に並べる計測を古い順に。左右は平均、測っていない回は飛ばす', () => {
    const list = [m('2026-10-20', { arm_flexed_l: 36, arm_flexed_r: 37 }), m('2026-10-01', { arm_flexed_l: 35 }), m('2026-10-10', { chest: 100 })]
    expect(measureSeries('arms', list)).toEqual({
      label: '上腕（力こぶ）',
      points: [
        { date: '2026-10-01', value: 35 },
        { date: '2026-10-20', value: 36.5 },
      ],
    })
  })

  it('腹は並べない', () => {
    expect(measureSeries('core', [])).toBeNull()
  })
})

describe('changeIn', () => {
  const pts = [
    { date: '2026-09-20', value: 100 },
    { date: '2026-10-06', value: 102.5 },
    { date: '2026-10-20', value: 105 },
    { date: '2026-11-01', value: 107.5 },
  ]

  it('期間より前の最後の点から、期間内の最後の点まで', () => {
    expect(changeIn(pts, '2026-10-01', '2026-10-31')).toMatchObject({ start: { date: '2026-09-20' }, end: { date: '2026-10-20' }, delta: 5 })
  })

  it('前がなければ期間内の最初の点から', () => {
    expect(changeIn(pts, '2026-09-01', '2026-10-10')).toMatchObject({ start: { date: '2026-09-20' }, end: { date: '2026-10-06' }, delta: 2.5 })
  })

  it('期間内に点がない、または比べる相手がいなければ null', () => {
    expect(changeIn(pts, '2026-08-01', '2026-08-31')).toBeNull()
    expect(changeIn(pts.slice(0, 1), '2026-09-01', '2026-09-30')).toBeNull()
  })
})

describe('perWeek', () => {
  it('1週間あたり（小数1桁）', () => {
    expect(perWeek(31, 31)).toBe(7)
    expect(perWeek(10, 31)).toBe(2.3)
    expect(perWeek(5, 0)).toBe(0)
  })
})
