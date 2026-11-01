import { describe, expect, it } from 'vitest'
import { anchorOf, inWeek, nextParts, partsOf, plannedSets, seedExercises, sumByPart } from './plan'
import { movementOf } from './presets'
import type { Exercise } from './types'

const ex = (id: string, c: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  equipment: 'barbell',
  body_part: 'chest',
  weight_step: 2.5,
  target_reps: 3,
  main_sets: 5,
  pyramid: true,
  backoff_ratio: 0.6,
  sort_order: 0,
  archived: false,
  ...c,
})

describe('nextParts', () => {
  it('一度も鍛えていなければ空', () => {
    expect(nextParts({}, '2026-11-01')).toEqual([])
  })

  it('一番空いている部位。同じ日に鍛えた部位はまとめて出す', () => {
    expect(nextParts({ chest: '2026-10-20', arms: '2026-10-20', back: '2026-10-25', legs: '2026-10-28' }, '2026-11-01')).toEqual([
      'chest',
      'arms',
    ])
  })

  it('同じ日でも、その後に鍛えた部位は出さない', () => {
    expect(nextParts({ chest: '2026-10-20', arms: '2026-10-30', back: '2026-10-25' }, '2026-11-01')).toEqual(['chest'])
  })

  it('しばらくやっていない部位は候補にしない', () => {
    expect(nextParts({ core: '2026-08-01', chest: '2026-10-20', back: '2026-10-25' }, '2026-11-01')).toEqual(['chest'])
  })

  it('最近どこも鍛えていなければ、鍛えたことのある部位から', () => {
    expect(nextParts({ core: '2026-08-01', chest: '2026-09-01' }, '2026-11-01')).toEqual(['core'])
  })
})

describe('partsOf', () => {
  it('多い順。同数なら先に出た順。部位なしは数えない', () => {
    expect(partsOf(['arms', 'chest', null, 'chest', undefined, 'back', 'arms', 'chest'])).toEqual(['chest', 'arms', 'back'])
  })

  it('空なら空', () => {
    expect(partsOf([])).toEqual([])
  })
})

describe('anchorOf', () => {
  it('その部位の軸の種目。アーカイブ済みや別の部位は除く', () => {
    const list = [
      ex('a', { anchor: true, archived: true }),
      ex('b', { anchor: true, body_part: 'back' }),
      ex('c'),
      ex('d', { anchor: true }),
    ]
    expect(anchorOf('chest', list)?.id).toBe('d')
    expect(anchorOf('back', list)?.id).toBe('b')
    expect(anchorOf('legs', list)).toBeUndefined()
  })
})

describe('seedExercises', () => {
  it('軸の種目を先頭に、前回の種目を続ける（重複なし）', () => {
    expect(seedExercises({ id: 'b' }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('前回がなくても軸の種目は入る', () => {
    expect(seedExercises({ id: 'b' }, []).map((e) => e.id)).toEqual(['b'])
  })

  it('軸がなければ前回のまま', () => {
    expect(seedExercises(undefined, [{ id: 'a' }]).map((e) => e.id)).toEqual(['a'])
  })
})

describe('movementOf', () => {
  it('設定した動きを優先', () => {
    expect(movementOf({ name: 'ベンチプレス', body_part: 'chest', movement: 'chest_fly' })).toBe('chest_fly')
  })

  it('未設定なら事前登録の同名の種目から引く', () => {
    expect(movementOf({ name: 'ベンチプレス', body_part: 'chest' })).toBe('chest_press')
    expect(movementOf({ name: '自作の種目', body_part: 'chest' })).toBeNull()
  })

  it('部位と合わない動きは無し', () => {
    expect(movementOf({ name: 'ベンチプレス', body_part: 'arms' })).toBeNull()
  })
})

describe('inWeek', () => {
  it('今日を含む直近7日', () => {
    expect(inWeek('2026-11-01', '2026-11-01')).toBe(true)
    expect(inWeek('2026-10-26', '2026-11-01')).toBe(true)
    expect(inWeek('2026-10-25', '2026-11-01')).toBe(false)
    expect(inWeek('2026-11-02', '2026-11-01')).toBe(false)
  })
})

describe('plannedSets', () => {
  it('メインセット + ピラミッドならバックオフ1', () => {
    expect(plannedSets({ main_sets: 5, pyramid: true })).toBe(6)
    expect(plannedSets({ main_sets: 3, pyramid: false })).toBe(3)
  })
})

describe('sumByPart', () => {
  it('部位ごとに足す。部位なしは数えない', () => {
    const m = sumByPart([
      { part: 'chest', sets: 6 },
      { part: 'arms', sets: 3 },
      { part: 'chest', sets: 3 },
      { part: null, sets: 4 },
    ])
    expect(Object.fromEntries(m)).toEqual({ chest: 9, arms: 3 })
  })
})
