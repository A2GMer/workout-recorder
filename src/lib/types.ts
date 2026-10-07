export type Equipment = 'barbell' | 'ez' | 'smith' | 'dumbbell' | 'machine' | 'bodyweight'
export type SetKind = 'main' | 'backoff'
export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core'

export const BODY_PART_LABEL: Record<BodyPart, string> = {
  chest: '胸',
  back: '背中',
  shoulders: '肩',
  arms: '腕',
  legs: '脚',
  core: '腹',
}

/** 同期対象の行に共通するカラム */
export interface Synced {
  id: string
  deleted?: boolean
  updated_at?: string
}

export interface Settings extends Synced {
  body_weight_kg: number
  ez_bar_kg: number
  smith_bar_kg: number
  /** 計測を促す間隔（日） */
  measure_interval_days: number
}

export interface Exercise extends Synced {
  name: string
  equipment: Equipment
  body_part?: BodyPart | null
  weight_step: number
  target_reps: number
  main_sets: number
  pyramid: boolean
  backoff_ratio: number
  sort_order: number
  archived: boolean
}

export interface Routine extends Synced {
  name: string
  /** 対象部位（種目選択の絞り込みと模様に使う） */
  body_parts?: BodyPart[] | null
  sort_order: number
}

export interface RoutineItem extends Synced {
  routine_id: string
  exercise_id: string
  sort_order: number
}

export interface Session extends Synced {
  routine_id: string | null
  date: string // YYYY-MM-DD
  body_weight_kg: number
  created_at: string
}

export interface SessionExercise extends Synced {
  session_id: string
  exercise_id: string
  sort_order: number
  fatigue: number // 0(軽)〜100(重)
  comment: string
}

export interface WorkSet extends Synced {
  session_exercise_id: string
  kind: SetKind
  set_no: number
  weight_kg: number
  reps: number
  cheat_reps: number
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'バーベル',
  ez: 'EZバー',
  smith: 'スミス',
  dumbbell: 'ダンベル',
  machine: 'マシン',
  bodyweight: '自重',
}

/** 体のサイズ計測（メジャー）。単位は体重のみ kg、ほかは cm */
export interface Measurement extends Synced {
  date: string // YYYY-MM-DD
  weight_kg: number | null
  waist: number | null
  chest: number | null
  shoulders: number | null
  arm_relaxed_l: number | null
  arm_relaxed_r: number | null
  arm_flexed_l: number | null
  arm_flexed_r: number | null
  forearm_l: number | null
  forearm_r: number | null
  thigh_l: number | null
  thigh_r: number | null
  calf_l: number | null
  calf_r: number | null
  hip: number | null
}

export type MeasureKey = Exclude<keyof Measurement, keyof Synced | 'date'>

/** 入力・表示の順番。左右がある項目は [左, 右] */
export const MEASURE_ITEMS: { label: string; keys: MeasureKey[]; unit: 'kg' | 'cm' }[] = [
  { label: '体重', keys: ['weight_kg'], unit: 'kg' },
  { label: 'ウエスト', keys: ['waist'], unit: 'cm' },
  { label: '胸囲', keys: ['chest'], unit: 'cm' },
  { label: '肩周り', keys: ['shoulders'], unit: 'cm' },
  { label: '上腕（脱力）', keys: ['arm_relaxed_l', 'arm_relaxed_r'], unit: 'cm' },
  { label: '上腕（力こぶ）', keys: ['arm_flexed_l', 'arm_flexed_r'], unit: 'cm' },
  { label: '前腕', keys: ['forearm_l', 'forearm_r'], unit: 'cm' },
  { label: '大腿', keys: ['thigh_l', 'thigh_r'], unit: 'cm' },
  { label: 'ふくらはぎ', keys: ['calf_l', 'calf_r'], unit: 'cm' },
  { label: '臀囲', keys: ['hip'], unit: 'cm' },
]

export const MEASURE_KEYS: MeasureKey[] = MEASURE_ITEMS.flatMap((i) => i.keys)

/** 「大きくなるのが前進」の項目。体重とウエストは増減どちらが良いか人によるので外す */
export const GROWTH_KEYS: MeasureKey[] = MEASURE_KEYS.filter((k) => k !== 'weight_kg' && k !== 'waist')

export function measureLabel(k: MeasureKey): string {
  const item = MEASURE_ITEMS.find((i) => i.keys.includes(k))!
  const side = item.keys.length > 1 ? (item.keys[0] === k ? ' 左' : ' 右') : ''
  return item.label + side
}
