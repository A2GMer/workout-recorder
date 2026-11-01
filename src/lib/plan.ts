import { BODY_PARTS, type BodyPart } from './types'

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

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000)
}
