import Dexie, { type EntityTable } from 'dexie'
import type {
  Exercise,
  Routine,
  RoutineItem,
  Session,
  SessionExercise,
  Settings,
  WorkSet,
} from '../lib/types'

export interface OutboxItem {
  seq?: number
  table: SyncTable
  rowId: string
}

export interface Meta {
  key: string
  value: string
}

/** 同期順（外部キーの親 → 子） */
export const SYNC_TABLES = [
  'settings',
  'exercises',
  'routines',
  'routine_items',
  'sessions',
  'session_exercises',
  'work_sets',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export const db = new Dexie('workout') as Dexie & {
  settings: EntityTable<Settings, 'id'>
  exercises: EntityTable<Exercise, 'id'>
  routines: EntityTable<Routine, 'id'>
  routine_items: EntityTable<RoutineItem, 'id'>
  sessions: EntityTable<Session, 'id'>
  session_exercises: EntityTable<SessionExercise, 'id'>
  work_sets: EntityTable<WorkSet, 'id'>
  outbox: EntityTable<OutboxItem, 'seq'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  settings: 'id',
  exercises: 'id',
  routines: 'id',
  routine_items: 'id, routine_id',
  sessions: 'id, date',
  session_exercises: 'id, session_id, exercise_id',
  work_sets: 'id, session_exercise_id',
  outbox: '++seq',
  meta: 'key',
})

/** ローカルでは設定は1行のみ。サーバー側ではユーザーIDに置き換える */
export const SETTINGS_ID = 'me'
