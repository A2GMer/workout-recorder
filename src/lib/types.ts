export type Equipment = 'barbell' | 'ez' | 'dumbbell' | 'machine' | 'bodyweight'
export type SetKind = 'main' | 'backoff'

/** 同期対象の行に共通するカラム */
export interface Synced {
  id: string
  deleted?: boolean
  updated_at?: string
}

export interface Settings extends Synced {
  body_weight_kg: number
  ez_bar_kg: number
}

export interface Exercise extends Synced {
  name: string
  equipment: Equipment
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
  dumbbell: 'ダンベル',
  machine: 'マシン',
  bodyweight: '自重',
}
