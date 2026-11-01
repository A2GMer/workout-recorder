import { describe, expect, it } from 'vitest'
import { nextParts, partsOf } from './plan'

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
