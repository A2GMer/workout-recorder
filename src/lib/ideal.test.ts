import { describe, expect, it } from 'vitest'
import { figureOf, idealTargets, proposals } from './ideal'
import type { Measurement } from './types'

const m = (v: Partial<Measurement>): Measurement => ({
  id: 'm',
  date: '2026-09-27',
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

const t = (ts: ReturnType<typeof idealTargets>, k: string) => ts!.find((x) => x.key === k)!

describe('idealTargets', () => {
  it('身長がなければ目標なし', () => {
    expect(idealTargets(m({ waist: 80 }), null)).toBeNull()
  })

  it('身長 170・ウエスト 80 → 基準ウエストは 76.5（170×0.45）。肩 1.618 倍、臀囲 ÷0.9、胸 ÷0.7', () => {
    const ts = idealTargets(m({ waist: 80 }), 170)
    expect(t(ts, 'waist').target).toBe(76.5)
    expect(t(ts, 'waist').gap).toBe(3.5) // 太い分が不足
    expect(t(ts, 'shoulders').target).toBe(124) // 76.5 × 1.618 = 123.8 → 124
    expect(t(ts, 'hip').target).toBe(85) // 76.5 / 0.9 = 85
    expect(t(ts, 'chest').target).toBe(109.5) // 76.5 / 0.7 = 109.3 → 109.5
    expect(t(ts, 'arm_flexed_l').target).toBe(39.5) // 109.3 × 0.36 = 39.3 → 39.5
    expect(t(ts, 'calf_l').target).toBe(37) // 109.3 × 0.34 = 37.2 → 37
  })

  it('ウエストが理想より細ければ今の値を基準にする（太るよう勧めない）', () => {
    const ts = idealTargets(m({ waist: 70 }), 170)
    expect(t(ts, 'waist').gap).toBeLessThan(0)
    expect(t(ts, 'shoulders').target).toBe(113.5) // 70 × 1.618 = 113.3
  })

  it('未計測の項目は gap が null', () => {
    const ts = idealTargets(m({ waist: 80 }), 170)
    expect(t(ts, 'chest').gap).toBeNull()
  })
})

describe('proposals', () => {
  it('不足の割合が大きい順。左右は弱い方。0.5cm 未満は達成扱い', () => {
    const ts = idealTargets(m({ waist: 76.5, shoulders: 118, chest: 109.5, arm_flexed_l: 36, arm_flexed_r: 37, hip: 85 }), 170)
    const ps = proposals(ts)
    // 肩 124-118 = 6 (4.8%) / 上腕 39.5-36 = 3.5 (8.9%) → 上腕が先
    expect(ps.map((p) => p.label)).toEqual(['上腕（力こぶ）', '肩周り'])
    expect(ps[0].gap).toBe(3.5)
    expect(ps[0].parts).toEqual(['arms'])
    expect(ps[1].parts).toEqual(['shoulders', 'back'])
  })

  it('身長がなければ空', () => {
    expect(proposals(null)).toEqual([])
  })
})

describe('figureOf', () => {
  it('足りない部位だけ lacking。未計測は目標で埋めて差を出さない', () => {
    const ts = idealTargets(m({ waist: 76.5, shoulders: 118 }), 170)
    const f = figureOf(m({ waist: 76.5, shoulders: 118 }), ts)
    expect(f.lacking.has('shoulders')).toBe(true)
    expect(f.lacking.has('chest')).toBe(false)
    expect(f.current.chest).toBe(f.target.chest)
    expect(f.deficit.shoulders).toBeCloseTo(6 / 124, 3)
  })

  it('身長がなければ標準体で、何も強調しない', () => {
    const f = figureOf(m({ waist: 90 }), null)
    expect(f.lacking.size).toBe(0)
    expect(f.current.waist).toBe(f.target.waist)
  })
})
