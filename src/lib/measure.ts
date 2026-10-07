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
