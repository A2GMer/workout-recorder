import type { Equipment } from './types'
import { fix } from './progression'

export const num = (n: number) => String(fix(n))

/** 自重は加重/補助が分かるよう符号付き */
export function fmtWeight(eq: Equipment, w: number): string {
  if (eq === 'bodyweight') return w > 0 ? `+${num(w)}` : w < 0 ? `−${num(-w)}` : '0'
  return num(w)
}

export function fmtVolume(v: number): string {
  return Math.round(v).toLocaleString('ja-JP')
}

export const md = (date: string) => date.slice(5).replace('-', '/')

/** 100×3,3,3 · 60×10 のように重量ごとにまとめる。チーティングがあれば 3+1 と書く */
export function fmtSets(eq: Equipment, sets: { weight_kg: number; reps: number; cheat_reps?: number }[]): string {
  const groups: { w: number; reps: string[] }[] = []
  for (const s of sets) {
    const r = s.cheat_reps ? `${s.reps}+${s.cheat_reps}` : String(s.reps)
    const g = groups[groups.length - 1]
    if (g && g.w === s.weight_kg) g.reps.push(r)
    else groups.push({ w: s.weight_kg, reps: [r] })
  }
  return groups.map((g) => `${fmtWeight(eq, g.w)}×${g.reps.join(',')}`).join(' · ')
}
