import { effectiveWeight, fix, type SetLike } from './progression'
import { MEASURE_ITEMS, type BodyPart, type Equipment, type Measurement } from './types'

/**
 * 推定1RM（Epley）: 重量 × (1 + 回数 / 30)。1回ならその重量。0.5kg 刻みに丸める。
 * 回数が違う日同士でも比べられるように、重量と回数を「1回だけ挙げられる重さ」に換算する
 */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0
  const v = reps === 1 ? weight : weight * (1 + reps / 30)
  return fix(Math.round(v * 2) / 2)
}

/**
 * その回の推定1RM: メインセットのうち一番高いセット。回数は厳密回数（チーティングは入れない）。
 * 自重種目は体重込みの有効重量で換算する。換算できるセットがなければ null
 */
export function bestE1rm(main: SetLike[], eq: Equipment, bodyWeight: number): { value: number; set: SetLike } | null {
  let best: { value: number; set: SetLike } | null = null
  for (const s of main) {
    if (s.reps <= 0) continue
    const value = e1rm(effectiveWeight(eq, s.weight_kg, bodyWeight), s.reps)
    if (!best || value > best.value) best = { value, set: s }
  }
  return best
}

/**
 * 部位ごとに、軸の種目の伸びと並べる計測（見た目の結果）。MEASURE_ITEMS の label。
 * 背中は広がると肩周りに出る。腹はウエストが「増えるほど良い」ではないので並べない
 */
export const MEASURE_OF_PART: Record<BodyPart, string | null> = {
  chest: '胸囲',
  back: '肩周り',
  shoulders: '肩周り',
  arms: '上腕（力こぶ）',
  legs: '大腿',
  core: null,
}

/**
 * 期間の変化（points は古い順）: 終わり = 期間内で最後の点、始まり = 期間より前で最後の点（なければ期間内で最初の点）。
 * 期間内に点がない、または比べる相手がいなければ null
 */
export function changeIn<T extends { date: string; value: number }>(points: T[], from: string, to: string): { start: T; end: T; delta: number } | null {
  const inside = points.filter((p) => p.date >= from && p.date <= to)
  if (!inside.length) return null
  const end = inside[inside.length - 1]
  const before = points.filter((p) => p.date < from)
  const start = before.length ? before[before.length - 1] : inside[0]
  return start === end ? null : { start, end, delta: fix(end.value - start.value) }
}

/** 期間のセット数を1週間あたりに（小数1桁） */
export const perWeek = (sets: number, days: number) => (days > 0 ? Math.round((sets / days) * 7 * 10) / 10 : 0)

/** 部位に並べる計測の推移（古い順。左右がある項目は平均。その項目を測っていない回は飛ばす） */
export function measureSeries(part: BodyPart, list: Measurement[]): { label: string; points: { date: string; value: number }[] } | null {
  const item = MEASURE_ITEMS.find((i) => i.label === MEASURE_OF_PART[part])
  if (!item) return null
  const points = [...list]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .flatMap((m) => {
      const vs = item.keys.map((k) => m[k]).filter((v): v is number => typeof v === 'number')
      return vs.length ? [{ date: m.date, value: fix(vs.reduce((a, b) => a + b, 0) / vs.length) }] : []
    })
  return { label: item.label, points }
}
