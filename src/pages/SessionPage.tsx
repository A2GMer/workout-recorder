import { Fragment, lazy, Suspense, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  candidateOf,
  ensureExercises,
  exerciseHistory,
  exerciseSummary,
  getSettings,
  listCandidates,
  listExercises,
  listMeasurements,
  patch,
  previousPerformance,
  remove,
  save,
  sessionExercises,
  setsOf,
  uuid,
  type Candidate,
  type ExerciseSummary,
} from '../data/repo'
import { figureOf, idealTargets } from '../lib/ideal'
import { fmtVolume, fmtWeight, md, num } from '../lib/format'
import { partsOf } from '../lib/plan'
import { movementOf } from '../lib/presets'
import { fix, volume } from '../lib/progression'
import {
  BODY_PART_LABEL,
  BODY_PARTS,
  EQUIPMENT_LABEL,
  MOVEMENTS,
  type BodyPart,
  type Exercise,
  type Session,
  type SessionExercise,
  type Settings,
} from '../lib/types'
import { DIMS_OF_PART, MOTION_OF_PART, RANDOM } from '../ui/Figure3D'

// 背景の 3D は別チャンク
const Figure3D = lazy(() => import('../ui/Figure3D'))
import { Stepper, type Editor } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'
import { ExercisePanel, progressOf, type PanelData } from './ExercisePanel'

