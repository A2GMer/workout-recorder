import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  exerciseHistory,
  getSettings,
  listExercises,
  patch,
  previousPerformance,
  save,
  sessionExercises,
  setsOf,
  uuid,
} from '../data/repo'
import { fmtVolume, md, num } from '../lib/format'
import { fix, volume } from '../lib/progression'
import type { Session, SessionExercise, Settings } from '../lib/types'
import { Stepper, type Editor } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'
import { ExercisePanel, progressOf, type PanelData } from './ExercisePanel'

export default function SessionPage() {
  const { id } = useParams()
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
    return { session, settings, panels, unused }
  }, [id])

  const [editor, setEditor] = useState<Editor | null>(null)
  const [page, setPage] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  if (data === undefined) return null
  if (data === null) return <TopBar back="/" />
  const { session, settings, panels, unused } = data

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
      label: 'BODY',
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
  const title = current ? current.ex.name : '今日'
  const sub = current
    ? `${current.ex.target_reps}回 × ${current.ex.main_sets}${current.ex.pyramid ? ' + B' : ''}`
    : md(session.date)

  return (
    <div className="flex h-full flex-col">
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
      <div ref={scroller} onScroll={onScroll} className="snap-x-panels flex min-h-0 flex-1 overflow-x-auto">
        {panels.map((p) => (
          <ExercisePanel
            key={p.se.id}
            data={p}
            session={session}
            settings={settings}
            activeKey={editor?.key ?? null}
            openEditor={setEditor}
            closeEditor={() => setEditor(null)}
          />
        ))}
        <section className="no-scrollbar flex h-full w-full shrink-0 grow-0 basis-full flex-col overflow-y-auto px-5 pt-4 pb-56 [&>*]:shrink-0">
          <TodaySummary panels={panels} session={session} />
          {unused.length > 0 && (
            <span className="mt-8 border-b border-line pb-2 text-[11px] tracking-[0.15em] text-dim">ADD</span>
          )}
          {unused.map((e) => (
            <button
              key={e.id}
              onClick={() => addExercise(e.id)}
              className="flex h-14 items-center justify-between border-b border-line text-left transition active:text-dim"
            >
              <span className="truncate">{e.name}</span>
              <Icon name="plus" size={18} className="shrink-0 text-faint" />
            </button>
          ))}
        </section>
      </div>
      {!editor && (
        <div className="flex shrink-0 justify-center pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`${i + 1}`}
              className="flex h-10 w-9 items-center justify-center"
            >
              <span className={`block h-1.5 w-1.5 rounded-full transition ${i === page ? 'bg-fg' : 'bg-faint'}`} />
            </button>
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
