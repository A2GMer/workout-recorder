import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../data/db'
import { listExercises, listSessions, previousPerformance, remove, sessionExercises, setsOf } from '../data/repo'
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
      let compared = 0 // 前回の記録があり比べられた種目
      let improved = 0 // そのうち前回の種目ボリュームを超えた種目
      for (const se of await sessionExercises(s.id)) {
        const ex = exercises.get(se.exercise_id)
        const sets = await setsOf(se.id)
        if (!ex || !sets.length) continue
        const v = volume(sets, ex.equipment, s.body_weight_kg)
        total += v
        count++
        const prev = await previousPerformance(ex.id, s)
        if (prev) {
          compared++
          if (v > volume([...prev.prev.main, ...prev.prev.backoff], ex.equipment, prev.session.body_weight_kg)) improved++
        }
      }
      out.push({ s, total, count, compared, improved, name: s.routine_id ? routines.get(s.routine_id) : undefined })
    }
    return out
  })

  const anyCompared = rows?.some((r) => r.compared > 0)

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" title="履歴" />
      <main className="flex flex-col px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {rows?.map(({ s, total, count, compared, improved, name }) => (
          <div key={s.id} className="flex h-16 items-center border-b border-line">
            <Link to={`/s/${s.id}`} className="flex h-full min-w-0 flex-1 items-center gap-4">
              <span className="w-11 shrink-0 text-sm text-faint">{md(s.date)}</span>
              <span className="min-w-0 flex-1 truncate">{name ?? '—'}</span>
              <span className="shrink-0 text-lg">{count ? fmtVolume(total) : ''}</span>
              {/* 前回を超えた種目数 / 比べられた種目数。全部超えたら白 */}
              <span
                className={`w-9 shrink-0 text-right text-xs ${compared && improved === compared ? 'text-fg' : 'text-dim'}`}
                aria-label={compared ? `前回超え ${improved} / ${compared}` : undefined}
              >
                {compared ? (
                  <>
                    {improved}
                    <span className="text-faint">/{compared}</span>
                  </>
                ) : (
                  ''
                )}
              </span>
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
        {anyCompared && <p className="mt-3 text-xs leading-5 text-faint">右の数字は、前回を超えた種目 / 前回と比べられた種目</p>}
      </main>
    </div>
  )
}
