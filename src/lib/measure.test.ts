import { describe, expect, it } from 'vitest'
import { addDays, isMeasureDue, nextMeasureDate } from './measure'

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
