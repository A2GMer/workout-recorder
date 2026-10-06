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

  return (
    <div className="flex h-full flex-col">
      <TopBar
        back="/"
        title={md(session.date)}
        right={
          <button
            onClick={editBodyWeight}
            className={`h-11 rounded-full px-3 text-sm transition ${editor?.key === 'bw' ? 'bg-line text-fg' : 'text-dim'}`}
            aria-label="体重"
          >
            {num(session.body_weight_kg)}
            <span className="ml-0.5 text-[11px] text-faint">kg</span>
          </button>
        }
      />
      <div className="flex justify-center">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`${i + 1}`}
            className="flex h-8 w-7 items-center justify-center"
          >
            <span
              className={`block h-1.5 rounded-full transition-all ${i === page ? 'w-4 bg-fg' : 'w-1.5 bg-faint/50'}`}
            />
          </button>
        ))}
      </div>
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
        <section className="flex h-full w-full shrink-0 grow-0 basis-full flex-col gap-2 overflow-y-auto px-5 pt-2 pb-56 [scrollbar-width:none] [&>*]:shrink-0">
          <div className="mb-4 flex h-[34px] items-center text-faint">
            <Icon name="plus" size={26} />
          </div>
          {unused.map((e) => (
            <button
              key={e.id}
              onClick={() => addExercise(e.id)}
              className="glass flex h-14 items-center rounded-[22px] px-5 text-left font-light transition active:scale-[0.98]"
            >
              <span className="truncate">{e.name}</span>
            </button>
          ))}
        </section>
      </div>
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
