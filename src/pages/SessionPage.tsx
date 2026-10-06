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
            className={`rounded-lg px-2 py-1 text-sm text-dim ${editor?.key === 'bw' ? 'ring-2 ring-accent' : ''}`}
            aria-label="体重"
          >
            {num(session.body_weight_kg)}kg
          </button>
        }
      />
      <div className="flex justify-center gap-1.5 py-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === page ? 'bg-fg' : 'bg-line'}`} />
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
        <section className="flex h-full w-screen shrink-0 flex-col gap-2 overflow-y-auto px-4 pt-3 pb-40">
          <div className="text-center text-3xl text-dim">＋</div>
          {unused.map((e) => (
            <button key={e.id} onClick={() => addExercise(e.id)} className="rounded-xl bg-panel px-4 py-3 text-left">
              {e.name}
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
