import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  candidateOf,
  exerciseSummary,
  lackingParts,
  listCandidates,
  listExercises,
  planToday,
  recentByPart,
  sessionExercises,
  setsOf,
  todaySession,
  type Candidate,
  type ExerciseSummary,
} from '../data/repo'
import { fmtWeight, md, num } from '../lib/format'
import { partsOf } from '../lib/plan'
import { BODY_PART_LABEL, BODY_PARTS, EQUIPMENT_LABEL, partsName, type BodyPart, type Equipment } from '../lib/types'
import { BodyArt } from '../ui/BodyArt'
import { Icon } from '../ui/Icon'
import { PrimaryButton, Question } from '../ui/Flow'
import { TopBar } from '../ui/TopBar'

/** 歩み: プロポーション目標に足りない部位と、種目ごとの最大重量・伸び・次回の重量アップ */
function useProgress() {
  return useLiveQuery(async () => ({
    lacking: await lackingParts(),
    summaries: new Map(await Promise.all((await listExercises()).map(async (e) => [e.id, await exerciseSummary(e)] as const))),
  }))
}

/** 開いた時点の今日 */
interface Initial {
  /** 組み直すセッション。なければ開始で今日のセッションを作る */
  sessionId?: string
  /** 組み直すセッションの種目（並び順）。新しく組むときは null */
  today: Candidate[] | null
  /** 今日すでに記録がある種目（外すときに確認する） */
  recorded: Set<string>
  /** 部位ごとの前回の種目。部位を選んだときに最初から入れておく */
  defaults: Map<BodyPart, Candidate[]>
  /** 部位ごとの最後に鍛えた日 */
  last: Map<BodyPart, string>
}

/** sessionId（記録画面から組み直すセッション）がなければ今日のセッション。どちらもなければ新しく組む */
async function loadInitial(sessionId: string | null): Promise<Initial> {
  const byId = new Map((await listExercises(true)).map((e) => [e.id, e]))
  const recent = await recentByPart()
  const defaults = new Map([...recent].map(([p, r]) => [p, r.exercises.map(candidateOf)]))
  const last = new Map([...recent].map(([p, r]) => [p, r.date]))
  const found = sessionId ? await db.sessions.get(sessionId) : await todaySession()
  const session = found && !found.deleted ? found : undefined
  if (!session) return { today: null, recorded: new Set(), defaults, last }
  const today: Candidate[] = []
  const recorded = new Set<string>()
  for (const se of await sessionExercises(session.id)) {
    const ex = byId.get(se.exercise_id)
    if (!ex) continue
    today.push(candidateOf(ex))
    if ((await setsOf(se.id)).length) recorded.add(ex.id)
  }
  return { sessionId: session.id, today, recorded, defaults, last }
}

type Step = 'parts' | 'exercises' | 'create'

/**
 * 今日を組む: 部位 → 種目（前回その部位でやった種目が入った状態から、外す・足す・並べ替える） → 開始。
 * 今日のセッションがあれば種目から始まり、組み直したものに置き換える（組み直し）。押すまで何も保存しない
 */
