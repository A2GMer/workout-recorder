import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { listExercises, listSessions, remove, sessionExercises, setsOf } from '../data/repo'
import { fmtVolume, md } from '../lib/format'
import { volume } from '../lib/progression'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'

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
      <main className="flex flex-col gap-2 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {rows?.map(({ s, total, count, name }) => (
          <div key={s.id} className="glass flex h-16 items-center rounded-[22px]">
            <Link to={`/s/${s.id}`} className="flex h-full min-w-0 flex-1 items-center gap-4 pl-5">
              <span className="w-11 shrink-0 text-sm text-faint">{md(s.date)}</span>
              <span className="min-w-0 flex-1 truncate font-light">{name ?? '—'}</span>
              <span className="shrink-0 text-lg font-light">{count ? fmtVolume(total) : ''}</span>
            </Link>
            <button
              onClick={() => confirm(`${md(s.date)} ${name ?? ''} 削除？`) && remove('sessions', s.id)}
              className="flex h-full w-12 shrink-0 items-center justify-center text-faint"
              aria-label="削除"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </main>
    </div>
  )
}
