import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { lastSessionOf, listRoutines, startSession } from '../data/repo'
import { md } from '../lib/format'
import { Icon } from '../ui/Icon'
import { IconButton, TopBar } from '../ui/TopBar'

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
          <>
            <IconButton label="履歴" onClick={() => nav('/history')}>
              <Icon name="history" />
            </IconButton>
            <IconButton label="設定" onClick={() => nav('/settings')}>
              <Icon name="settings" />
            </IconButton>
          </>
        }
      />
      <div className="flex min-h-40 flex-1 items-center justify-center">
        <div className="grad h-32 w-32 rounded-full opacity-80 blur-[2px] shadow-[0_0_90px_rgb(169_155_255/0.5)]" />
      </div>
      <main className="flex flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {routines?.map((r) => (
          <button
            key={r.id}
            onClick={() => start(r.id)}
            className="glass flex items-center justify-between rounded-[28px] px-7 py-7 text-left transition active:scale-[0.98]"
          >
            <span className="min-w-0 truncate text-2xl font-light tracking-tight">{r.name}</span>
            <span className="ml-4 shrink-0 text-sm text-faint">{r.last ? md(r.last.date) : ''}</span>
          </button>
        ))}
        {routines?.length === 0 && (
          <button
            onClick={() => nav('/settings')}
            aria-label="メニューを作成"
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-line text-dim"
          >
            <Icon name="plus" size={28} />
          </button>
        )}
      </main>
    </div>
  )
}
