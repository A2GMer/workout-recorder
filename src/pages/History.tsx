import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { listExercises, listSessions, remove, sessionExercises, setsOf } from '../data/repo'
import { fmtVolume, md } from '../lib/format'
import { volume } from '../lib/progression'
import { TopBar } from '../ui/TopBar'

export default function History() {
  const rows = useLiveQuery(async () => {
    const exercises = new Map((await listExercises(true)).map((e) => [e.id, e]))
    const routines = new Map((await db.routines.toArray()).map((r) => [r.id, r.name]))
    const out = []
    for (const s of await listSessions()) {
      let total = 0
      let count = 0
      for (const se of await sessionExercises(s.id)) {
        const ex = exercises.get(se.exercise_id)
        const sets = await setsOf(se.id)
        if (!ex || !sets.length) continue
        total += volume(sets, ex.equipment, s.body_weight_kg)
        count++
      }
      out.push({ s, total, count, name: s.routine_id ? routines.get(s.routine_id) : undefined })
    }
    return out
  })

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" />
      <main className="flex flex-col gap-2 p-4">
        {rows?.map(({ s, total, count, name }) => (
          <div key={s.id} className="flex items-center rounded-xl bg-panel">
            <Link to={`/s/${s.id}`} className="flex flex-1 items-baseline gap-3 px-4 py-3">
              <span className="w-12 text-dim">{md(s.date)}</span>
              <span className="flex-1 truncate">{name ?? '—'}</span>
              <span className="font-bold">{count ? fmtVolume(total) : ''}</span>
            </Link>
            <button
              onClick={() => confirm(`${md(s.date)} ${name ?? ''} 削除？`) && remove('sessions', s.id)}
              className="px-4 py-3 text-dim"
              aria-label="削除"
            >
              ×
            </button>
          </div>
        ))}
      </main>
    </div>
  )
}
