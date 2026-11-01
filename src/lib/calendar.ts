/** 月のカレンダー格子。日曜始まり。月外のマスは null。日付は YYYY-MM-DD */
export function monthGrid(year: number, month1: number): (string | null)[][] {
  const first = new Date(year, month1 - 1, 1)
  const days = new Date(year, month1, 0).getDate()
  const p = (n: number) => String(n).padStart(2, '0')
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${p(month1)}-${p(d)}`)
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** YYYY-MM に月を足す */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

/** YYYY-MM の範囲 [初日, 最終日] と日数。今月なら今日まで（ふりかえりの週平均を、まだ来ていない日で薄めない） */
export function monthRange(ym: string, today: string): { from: string; to: string; days: number } {
  const [y, m] = ym.split('-').map(Number)
  const last = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  const to = today.startsWith(ym) ? today : last
  return { from: `${ym}-01`, to, days: Number(to.slice(8)) }
}

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
