import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  getSettings,
  listExercises,
  patch,
  previousPerformance,
  save,
  sessionExercises,
  setsOf,
  uuid,
} from '../data/repo'
import { md, num } from '../lib/format'
import type { Session, SessionExercise, Settings } from '../lib/types'
import { Stepper, type Editor } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'
import { ExercisePanel, type PanelData } from './ExercisePanel'

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
      panels.push({ se, ex, sets: await setsOf(se.id), prev: await previousPerformance(ex.id, session) })
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
      value: session.body_weight_kg,
      step: 0.1,
      big: 1,
      min: 0,
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
  const title = current ? current.ex.name : '種目を追加'
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
