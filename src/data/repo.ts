import { db, SETTINGS_ID, type SyncTable } from './db'
import { scheduleSync } from './sync'
import type {
  BodyPart,
  Equipment,
  Exercise,
  Measurement,
  Routine,
  RoutineItem,
  Session,
  SessionExercise,
  Settings,
  Synced,
  WorkSet,
} from '../lib/types'
import { challenge, fix, streak, suggest, volume, type PrevPerformance } from '../lib/progression'
import { idealTargets, proposals } from '../lib/ideal'
import { exerciseDefaults, PRESETS } from '../lib/presets'

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

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  body_weight_kg: 70,
  ez_bar_kg: 10,
  smith_bar_kg: 20,
  measure_interval_days: 14,
  height_cm: null,
}

export async function getSettings(): Promise<Settings> {
  // 後から増えた項目は既定値で埋める
  const s = await db.settings.get(SETTINGS_ID)
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    smith_bar_kg: s?.smith_bar_kg ?? DEFAULT_SETTINGS.smith_bar_kg,
    measure_interval_days: s?.measure_interval_days ?? DEFAULT_SETTINGS.measure_interval_days,
    height_cm: s?.height_cm ?? null,
  }
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

/** 指定セッションより前に、その種目を行った回（新しい順） */
async function pastOccurrences(exerciseId: string, current: Session): Promise<{ se: SessionExercise; s: Session }[]> {
  const ses = (await db.session_exercises.where('exercise_id').equals(exerciseId).toArray()).filter(
    alive,
  )
  const sessions = (await db.sessions.bulkGet(ses.map((s) => s.session_id))).map((s) =>
    alive(s) && s.id !== current.id && isBefore(s, current) ? s : undefined,
  )
  return ses
    .map((se, i) => ({ se, s: sessions[i] }))
    .filter((x): x is { se: SessionExercise; s: Session } => !!x.s)
    .sort((a, b) => bySessionDesc(a.s, b.s))
}

