import { db, SETTINGS_ID, type SyncTable } from './db'
import { scheduleSync } from './sync'
import type {
  Exercise,
  Routine,
  RoutineItem,
  Session,
  SessionExercise,
  Settings,
  Synced,
  WorkSet,
} from '../lib/types'
import type { PrevPerformance } from '../lib/progression'

export const uuid = () => crypto.randomUUID()

const alive = <T extends Synced>(r: T | undefined): r is T => !!r && !r.deleted

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** ローカルに保存し、送信待ちに積む */
export async function save<T extends Synced>(table: SyncTable, rows: T | T[]) {
  const list = Array.isArray(rows) ? rows : [rows]
  await db.transaction('rw', db.table(table), db.outbox, async () => {
    await db.table(table).bulkPut(list)
    await db.outbox.bulkAdd(list.map((r) => ({ table, rowId: r.id })))
  })
  scheduleSync()
}

export async function patch<T extends Synced>(table: SyncTable, id: string, changes: Partial<T>) {
  const row = await db.table(table).get(id)
  if (row) await save(table, { ...row, ...changes })
}

export const remove = (table: SyncTable, id: string) => patch(table, id, { deleted: true })

// ---- 設定 ----

export const DEFAULT_SETTINGS: Settings = { id: SETTINGS_ID, body_weight_kg: 70, ez_bar_kg: 10 }

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(SETTINGS_ID)) ?? DEFAULT_SETTINGS
}

// ---- 一覧 ----

export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const all = (await db.exercises.toArray()).filter(alive)
  return all
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

export async function listRoutines(): Promise<Routine[]> {
  return (await db.routines.toArray()).filter(alive).sort((a, b) => a.sort_order - b.sort_order)
}

export async function routineItems(routineId: string): Promise<RoutineItem[]> {
  return (await db.routine_items.where('routine_id').equals(routineId).toArray())
    .filter(alive)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function listSessions(): Promise<Session[]> {
  return (await db.sessions.toArray()).filter(alive).sort(bySessionDesc)
}

function sessionKey(s: Session): [string, number] {
  return [s.date, Date.parse(s.created_at)]
}

function bySessionDesc(a: Session, b: Session) {
  const [da, ta] = sessionKey(a)
  const [db_, tb] = sessionKey(b)
  return da === db_ ? tb - ta : da < db_ ? 1 : -1
}

function isBefore(a: Session, b: Session) {
  return bySessionDesc(a, b) > 0
}

export async function sessionExercises(sessionId: string): Promise<SessionExercise[]> {
  return (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter(alive)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function setsOf(sessionExerciseId: string): Promise<WorkSet[]> {
  return (await db.work_sets.where('session_exercise_id').equals(sessionExerciseId).toArray())
    .filter(alive)
    .sort((a, b) => a.set_no - b.set_no)
}

/** 指定セッションより前で、その種目を行った直近の実績 */
export async function previousPerformance(
  exerciseId: string,
  current: Session,
): Promise<{ prev: PrevPerformance; session: Session } | null> {
  const ses = (await db.session_exercises.where('exercise_id').equals(exerciseId).toArray()).filter(
    alive,
  )
  const sessions = (await db.sessions.bulkGet(ses.map((s) => s.session_id))).map((s) =>
    alive(s) && s.id !== current.id && isBefore(s, current) ? s : undefined,
  )
  const candidates = ses
    .map((se, i) => ({ se, s: sessions[i] }))
    .filter((x): x is { se: SessionExercise; s: Session } => !!x.s)
    .sort((a, b) => bySessionDesc(a.s, b.s))
  for (const { se, s } of candidates) {
    const sets = await setsOf(se.id)
    if (!sets.length) continue // 記録なしはスキップ
    return {
      session: s,
      prev: {
        main: sets.filter((x) => x.kind === 'main'),
        backoff: sets.filter((x) => x.kind === 'backoff'),
        fatigue: se.fatigue,
        body_weight_kg: s.body_weight_kg,
      },
    }
  }
  return null
}

// ---- セッション開始 ----

/** 今日の同じメニューがあれば再開、なければ作成 */
export async function startSession(routineId: string): Promise<string> {
  const today = localDate()
  const existing = (await db.sessions.where('date').equals(today).toArray()).find(
    (s) => alive(s) && s.routine_id === routineId,
  )
  if (existing) return existing.id

  const settings = await getSettings()
  const session: Session = {
    id: uuid(),
    routine_id: routineId,
    date: today,
    body_weight_kg: settings.body_weight_kg,
    created_at: new Date().toISOString(),
  }
  const active = new Set((await listExercises()).map((e) => e.id))
  const items = (await routineItems(routineId)).filter((it) => active.has(it.exercise_id))
  const ses: SessionExercise[] = items.map((it, i) => ({
    id: uuid(),
    session_id: session.id,
    exercise_id: it.exercise_id,
    sort_order: i,
    fatigue: 50,
    comment: '',
  }))
  await save('sessions', session)
  if (ses.length) await save('session_exercises', ses)
  return session.id
}

export async function lastSessionOf(routineId: string): Promise<Session | undefined> {
  return (await listSessions()).find((s) => s.routine_id === routineId)
}