export default function SessionPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id!)
    if (!session || session.deleted) return null
    const settings = await getSettings()
    const exercises = await listExercises(true)
    const byId = new Map(exercises.map((e) => [e.id, e]))
    const ses = await sessionExercises(session.id)
    const panels: PanelData[] = []
    for (const se of ses) {
      const ex = byId.get(se.exercise_id)
      if (!ex) continue
      panels.push({
        se,
        ex,
        sets: await setsOf(se.id),
        prev: await previousPerformance(ex.id, session),
        history: await exerciseHistory(ex, session),
      })
    }
    const unused = exercises.filter((e) => !e.archived && !ses.some((s) => s.exercise_id === e.id))
    const [latest] = await listMeasurements()
    const figure = figureOf(latest ?? null, idealTargets(latest ?? null, settings.height_cm))
    return { session, settings, panels, unused, figure, hasBody: !!latest && !!settings.height_cm }
  }, [id])

  const [editor, setEditor] = useState<Editor | null>(null)
  const [page, setPage] = useState(0)
  // 種目の入れ替え先を選んでいるパネル
  const [replacing, setReplacing] = useState<SessionExercise | null>(null)
  // 入れ替え先の候補: 同じ動き → 同じ部位（どちらもまだ作っていない事前登録を含む）。作成済みの種目は今の最大重量つき
  const replaceOptions = useLiveQuery(async () => {
    if (!replacing) return null
    const ex = await db.exercises.get(replacing.exercise_id)
    if (!ex) return null
    const inSession = new Set((await sessionExercises(replacing.session_id)).map((se) => se.exercise_id))
    const pool = (await listCandidates()).filter((c) => !c.exercise || !inSession.has(c.exercise.id))
    const movement = movementOf(ex)
    const same = movement ? pool.filter((c) => c.movement === movement) : []
    const part = ex.body_part ? pool.filter((c) => c.part === ex.body_part && !same.includes(c)) : []
    const summaries = new Map(
      await Promise.all(pool.flatMap((c) => (c.exercise ? [c.exercise] : [])).map(async (e) => [e.id, await exerciseSummary(e)] as const)),
    )
    return { ex, movement, same, part, summaries }
  }, [replacing?.id])
  const scroller = useRef<HTMLDivElement>(null)

  if (data === undefined) return null
  if (data === null) return <TopBar back="/" />
  const { session, settings, panels, unused, figure, hasBody } = data

  function onScroll() {
    const el = scroller.current!
    setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goTo(i: number) {
    const el = scroller.current!
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  function editBodyWeight() {
    setEditor({
      key: 'bw',
      label: '体重',
      unit: 'kg',
      value: Math.round(session.body_weight_kg),
      step: 1,
      big: 5,
      min: 20,
      apply: (v) => {
        void patch<Session>('sessions', session.id, { body_weight_kg: v })
        void save<Settings>('settings', { ...settings, body_weight_kg: v })
      },
    })
  }

  /** 今日の順番を入れ替える（隣と sort_order を交換） */
  async function move(i: number, dir: -1 | 1) {
    const a = panels[i]?.se
    const b = panels[i + dir]?.se
    if (!a || !b) return
    await save<SessionExercise>('session_exercises', [
      { ...a, sort_order: b.sort_order },
      { ...b, sort_order: a.sort_order },
    ])
    requestAnimationFrame(() => goTo(i + dir))
  }

  /** 今日はやらない。記録があれば確認してから記録ごと外す */
  async function dropExercise(p: PanelData) {
    if (p.sets.length && !confirm(`${p.ex.name} の今日の記録ごと外しますか？`)) return
    for (const w of p.sets) await remove('work_sets', w.id)
    await remove('session_exercises', p.se.id)
  }

  /** 別の種目に入れ替える（記録がないときだけ。順番はそのまま）。まだ作っていない事前登録はここで作る */
  async function replaceExercise(se: SessionExercise, c: Candidate) {
    setReplacing(null)
    const [exerciseId] = await ensureExercises([c])
    await patch<SessionExercise>('session_exercises', se.id, { exercise_id: exerciseId })
  }

  async function addExercise(exerciseId: string) {
    await save<SessionExercise>('session_exercises', {
      id: uuid(),
      session_id: session.id,
      exercise_id: exerciseId,
      sort_order: Math.max(-1, ...panels.map((p) => p.se.sort_order)) + 1,
      fatigue: 50,
      comment: '',
    })
    requestAnimationFrame(() => {
      const el = scroller.current!
      el.scrollTo({ left: panels.length * el.clientWidth, behavior: 'smooth' })
    })
  }

  const total = panels.length + 1
  const current = panels[page]
  // 足す・入れ替える種目は部位ごとに。今日の部位を先に
  const todayParts = partsOf(panels.map((p) => p.ex.body_part))
  // 背景の全身図で強調する部位 = 開いている種目の部位
  const emphasis = new Set(current?.ex.body_part ? DIMS_OF_PART[current.ex.body_part] : [])
  const bgMotion = (current?.ex.body_part && MOTION_OF_PART[current.ex.body_part]) || RANDOM
  // 前回を超えた種目のドットは白く灯る。進むほど灯りが増える
  const beaten = panels.map((p) => {
    if (!p.sets.length) return false
    const actual = volume(p.sets, p.ex.equipment, session.body_weight_kg)
    const prevVolume = p.prev
      ? volume([...p.prev.prev.main, ...p.prev.prev.backoff], p.ex.equipment, p.prev.session.body_weight_kg)
      : null
    return progressOf(p.sets, actual, prevVolume, p.history).beat
  })
  const title = current ? current.ex.name : '今日'
  const sub = current
    ? `${current.ex.anchor ? '軸 · ' : ''}${current.ex.target_reps}回 × ${current.ex.main_sets}${current.ex.pyramid ? ' + B' : ''}`
    : md(session.date)

  return (
    <div className="relative flex h-full flex-col">
      {/* 背景: 対象部位を強調した全身図を薄く。操作は受けない */}
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex items-center justify-center opacity-25">
        <Suspense fallback={null}>
          <Figure3D figure={figure} showTarget={hasBody} emphasis={emphasis} sex={settings.sex} motion={bgMotion} className="h-[62%] w-full max-w-[420px]" />
        </Suspense>
      </div>
      <TopBar
        back="/"
        title={title}
        sub={sub}
        right={
          <button
            onClick={editBodyWeight}
            className={`h-11 rounded-xl px-2 text-sm transition ${editor?.key === 'bw' ? 'bg-chip text-fg' : 'text-dim'}`}
            aria-label="体重"
          >
            {num(session.body_weight_kg)}
            <span className="ml-0.5 text-[11px] text-faint">kg</span>
          </button>
        }
      />
      <div ref={scroller} onScroll={onScroll} className="snap-x-panels relative flex min-h-0 flex-1 overflow-x-auto">
        {panels.map((p, i) => (
          <ExercisePanel
            key={p.se.id}
            data={p}
            session={session}
            settings={settings}
            activeKey={editor?.key ?? null}
            openEditor={setEditor}
            closeEditor={() => setEditor(null)}
            arrange={{
              canBack: i > 0,
              canForward: i < panels.length - 1,
              onMove: (dir) => void move(i, dir),
              onDrop: () => void dropExercise(p),
              onReplace: !p.sets.length ? () => setReplacing(p.se) : undefined,
            }}
          />
        ))}
        <section className="no-scrollbar flex h-full w-full shrink-0 grow-0 basis-full flex-col overflow-y-auto px-5 pt-4 pb-56 [&>*]:shrink-0">
          <TodaySummary panels={panels} session={session} />
          {unused.length > 0 && (
            <span className="mt-8 border-b border-line pb-2 text-[11px] tracking-[0.15em] text-dim">ADD</span>
          )}
          {byPart(unused, todayParts).map((g) => (
            <Fragment key={g.label}>
              <span className="mt-4 text-[11px] text-faint">{g.label}</span>
              {g.items.map((e) => (
                <button
                  key={e.id}
                  onClick={() => addExercise(e.id)}
                  className="flex h-14 items-center justify-between border-b border-line text-left transition active:text-dim"
                >
                  <span className="truncate">{e.name}</span>
                  <Icon name="plus" size={18} className="shrink-0 text-faint" />
                </button>
              ))}
            </Fragment>
          ))}
        </section>
      </div>
      {!editor && (
        <div className="flex shrink-0 items-center px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <span className="w-11 shrink-0" />
          <div className="flex min-w-0 flex-1 justify-center">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`${i + 1}`}
                className="flex h-10 w-9 min-w-0 shrink items-center justify-center"
              >
                <span
                  className={`block shrink-0 rounded-full transition ${
                    i === page ? 'h-2 w-2 bg-fg' : beaten[i] ? 'h-1.5 w-1.5 bg-fg' : 'h-1.5 w-1.5 bg-faint'
                  }`}
                />
              </button>
            ))}
          </div>
          {/* 今日の種目を一覧で組み直す（順番・足す・外す）。片手で届く右下に */}
          <button
            onClick={() => nav(`/today?s=${session.id}`)}
            aria-label="組み直す"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dim transition active:text-fg"
          >
            <Icon name="list" />
          </button>
        </div>
      )}
      {replacing && (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-[28px] border-t border-line bg-panel px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="relative flex h-12 items-center justify-center px-12">
            <span className="truncate text-sm">{replaceOptions ? `${replaceOptions.ex.name} の代わり` : '入れ替える種目'}</span>
            <button onClick={() => setReplacing(null)} aria-label="閉じる" className="absolute right-0 flex h-11 w-11 items-center justify-center text-dim">
              <Icon name="down" />
            </button>
          </div>
          {/* 同じ動き（器具や種目を替えても同じところに効く）→ 同じ部位。混んでいるときはここから */}
          {replaceOptions?.movement && (
            <ReplaceGroup
              label={`同じ動き · ${MOVEMENTS[replaceOptions.movement].label}`}
              items={replaceOptions.same}
              summaries={replaceOptions.summaries}
              onPick={(c) => void replaceExercise(replacing, c)}
            />
          )}
          {replaceOptions?.ex.body_part && (
            <ReplaceGroup
              label={`${BODY_PART_LABEL[replaceOptions.ex.body_part]}のほかの種目`}
              items={replaceOptions.part}
              summaries={replaceOptions.summaries}
              onPick={(c) => void replaceExercise(replacing, c)}
            />
          )}
          {/* ほかの部位は作成済みの種目だけ。今日の部位を先に */}
          {byPart(unused.filter((e) => e.body_part !== replaceOptions?.ex.body_part), todayParts).map((g) => (
            <ReplaceGroup
              key={g.label}
              label={g.label}
              items={g.items.map(candidateOf)}
              summaries={replaceOptions?.summaries}
              onPick={(c) => void replaceExercise(replacing, c)}
            />
          ))}
        </div>
      )}
      {editor && (
        <Stepper
          editor={editor}
          onChange={(v) => {
            editor.apply(v)
            setEditor({ ...editor, value: v })
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}

/** 入れ替え先のまとまり。作成済みの種目は今の最大重量、まだなら器具を右に */
function ReplaceGroup({ label, items, summaries, onPick }: {
  label: string
  items: Candidate[]
  summaries?: Map<string, ExerciseSummary>
  onPick: (c: Candidate) => void
}) {
  if (!items.length) return null
  return (
    <>
      <span className="mt-4 block text-[11px] text-faint">{label}</span>
      {items.map((c) => {
        const top = c.exercise ? summaries?.get(c.exercise.id)?.topWeight : null
        return (
          <button
            key={c.key}
            onClick={() => onPick(c)}
            className="flex h-14 w-full items-center gap-3 border-b border-line text-left transition active:text-dim"
          >
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="shrink-0 text-[11px] text-faint">
              {top !== null && top !== undefined ? `${fmtWeight(c.equipment, top)}kg` : EQUIPMENT_LABEL[c.equipment]}
            </span>
            <Icon name="arrow" size={18} className="shrink-0 text-faint" />
          </button>
        )
      })}
    </>
  )
}

/** 種目を部位ごとに。first の部位を先に（重複は無視）、部位のない種目は最後に */
function byPart(exercises: Exercise[], first: BodyPart[]): { label: string; items: Exercise[] }[] {
  const order = [...new Set([...first, ...BODY_PARTS])]
  return [
    ...order.map((p) => ({ label: BODY_PART_LABEL[p], items: exercises.filter((e) => e.body_part === p) })),
    { label: 'その他', items: exercises.filter((e) => !e.body_part) },
  ].filter((g) => g.items.length)
}

/**
 * 最後のパネルの「今日のまとめ」。終了ボタンの代わりに、ここまでの到達点を一目で。
 * 合計ボリューム / 前回比（前回と比べられる種目の合計）/ 更新した種目数 / 自己ベスト数
 */
function TodaySummary({ panels, session }: { panels: PanelData[]; session: Session }) {
  const bw = session.body_weight_kg
  let total = 0
  let actualCompared = 0
  let prevCompared = 0
  let compared = 0
  let improved = 0
  let bests = 0
  let recorded = 0
  for (const p of panels) {
    if (!p.sets.length) continue
    recorded += p.sets.length
    const actual = volume(p.sets, p.ex.equipment, bw)
    total += actual
    const prevVolume = p.prev ? volume([...p.prev.prev.main, ...p.prev.prev.backoff], p.ex.equipment, p.prev.session.body_weight_kg) : null
    const { beat, isBest } = progressOf(p.sets, actual, prevVolume, p.history)
    if (prevVolume !== null) {
      compared++
      actualCompared += actual
      prevCompared += prevVolume
      if (beat) improved++
    }
    if (isBest) bests++
  }
  if (!recorded) return null
  const delta = fix(actualCompared - prevCompared)
  const allBeat = compared > 0 && improved === compared
  const marks: string[] = []
  if (compared) marks.push(`更新 ${improved}/${compared} 種目`)
  if (bests) marks.push(`自己ベスト ${bests}`)
  return (
    <div className="flex flex-col items-center border-b border-line pb-8">
      <span className="text-[11px] tracking-[0.2em] text-dim">TODAY</span>
      <span className="mt-3 text-[56px] leading-none tracking-tight">{fmtVolume(total)}</span>
      <span className={`mt-2 h-4 text-xs leading-4 ${delta > 0 ? 'text-fg' : 'text-dim'}`}>
        {compared ? (delta > 0 ? `+${fmtVolume(delta)}` : `あと ${fmtVolume(Math.max(1, -delta + 1))}`) : ''}
      </span>
      <span className={`mt-1 h-4 text-[11px] leading-4 ${allBeat ? 'text-fg' : 'text-dim'}`}>{marks.join(' · ')}</span>
    </div>
  )
}
