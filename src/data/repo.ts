import { db, SETTINGS_ID, type SyncTable } from './db'
import { scheduleSync } from './sync'
import type {
  BodyPart,
  Equipment,
  Exercise,
  Measurement,
  Movement,
  Session,
  SessionExercise,
  Settings,
  Synced,
  WorkSet,
} from '../lib/types'
import { BODY_PARTS } from '../lib/types'
import { challenge, fix, streak, suggest, volume, type PrevPerformance, type SetLike } from '../lib/progression'
import { anchorOf, inWeek, sumByPart } from '../lib/plan'
import { bestE1rm, changeIn, measureSeries, perWeek } from '../lib/growth'
import { monthRange } from '../lib/calendar'
import { idealTargets, proposals } from '../lib/ideal'
import { exerciseDefaults, movementOf, PRESETS } from '../lib/presets'

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
  sex: 'male',
  weekly_sets: 10,
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
    sex: s?.sex ?? DEFAULT_SETTINGS.sex,
    weekly_sets: s?.weekly_sets ?? DEFAULT_SETTINGS.weekly_sets,
  }
}

// ---- 一覧 ----

export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const all = (await db.exercises.toArray()).filter(alive)
  return all
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
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

// ---- 今日の種目 ----

/** 今日のセッション（同じ日に複数あれば一番新しいもの） */
export async function todaySession(): Promise<Session | undefined> {
  return (await listSessions()).find((s) => s.date === localDate())
}

/**
 * 今日の種目を決める。sessionId（組み直すセッション）がなければ今日のセッションを作り、
 * あれば並び順どおりに置き換える。残る種目の記録はそのまま、外した種目は記録ごと外す。未作成の種目はここで作る
 */
export async function planToday(candidates: Candidate[], sessionId?: string): Promise<string> {
  const exerciseIds = await ensureExercises(candidates)
  let session = sessionId ? await db.sessions.get(sessionId) : undefined
  if (!alive(session)) {
    session = {
      id: uuid(),
      routine_id: null,
      date: localDate(),
      body_weight_kg: (await getSettings()).body_weight_kg,
      created_at: new Date().toISOString(),
    }
    await save('sessions', session)
  }
  const id = session.id
  const current = await sessionExercises(id)
  const next: SessionExercise[] = exerciseIds.map((exerciseId, i) => {
    const old = current.find((se) => se.exercise_id === exerciseId)
    return { ...(old ?? { id: uuid(), session_id: id, exercise_id: exerciseId, fatigue: 50, comment: '' }), sort_order: i }
  })
  const dropped = current.filter((se) => !exerciseIds.includes(se.exercise_id))
  const droppedSets = (await Promise.all(dropped.map((se) => setsOf(se.id)))).flat()
  await save('session_exercises', [...next, ...dropped.map((se) => ({ ...se, deleted: true }))])
  if (droppedSets.length) await save('work_sets', droppedSets.map((w) => ({ ...w, deleted: true })))
  return id
}

/**
 * 直近7日（今日を含む）に記録したセット数（メイン + バックオフ）を部位ごとに。
 * except のセッションは数えない（組み直し中の回は、記録ではなく予定のセット数で数えるため）
 */
export async function weekSetsByPart(except?: string): Promise<Map<BodyPart, number>> {
  const today = localDate()
  return setsByPartIn((s) => s.id !== except && inWeek(s.date, today))
}

/** 記録したセット数（メイン + バックオフ）を部位ごとに。pred に合うセッションだけ数える */
async function setsByPartIn(pred: (s: Session) => boolean): Promise<Map<BodyPart, number>> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  const sessions = new Set((await listSessions()).filter(pred).map((s) => s.id))
  const sets = new Map<string, number>()
  for (const w of (await db.work_sets.toArray()).filter(alive)) sets.set(w.session_exercise_id, (sets.get(w.session_exercise_id) ?? 0) + 1)
  const items = (await db.session_exercises.toArray())
    .filter((se) => alive(se) && sessions.has(se.session_id))
    .map((se) => ({ part: byId.get(se.exercise_id)?.body_part, sets: sets.get(se.id) ?? 0 }))
  return sumByPart(items)
}

