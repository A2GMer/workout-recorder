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
