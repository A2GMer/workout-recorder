import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { lastSessionOf, listRoutines, startSession } from '../data/repo'
import { md } from '../lib/format'
import { TopBar } from '../ui/TopBar'

export default function Home() {
  const nav = useNavigate()
  const routines = useLiveQuery(async () => {
    const rs = await listRoutines()
    return Promise.all(rs.map(async (r) => ({ ...r, last: await lastSessionOf(r.id) })))
  })

  async function start(id: string) {
    nav(`/s/${await startSession(id)}`)
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        right={
          <nav className="flex gap-1 text-xl">
            <Link to="/history" className="px-2" aria-label="履歴">
              ☰
            </Link>
            <Link to="/settings" className="px-2" aria-label="設定">
              ⚙
            </Link>
          </nav>
        }
      />
      <main className="flex flex-1 flex-col gap-3 p-4">
        {routines?.map((r) => (
          <button
            key={r.id}
            onClick={() => start(r.id)}
            className="flex items-baseline justify-between rounded-2xl bg-panel px-5 py-6 text-left active:bg-line"
          >
            <span className="text-xl font-bold">{r.name}</span>
            {r.last && <span className="text-sm text-dim">{md(r.last.date)}</span>}
          </button>
        ))}
        {routines?.length === 0 && (
          <Link
            to="/settings"
            className="rounded-2xl border border-dashed border-line py-10 text-center text-3xl text-dim"
          >
            ＋
          </Link>
        )}
      </main>
    </div>
  )
}