/** 部位ごとの前回: 最後に鍛えた日と、その回にやったその部位の種目（並び順。アーカイブした種目は除く） */
export interface PartRecent {
  date: string
  exercises: Exercise[]
}

/** 部位ごとに、記録のある種目があった一番新しい回を探す */
export async function recentByPart(): Promise<Map<BodyPart, PartRecent>> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  const recorded = new Set((await db.work_sets.toArray()).filter(alive).map((w) => w.session_exercise_id))
  const bySession = new Map<string, SessionExercise[]>()
  for (const se of (await db.session_exercises.toArray()).filter(alive)) {
    if (recorded.has(se.id)) bySession.set(se.session_id, [...(bySession.get(se.session_id) ?? []), se])
  }
  const out = new Map<BodyPart, PartRecent>()
  for (const s of await listSessions()) {
    if (out.size === BODY_PARTS.length) break
    const found = new Map<BodyPart, Exercise[]>()
    for (const se of (bySession.get(s.id) ?? []).sort((a, b) => a.sort_order - b.sort_order)) {
      const ex = byId.get(se.exercise_id)
      if (!ex?.body_part || out.has(ex.body_part)) continue
      found.set(ex.body_part, [...(found.get(ex.body_part) ?? []), ex])
    }
    for (const [part, exercises] of found) out.set(part, { date: s.date, exercises: exercises.filter((e) => !e.archived) })
  }
  return out
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

// ---- 種目の候補 ----

/** 今日を組むときに選べる種目。作成済みの種目 + まだ作っていない事前登録 */
export interface Candidate {
  key: string
  name: string
  part: BodyPart | null
  movement: Movement | null
  equipment: Equipment
  heavy: boolean
  /** 作成済みならその種目。未作成（事前登録・新規）は保存時に作る */
  exercise?: Exercise
}

export const candidateOf = (e: Exercise): Candidate => ({
  key: e.id,
  name: e.name,
  part: e.body_part ?? null,
  movement: movementOf(e),
  equipment: e.equipment,
  heavy: e.pyramid,
  exercise: e,
})

export async function listCandidates(): Promise<Candidate[]> {
  const mine = await listExercises()
  const names = new Set(mine.map((e) => e.name))
  return [
    ...mine.map(candidateOf),
    ...PRESETS.filter((p) => !names.has(p.name)).map((p) => ({
      key: `preset:${p.name}`,
      name: p.name,
      part: p.part,
      movement: p.movement,
      equipment: p.equipment,
      heavy: p.heavy,
    })),
  ]
}

/** 未作成の種目（事前登録・新規）を作り、並び順どおりの種目 ID を返す */
export async function ensureExercises(candidates: Candidate[]): Promise<string[]> {
  const exercises = await listExercises(true)
  let order = exercises.length
  const exerciseIds: string[] = []
  for (const c of candidates) {
    if (c.exercise) {
      exerciseIds.push(c.exercise.id)
      continue
    }
    const e: Exercise = {
      id: uuid(),
      name: c.name,
      equipment: c.equipment,
      body_part: c.part,
      movement: c.movement,
      ...exerciseDefaults(c.equipment, c.heavy),
      sort_order: order++,
      archived: false,
    }
    await save('exercises', e)
    exerciseIds.push(e.id)
  }
  return exerciseIds
}

