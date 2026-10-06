import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { lastSessionOf, listRoutines, localDate, startSession } from '../data/repo'
import { md } from '../lib/format'
import { Glyph, Icon, WaveArt } from '../ui/Icon'
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
    <div className="flex h-full flex-col">
      <TopBar
        title={md(localDate())}
        side={96}
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

      <div className="flex min-h-0 flex-1 items-center justify-center py-6">
        <WaveArt className="h-full max-h-[440px] w-auto text-fg" />
      </div>

      <nav className="no-scrollbar flex shrink-0 snap-x gap-2 overflow-x-auto px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        {routines?.map((r, i) => (
          <button
            key={r.id}
            onClick={() => start(r.id)}
            className="flex w-[84px] shrink-0 snap-center first:ml-auto last:mr-auto flex-col items-center gap-2 text-dim transition active:text-fg"
          >
            <Glyph index={i} size={56} />
            <span className="w-full truncate text-center text-[13px] leading-4 text-fg">{r.name}</span>
            <span className="h-3 text-[11px] leading-3 text-faint">{r.last ? md(r.last.date) : ''}</span>
          </button>
        ))}
        {routines?.length === 0 && (
          <button onClick={() => nav('/settings')} className="mx-auto flex flex-col items-center gap-2 text-dim">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-faint">
              <Icon name="plus" />
            </span>
            <span className="text-[13px]">メニューを作成</span>
          </button>
        )}
      </nav>
    </div>
  )
}
