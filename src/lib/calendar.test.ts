import { describe, expect, it } from 'vitest'
import { addMonths, monthGrid } from './calendar'

describe('calendar', () => {
  it('2026年10月は木曜始まり・5週', () => {
    const g = monthGrid(2026, 10)
    expect(g.length).toBe(5)
    expect(g[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(g[4][6]).toBe('2026-10-31')
  })

  it('月外は null で埋め、必ず 7 列', () => {
    for (const w of monthGrid(2026, 2)) expect(w.length).toBe(7)
    expect(monthGrid(2026, 2).flat().filter(Boolean).length).toBe(28)
  })

  it('月の加算は年をまたぐ', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })
})