/** 軸の種目にする / 外す。部位ごとに1つなので、同じ部位のほかの軸は外す */
export async function setAnchor(ex: Exercise, on: boolean) {
  const others = on
    ? (await listExercises(true)).filter((e) => e.id !== ex.id && e.anchor && e.body_part === ex.body_part)
    : []
  await save<Exercise>('exercises', [{ ...ex, anchor: on }, ...others.map((e) => ({ ...e, anchor: false }))])
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
function nowSession(): Session {
  return { id: '', routine_id: null, date: localDate(), body_weight_kg: 0, created_at: new Date().toISOString() }
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

/** 軸の種目の伸び: 回ごとの推定1RM と、同じ部位の計測（どちらも古い順） */
export interface Growth {
  part: BodyPart
  ex: Exercise
  /** set はその回で一番高かったメインセット */
  lifts: { date: string; value: number; set: SetLike }[]
  /** 並べる計測。部位に対応する計測がなければ null */
  measure: { label: string; points: { date: string; value: number }[] } | null
}

/** 部位の並び順に、軸の種目ごとの伸び。軸の種目がない部位は出さない */
export async function anchorGrowth(): Promise<Growth[]> {
  const exercises = await listExercises()
  const measurements = await listMeasurements()
  const now = nowSession()
  const out: Growth[] = []
  for (const part of BODY_PARTS) {
    const ex = anchorOf(part, exercises)
    if (!ex) continue
    const lifts: Growth['lifts'] = []
    for (const { se, s } of await pastOccurrences(ex.id, now)) {
      const best = bestE1rm((await setsOf(se.id)).filter((w) => w.kind === 'main'), ex.equipment, s.body_weight_kg)
      if (best) lifts.push({ date: s.date, ...best })
    }
    out.push({ part, ex, lifts: lifts.reverse(), measure: measureSeries(part, measurements) })
  }
  return out
}

/** 月のふりかえりの部位の行 */
export interface MonthPart {
  part: BodyPart
  /** その月の週あたりのセット数 */
  weekly: number
  /** 軸の種目の推定1RMの変化（前の月の最後の回 → その月の最後の回）。軸がない・比べられなければ null */
  lift: { name: string; delta: number; end: number } | null
  /** 同じ部位の計測の変化。並べる計測がない・比べられなければ null */
  measure: { label: string; delta: number; end: number } | null
}

/**
 * 月のふりかえり（YYYY-MM。今月なら今日まで）: 部位ごとに 重量（軸の推定1RM）· 見た目（計測）· 量（週のセット数）。
 * その月に鍛えていない部位は出さない
 */
export async function monthReview(month: string): Promise<{ from: string; to: string; parts: MonthPart[] }> {
  const { from, to, days } = monthRange(month, localDate())
  const sets = await setsByPartIn((s) => s.date >= from && s.date <= to)
  const growth = new Map((await anchorGrowth()).map((g) => [g.part, g]))
  const measurements = await listMeasurements()
  const parts: MonthPart[] = []
  for (const part of BODY_PARTS) {
    const n = sets.get(part) ?? 0
    const g = growth.get(part)
    const lift = g ? changeIn(g.lifts, from, to) : null
    if (!n && !lift) continue
    const series = measureSeries(part, measurements)
    const measure = series ? changeIn(series.points, from, to) : null
    parts.push({
      part,
      weekly: perWeek(n, days),
      lift: g && lift ? { name: g.ex.name, delta: lift.delta, end: lift.end.value } : null,
      measure: series && measure ? { label: series.label, delta: measure.delta, end: measure.end.value } : null,
    })
  }
  return { from, to, parts }
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

/** これからやる種目の見どころ: 次回提案の挑戦度の平均（模様の激しさ）と、重量が上がる種目数（前回全セット達成） */
export async function planOutlook(exercises: Exercise[]): Promise<{ intensity: number; weightUps: number }> {
  // 「今これから行う」想定のセッションを基準に前回を探す
  const now = nowSession()
  const prevs = await Promise.all(exercises.map(async (e) => (await previousPerformance(e.id, now))?.prev ?? null))
  const scores = exercises.map((e, i) => challenge(e, prevs[i]))
  return {
    intensity: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.3,
    weightUps: exercises.filter((e, i) => suggest(e, prevs[i]).achieved).length,
  }
}