function TodayPlan({ initial, asked, onDone, onCancel }: {
  initial: Initial
  /** ホームから選んできた部位 */
  asked: BodyPart[]
  onDone: (sessionId: string) => void
  onCancel: () => void
}) {
  const candidates = useLiveQuery(listCandidates) ?? []
  const progressData = useProgress()
  const lacking = progressData?.lacking ?? []
  const summaries = progressData?.summaries
  const editing = initial.today !== null
  const todayParts = partsOf((initial.today ?? []).map((c) => c.part))
  const firstParts = [...todayParts, ...asked.filter((p) => !todayParts.includes(p))]

  const [step, setStep] = useState<Step>(editing ? 'exercises' : 'parts')
  const [parts, setParts] = useState<BodyPart[]>(firstParts)
  // 前回の種目を入れ済みの部位。組み直しで足した部位は、ここで前回の種目が入る
  const [seeded, setSeeded] = useState<BodyPart[]>(editing ? firstParts : [])
  const [picked, setPicked] = useState<Candidate[]>(() =>
    editing ? withDefaults(initial.today!, asked.filter((p) => !todayParts.includes(p)), initial.defaults) : [],
  )
  const [custom, setCustom] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)

  const index = step === 'parts' ? 0 : 1

  // 組み直しは種目から始まるので、種目から戻ると記録画面へ。部位から戻ると、部位の変更は取り消して種目へ
  function back() {
    if (step === 'create') return setStep('exercises')
    if (step === 'exercises') return editing ? onCancel() : setStep('parts')
    if (!editing) return onCancel()
    setParts(seeded)
    setStep('exercises')
  }

  /** 部位を決めた: 新しく選んだ部位には前回の種目を入れ、外した部位の種目は外す（今日記録した種目は残す） */
  function toExercises() {
    const kept = picked.filter((c) => !c.part || parts.includes(c.part) || initial.recorded.has(c.key))
    setPicked(withDefaults(kept, parts.filter((p) => !seeded.includes(p)), initial.defaults))
    setSeeded(parts)
    setStep('exercises')
  }

  function drop(c: Candidate) {
    if (initial.recorded.has(c.key) && !confirm(`${c.name} の今日の記録ごと外しますか？`)) return
    setPicked((ps) => ps.filter((x) => x.key !== c.key))
  }

  async function finish() {
    setBusy(true)
    onDone(await planToday(picked, initial.sessionId))
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={back} title={editing ? '組み直す' : '今日を組む'} sub={editing ? undefined : `${index + 1} / 2`} />

      {step === 'parts' && (
        <>
          <Question sub={lacking.length ? `目標のプロポーションに足りないのは ${partsName(lacking)}` : undefined}>どこを鍛える？</Question>
          <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-5 pb-4">
            {BODY_PARTS.map((p) => {
              const on = parts.includes(p)
              const want = lacking.includes(p)
              const last = initial.last.get(p)
              return (
                <button
                  key={p}
                  onClick={() => setParts((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
                  aria-pressed={on}
                  className={`relative flex aspect-[5/4] flex-col items-center justify-center gap-2 rounded-2xl border transition ${
                    on ? 'border-fg bg-panel text-fg' : 'border-line text-faint'
                  }`}
                >
                  {/* 伸ばしどころの印: 右上に白い点 */}
                  {want && <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-fg" aria-label="伸ばしどころ" />}
                  <BodyArt parts={[p]} intensity={on ? 0.5 : 0} animate={on} className="h-16 w-16" />
                  <span className="flex flex-col items-center">
                    <span className={`text-sm ${on ? 'text-fg' : 'text-dim'}`}>{BODY_PART_LABEL[p]}</span>
                    {/* 最後に鍛えた日。どこが空いているかで選べるように */}
                    <span className="h-4 text-[11px] leading-4 text-faint">{last ? md(last) : ''}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <PrimaryButton disabled={!parts.length} onClick={toExercises}>
            次へ
          </PrimaryButton>
        </>
      )}

      {step === 'exercises' && (
        <>
          <Question sub={editing ? '外す・足す・並べ替える' : '混んでいる・痛い種目は外して開始'}>今日の種目</Question>
          <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">
            <PickedList
              picked={picked}
              recorded={initial.recorded}
              summaries={summaries}
              onMove={(i, dir) => setPicked((ps) => swap(ps, i, i + dir))}
              onDrop={drop}
            />
            <AddList
              parts={parts}
              candidates={[...custom, ...candidates].filter((c) => !picked.some((p) => p.key === c.key))}
              summaries={summaries}
              onAdd={(c) => setPicked((ps) => [...ps, c])}
            />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setStep('parts')} className="flex h-14 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-dim">
                部位を変える
              </button>
              <button onClick={() => setStep('create')} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-dim">
                <Icon name="plus" size={16} />
                一覧にない種目
              </button>
            </div>
          </div>
          <PrimaryButton disabled={busy || !picked.length} onClick={finish}>
            {editing ? '決定' : `開始（${picked.length}）`}
          </PrimaryButton>
        </>
      )}

      {step === 'create' && (
        <CreateExercise
          parts={parts}
          onAdd={(c) => {
            setCustom((cs) => [c, ...cs])
            setPicked((ps) => [...ps, c])
            setStep('exercises')
          }}
        />
      )}
    </div>
  )
}

/** まだ前回の種目を入れていない部位について、前回の種目を後ろに足す（重複なし） */
function withDefaults(list: Candidate[], parts: BodyPart[], defaults: Map<BodyPart, Candidate[]>): Candidate[] {
  const added = parts.flatMap((p) => defaults.get(p) ?? []).filter((c) => !list.some((x) => x.key === c.key))
  return [...list, ...added]
}

function swap<T>(xs: T[], i: number, j: number): T[] {
  if (j < 0 || j >= xs.length) return xs
  const out = [...xs]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** 今日やる種目（この順番で記録画面に並ぶ）。上下で並べ替え、× で外す */
function PickedList({ picked, recorded, summaries, onMove, onDrop }: {
  picked: Candidate[]
  recorded: Set<string>
  summaries?: Map<string, ExerciseSummary>
  onMove: (i: number, dir: -1 | 1) => void
  onDrop: (c: Candidate) => void
}) {
  return (
    <section className="mb-8">
      <h3 className="mb-1 text-[11px] tracking-[0.2em] text-dim">TODAY</h3>
      {picked.length === 0 && <p className="flex h-14 items-center justify-center border-b border-line text-xs text-faint">下の一覧から足してください</p>}
      {picked.map((c, i) => {
        const s = c.exercise ? summaries?.get(c.exercise.id) : undefined
        const done = recorded.has(c.key)
        return (
          <div key={c.key} className="flex h-14 items-center border-b border-line">
            <span className="w-7 shrink-0 text-xs text-faint">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{c.name}</span>
              <span className="truncate text-[11px] leading-4 text-faint">
                {done ? '記録あり' : <Outlook c={c} s={s} />}
              </span>
            </span>
            <button
              onClick={() => onMove(i, -1)}
              disabled={i === 0}
              aria-label={`${c.name}を上へ`}
              className="flex h-12 w-10 shrink-0 items-center justify-center text-dim disabled:opacity-20"
            >
              <Icon name="up" size={18} />
            </button>
            <button
              onClick={() => onMove(i, 1)}
              disabled={i === picked.length - 1}
              aria-label={`${c.name}を下へ`}
              className="flex h-12 w-10 shrink-0 items-center justify-center text-dim disabled:opacity-20"
            >
              <Icon name="down" size={18} />
            </button>
            <button onClick={() => onDrop(c)} aria-label={`${c.name}を外す`} className="flex h-12 w-10 shrink-0 items-center justify-center text-faint">
              <Icon name="close" size={16} />
            </button>
          </div>
        )
      })}
    </section>
  )
}

/** 種目の一言: 今の最大重量と「次は重量アップ」。記録がなければ器具 */
function Outlook({ c, s }: { c: Candidate; s?: ExerciseSummary }) {
  if (!s || s.topWeight === null) return <>{EQUIPMENT_LABEL[c.equipment]}</>
  return (
    <>
      {fmtWeight(c.equipment, s.topWeight)}kg
      {s.weightUp && <span className="text-dim"> · 次は重量アップ</span>}
    </>
  )
}

/** 足せる種目: 選んだ部位ごとに。今日に入っていないものだけ */
function AddList({ parts, candidates, summaries, onAdd }: {
  parts: BodyPart[]
  candidates: Candidate[]
  summaries?: Map<string, ExerciseSummary>
  onAdd: (c: Candidate) => void
}) {
  const groups = parts.map((p) => ({ part: p, items: candidates.filter((c) => c.part === p) })).filter((g) => g.items.length)
  return (
    <>
      {groups.map((g) => (
        <section key={g.part} className="mb-6">
          <h3 className="mb-1 text-[11px] tracking-[0.2em] text-dim">{BODY_PART_LABEL[g.part]}</h3>
          {g.items.map((c) => {
            const s = c.exercise ? summaries?.get(c.exercise.id) : undefined
            return (
              <button key={c.key} onClick={() => onAdd(c)} className="flex h-14 w-full items-center gap-3 border-b border-line text-left">
                <span className="min-w-0 flex-1 truncate text-dim">{c.name}</span>
                {/* 既存の種目は今の最大重量と伸びを。自己ベスト一覧から選ぶ感覚に */}
                {s && s.topWeight !== null ? (
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-sm leading-none text-dim">
                      {fmtWeight(c.equipment, s.topWeight)}
                      <span className="ml-0.5 text-[10px] text-faint">kg</span>
                    </span>
                    <span className="mt-1 text-[11px] leading-none text-faint">
                      {s.gain && s.gain > 0 ? `+${num(s.gain)}` : ''}
                      {s.gain && s.gain > 0 && s.weightUp ? ' · ' : ''}
                      {s.weightUp ? '次は重量アップ' : ''}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-faint">{EQUIPMENT_LABEL[c.equipment]}</span>
                )}
                <Icon name="plus" size={18} className="shrink-0 text-faint" />
              </button>
            )
          })}
        </section>
      ))}
    </>
  )
}

/** 一覧にない種目を作る（名前だけキーボード。あとは選ぶだけ） */
function CreateExercise({ parts, onAdd }: { parts: BodyPart[]; onAdd: (c: Candidate) => void }) {
  const [name, setName] = useState('')
  const [part, setPart] = useState<BodyPart | null>(parts[0] ?? null)
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [heavy, setHeavy] = useState(false)
  const chip = (on: boolean) => `h-11 rounded-xl text-sm transition ${on ? 'bg-fg text-bg' : 'text-dim'}`

  return (
    <>
      <Question>新しい種目</Question>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="種目名"
          aria-label="種目名"
          autoFocus
          className="h-14 rounded-2xl bg-panel px-5 text-center text-lg placeholder:text-faint"
        />
        {parts.length > 1 && (
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-chip p-1">
            {parts.map((p) => (
              <button key={p} onClick={() => setPart(p)} className={chip(part === p)}>
                {BODY_PART_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-chip p-1">
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((eq) => (
            <button key={eq} onClick={() => setEquipment(eq)} className={chip(equipment === eq)}>
              {EQUIPMENT_LABEL[eq]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-chip p-1">
          <button onClick={() => setHeavy(true)} className={`${chip(heavy)} flex h-16 flex-col items-center justify-center`}>
            <span>高重量</span>
            <span className="text-[11px] opacity-60">3回×5 + バックオフ</span>
          </button>
          <button onClick={() => setHeavy(false)} className={`${chip(!heavy)} flex h-16 flex-col items-center justify-center`}>
            <span>中重量</span>
            <span className="text-[11px] opacity-60">8回×3</span>
          </button>
        </div>
      </div>
      <PrimaryButton
        disabled={!name.trim()}
        onClick={() => onAdd({ key: `new:${crypto.randomUUID()}`, name: name.trim(), part, equipment, heavy })}
      >
        追加
      </PrimaryButton>
    </>
  )
}

/** /today（?parts=chest,arms でホームから部位を選んで開く。?s=セッションID で記録画面から組み直す） */
export default function TodayPlanPage() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const asked = (params.get('parts')?.split(',') ?? []).filter((p): p is BodyPart => (BODY_PARTS as string[]).includes(p))
  const sessionId = params.get('s')
  // 組んでいる間に同期で選択が戻らないよう、初期値は開いた時に1回だけ読む
  const [initial, setInitial] = useState<Initial>()
  useEffect(() => {
    void loadInitial(sessionId).then(setInitial)
  }, [sessionId])
  if (!initial) return null
  return <TodayPlan initial={initial} asked={asked} onDone={(id) => nav(`/s/${id}`, { replace: true })} onCancel={() => nav(-1)} />
}
