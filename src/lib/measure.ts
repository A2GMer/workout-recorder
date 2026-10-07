import { GROWTH_KEYS, type Measurement, type MeasureKey } from './types'

/**
 * 今の値が過去いちばんか。大きくなる項目は最大、ウエストは最小。体重は判定しない（null）
 * list は新しい順
 */
export function isAtBest(list: Measurement[], k: MeasureKey): boolean | null {
  const now = list[0]?.[k]
  if (now == null || k === 'weight_kg') return null
  const others = list.slice(1).map((m) => m[k]).filter((v): v is number => v != null)
  if (!others.length) return null
  return k === 'waist' ? others.every((v) => now <= v) : others.every((v) => now >= v)
}

export interface BodySummary {
  /** 初回から大きくなった項目数（GROWTH_KEYS のうち） */
  grown: number
  /** 初回と比べられた項目数 */
  total: number
  /** 今が過去いちばん大きい項目数 */
  atBest: number
  /** 初回からいちばん伸びた項目 */
  top: { key: MeasureKey; delta: number } | null
}

/** 初回からの前進のまとめ。list は新しい順（2件以上で意味を持つ） */
export function bodySummary(list: Measurement[]): BodySummary {
  const latest = list[0]
  const first = list[list.length - 1]
  const out: BodySummary = { grown: 0, total: 0, atBest: 0, top: null }
  if (!latest || list.length < 2) return out
  for (const k of GROWTH_KEYS) {
    const a = latest[k]
    const b = first[k]
    if (a != null && b != null) {
      out.total++
      const d = Math.round((a - b) * 10) / 10
      if (d > 0) out.grown++
      if (d > 0 && (!out.top || d > out.top.delta)) out.top = { key: k, delta: d }
    }
    if (isAtBest(list, k)) out.atBest++
  }
  return out
}

/** 日付 YYYY-MM-DD に日数を足す（ローカル日付として扱う） */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(y, m - 1, d + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** 次の計測日。記録がなければ null（＝すぐ計測） */
export function nextMeasureDate(lastDate: string | null, intervalDays: number): string | null {
  return lastDate ? addDays(lastDate, intervalDays) : null
}

/** 計測の時期か */
export function isMeasureDue(lastDate: string | null, intervalDays: number, today: string): boolean {
  const next = nextMeasureDate(lastDate, intervalDays)
  return next === null || today >= next
}