/** 指定セッションより前で、その種目を行った直近の実績 */
export async function previousPerformance(
  exerciseId: string,
  current: Session,
): Promise<{ prev: PrevPerformance; session: Session } | null> {
  const candidates = await pastOccurrences(exerciseId, current)
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

export interface ExerciseLog {
  session: Session
  /** その回の種目ボリューム（メイン + バックオフ） */
  volume: number
  /** その回のメインセット最大重量 */
  maxWeight: number
}

/** 指定セッションより前の、その種目の実績一覧（新しい順・記録なしは除く）。連続更新や自己ベストの計算に使う */
export async function exerciseHistory(ex: Exercise, current: Session, limit = 60): Promise<ExerciseLog[]> {
  const out: ExerciseLog[] = []
  for (const { se, s } of await pastOccurrences(ex.id, current)) {
    const sets = await setsOf(se.id)
    if (!sets.length) continue
    const main = sets.filter((x) => x.kind === 'main')
    out.push({
      session: s,
      volume: volume(sets, ex.equipment, s.body_weight_kg),
      maxWeight: main.length ? Math.max(...main.map((x) => x.weight_kg)) : -Infinity,
    })
    if (out.length >= limit) break
  }
  return out
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

// ---- 身体計測 ----

/** 新しい順 */
export async function listMeasurements(): Promise<Measurement[]> {
  return (await db.measurements.toArray()).filter(alive).sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** 計測を保存。同じ日の記録があれば上書きし、体重は設定にも反映する */
export async function saveMeasurement(values: Partial<Measurement>, date = localDate()) {
  const sameDay = (await listMeasurements()).find((m) => m.date === date)
  const row = { ...(sameDay ?? { id: uuid(), date }), ...values } as Measurement
  await save('measurements', row)
  if (row.weight_kg) await save<Settings>('settings', { ...(await getSettings()), body_weight_kg: row.weight_kg })
}

// ---- メニュー作成 ----

/** メニュー作成で選べる種目。作成済みの種目 + まだ作っていない事前登録 */
export interface Candidate {
  key: string
  name: string
  part: BodyPart | null
  equipment: Equipment
  heavy: boolean
  /** 作成済みならその種目。未作成（事前登録・新規）は保存時に作る */
  exercise?: Exercise
}

export async function listCandidates(): Promise<Candidate[]> {
  const mine = await listExercises()
  const names = new Set(mine.map((e) => e.name))
  return [
    ...mine.map((e) => ({
      key: e.id,
      name: e.name,
      part: e.body_part ?? null,
      equipment: e.equipment,
      heavy: e.pyramid,
      exercise: e,
    })),
    ...PRESETS.filter((p) => !names.has(p.name)).map((p) => ({
      key: `preset:${p.name}`,
      name: p.name,
      part: p.part,
      equipment: p.equipment,
      heavy: p.heavy,
    })),
  ]
}

/** メニューを保存（新規/更新）。未作成の種目はここで作る */
export async function saveRoutine(input: {
  id?: string
  name: string
  body_parts: BodyPart[]
  candidates: Candidate[]
}): Promise<string> {
  const exercises = await listExercises(true)
  let order = exercises.length
  const exerciseIds: string[] = []
  for (const c of input.candidates) {
    if (c.exercise) {
      exerciseIds.push(c.exercise.id)
      continue
    }
    const e: Exercise = {
      id: uuid(),
      name: c.name,
      equipment: c.equipment,
      body_part: c.part,
      ...exerciseDefaults(c.equipment, c.heavy),
      sort_order: order++,
      archived: false,
    }
    await save('exercises', e)
    exerciseIds.push(e.id)
  }

  const routines = await listRoutines()
  const existing = input.id ? await db.routines.get(input.id) : undefined
  const routine: Routine = {
    ...(existing ?? { id: uuid(), sort_order: routines.length }),
    name: input.name,
    body_parts: input.body_parts,
  }
  await save('routines', routine)

  // 並び順どおりに置き換える（既存の行は使い回し、外れたものは削除）
  const items = existing ? await routineItems(routine.id) : []
  const next: RoutineItem[] = exerciseIds.map((exerciseId, i) => {
    const old = items.find((it) => it.exercise_id === exerciseId)
    return { ...(old ?? { id: uuid(), routine_id: routine.id, exercise_id: exerciseId }), sort_order: i }
  })
  const removed = items.filter((it) => !exerciseIds.includes(it.exercise_id)).map((it) => ({ ...it, deleted: true }))
  await save('routine_items', [...next, ...removed])
  return routine.id
}

export interface RoutineProfile {
  /** 多い順に最大2部位 */
  parts: BodyPart[]
  /** 次回提案の挑戦度 0〜1 */
  intensity: number
  /** 今日、重量が上がる種目の数（前回全セット達成） */
  weightUps: number
  /** メニューの種目数 */
  exercises: number
}

/** セッションの成績: 前回と比べられた種目数と、そのうち前回を超えた数 */
export interface SessionProgress {
  /** 記録のある種目数 */
  recorded: number
  /** その日の総ボリューム */
  volume: number
  compared: number
  improved: number
}

export async function sessionProgress(s: Session, exercises?: Map<string, Exercise>): Promise<SessionProgress> {
  const byId = exercises ?? new Map((await listExercises(true)).map((e) => [e.id, e]))
  let recorded = 0
  let total = 0
  let compared = 0
  let improved = 0
  for (const se of await sessionExercises(s.id)) {
    const ex = byId.get(se.exercise_id)
    const sets = await setsOf(se.id)
    if (!ex || !sets.length) continue
    recorded++
    const v = volume(sets, ex.equipment, s.body_weight_kg)
    total += v
    const prev = await previousPerformance(ex.id, s)
    if (!prev) continue
    compared++
    if (v > volume([...prev.prev.main, ...prev.prev.backoff], ex.equipment, prev.session.body_weight_kg)) improved++
  }
  return { recorded, volume: fix(total), compared, improved }
}

/** 指定日より後のトレーニングの積み上げ（計測から次の計測までの「努力量」） */
export async function trainingSince(date: string): Promise<SessionProgress & { sessions: number }> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  const out = { sessions: 0, recorded: 0, volume: 0, compared: 0, improved: 0 }
  for (const s of (await listSessions()).filter((s) => s.date > date)) {
    const p = await sessionProgress(s, byId)
    if (!p.recorded) continue
    out.sessions++
    out.recorded += p.recorded
    out.volume = fix(out.volume + p.volume)
    out.compared += p.compared
    out.improved += p.improved
  }
  return out
}

/** 全部の種目で前回を超えた回か */
export const allImproved = (p: SessionProgress) => p.compared > 0 && p.improved === p.compared

/** 「今これから行う」想定のセッション。前回や履歴を探す基準に使う */
function nowSession(routineId: string | null = null): Session {
  return { id: '', routine_id: routineId, date: localDate(), body_weight_kg: 0, created_at: new Date().toISOString() }
}

/** 種目の歩み: 今の最大重量と、初回からの伸び（設定の種目一覧で自己ベスト一覧として見せる） */
export interface ExerciseSummary {
  /** 直近の回のメイン最大重量。記録なしは null */
  topWeight: number | null
  /** 初回の回からの伸び（記録なしは null） */
  gain: number | null
  /** 行った回数 */
  sessions: number
  /** 連続で前回を超えた回数 */
  streak: number
  /** 次にやるとき重量が上がるか（前回全セット達成） */
  weightUp: boolean
}

export async function exerciseSummary(ex: Exercise): Promise<ExerciseSummary> {
  const now = nowSession()
  const history = (await exerciseHistory(ex, now, 1000)).filter((h) => isFinite(h.maxWeight))
  if (!history.length) return { topWeight: null, gain: null, sessions: 0, streak: 0, weightUp: false }
  const latest = history[0]
  const first = history[history.length - 1]
  return {
    topWeight: latest.maxWeight,
    gain: fix(latest.maxWeight - first.maxWeight),
    sessions: history.length,
    streak: streak(history.map((h) => h.volume)),
    weightUp: suggest(ex, (await previousPerformance(ex.id, now))?.prev ?? null).achieved,
  }
}

/**
 * プロポーション目標に足りない部位（不足の割合が大きい順・重複なし）。
 * 履歴の NEXT と同じ上位3項目から取る（全部に印がつくと意味がなくなるため）。身長や計測がなければ空
 */
export async function lackingParts(top = 3): Promise<BodyPart[]> {
  const [latest] = await listMeasurements()
  const targets = idealTargets(latest ?? null, (await getSettings()).height_cm)
  const out: BodyPart[] = []
  for (const p of proposals(targets).slice(0, top)) for (const b of p.parts) if (!out.includes(b)) out.push(b)
  return out
}

/** メニューの歩み: 行った回数と連続更新 */
export async function routineSummary(routineId: string): Promise<{ sessions: number; streak: number }> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  let sessions = 0
  let run = 0
  let broken = false
  for (const s of (await listSessions()).filter((s) => s.routine_id === routineId)) {
    const p = await sessionProgress(s, byId)
    if (!p.recorded) continue
    sessions++
    if (broken || p.compared === 0) continue // 比べられない回（初回など）は連続の数に入れずに飛ばす
    if (allImproved(p)) run++
    else broken = true
  }
  return { sessions, streak: run }
}

/** 記録をはじめてからの歩み: 初日・日数・回数・累計ボリューム */
export async function journey(): Promise<{ firstDate: string; days: number; sessions: number; volume: number } | null> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  const done: Session[] = []
  let total = 0
  for (const s of await listSessions()) {
    const p = await sessionProgress(s, byId)
    if (!p.recorded) continue
    done.push(s)
    total += p.volume
  }
  if (!done.length) return null
  const firstDate = done[done.length - 1].date
  const days = Math.round((Date.parse(localDate()) - Date.parse(firstDate)) / 86400000) + 1
  return { firstDate, days, sessions: done.length, volume: fix(total) }
}


