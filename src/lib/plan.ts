import { BODY_PARTS, type BodyPart, type Exercise } from './types'

/** 次に鍛える部位を探すとき、ここ何日かで鍛えた部位だけを見る（たまにしかやらない部位が居座らないように） */
export const ROTATION_DAYS = 28

/**
 * 次に鍛える部位: 鍛えた部位のうち、最後に鍛えてから一番空いているもの。
 * 同じ日に鍛えてそれ以来やっていない部位はまとめて出す（例: 胸・腕）。
 * ROTATION_DAYS 以内に鍛えた部位があればその中から、なければ鍛えたことのある部位から。一度もなければ空
 */
export function nextParts(last: Partial<Record<BodyPart, string>>, today: string): BodyPart[] {
  const trained = BODY_PARTS.filter((p) => last[p])
  const recent = trained.filter((p) => daysBetween(last[p]!, today) <= ROTATION_DAYS)
  const pool = recent.length ? recent : trained
  if (!pool.length) return []
  const oldest = pool.map((p) => last[p]!).reduce((a, b) => (b < a ? b : a))
  return pool.filter((p) => last[p] === oldest)
}

/** 種目の部位を多い順に（同数なら先に出た順。部位のない種目は数えない） */
export function partsOf(parts: (BodyPart | null | undefined)[]): BodyPart[] {
  const count = new Map<BodyPart, number>()
  for (const p of parts) if (p) count.set(p, (count.get(p) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
}

/** 部位の軸の種目（アーカイブしたものは除く。万一複数あれば並び順で先のもの） */
export function anchorOf(part: BodyPart, exercises: Exercise[]): Exercise | undefined {
  return exercises.find((e) => e.anchor && !e.archived && e.body_part === part)
}

/** 部位を選んだときに最初から入れる種目: 軸の種目を先頭に、その部位を前回やった回の種目を続ける（重複なし） */
export function seedExercises<T extends { id: string }>(anchor: T | undefined, last: T[]): T[] {
  return anchor ? [anchor, ...last.filter((e) => e.id !== anchor.id)] : last
}

/** 週のセット数を数える日数（今日を含む直近7日。週1〜2回なら前回の分が入る） */
export const WEEK_DAYS = 7

/** 直近 WEEK_DAYS 日（今日を含む）の日付か */
export function inWeek(date: string, today: string): boolean {
  const d = daysBetween(date, today)
  return d >= 0 && d < WEEK_DAYS
}

/** 1種目で予定するセット数: メインセット + バックオフ（ピラミッドなら1セット） */
export const plannedSets = (e: Pick<Exercise, 'main_sets' | 'pyramid'>) => e.main_sets + (e.pyramid ? 1 : 0)

/** セット数を部位ごとに足す（部位のない種目は数えない） */
export function sumByPart(items: { part: BodyPart | null | undefined; sets: number }[]): Map<BodyPart, number> {
  const out = new Map<BodyPart, number>()
  for (const { part, sets } of items) if (part) out.set(part, (out.get(part) ?? 0) + sets)
  return out
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
}