/** メニューの模様を決める: 含まれる種目の部位と、次回提案の挑戦度の平均 */
export async function routineProfile(routineId: string): Promise<RoutineProfile> {
  const byId = new Map((await listExercises()).map((e) => [e.id, e]))
  const exercises = (await routineItems(routineId))
    .map((it) => byId.get(it.exercise_id))
    .filter((e): e is Exercise => !!e)
  const freq = new Map<BodyPart, number>()
  for (const e of exercises) if (e.body_part) freq.set(e.body_part, (freq.get(e.body_part) ?? 0) + 1)
  // メニューで対象部位を選んでいればそれを優先（種目が多い順）。なければ種目の部位から
  const chosen = (await db.routines.get(routineId))?.body_parts ?? []
  const parts = (chosen.length ? chosen.map((p) => [p, freq.get(p) ?? 0] as const) : [...freq.entries()])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([p]) => p)

  // 「今これから行う」想定のセッションを基準に前回を探す
  const now = nowSession(routineId)
  const prevs = await Promise.all(exercises.map(async (e) => (await previousPerformance(e.id, now))?.prev ?? null))
  const scores = exercises.map((e, i) => challenge(e, prevs[i]))
  const intensity = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.3
  const weightUps = exercises.filter((e, i) => suggest(e, prevs[i]).achieved).length
  return { parts, intensity, weightUps, exercises: exercises.length }
}

export async function lastSessionOf(routineId: string): Promise<Session | undefined> {
  return (await listSessions()).find((s) => s.routine_id === routineId)
}
