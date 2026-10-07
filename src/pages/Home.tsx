import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  allImproved,
  getSettings,
  lastSessionOf,
  listMeasurements,
  listRoutines,
  listSessions,
  localDate,
  routineProfile,
  routineSummary,
  sessionProgress,
  startSession,
} from '../data/repo'
import { isMeasureDue } from '../lib/measure'
import { md } from '../lib/format'
import { BodyArt } from '../ui/BodyArt'
import { Icon } from '../ui/Icon'
import { IconButton, TopBar } from '../ui/TopBar'
import { isOnboarded } from './Welcome'

export default function Home() {
  const nav = useNavigate()
  const routines = useLiveQuery(async () => {
    const rs = await listRoutines()
    return Promise.all(
      rs.map(async (r) => ({
        ...r,
        last: await lastSessionOf(r.id),
        profile: await routineProfile(r.id),
        streak: (await routineSummary(r.id)).streak,
      })),
    )
  })

  // 直近のセッションの連なり（古い → 新しい）。全種目で前回を超えた回は塗りつぶし
  const chain = useLiveQuery(async () => {
    const recent = (await listSessions()).slice(0, CHAIN_LENGTH)
    const results = await Promise.all(recent.map(async (s) => ({ s, p: await sessionProgress(s) })))
    return results.filter((r) => r.p.compared > 0).reverse()
  })

  const measureDue = useLiveQuery(async () => {
    const [last] = await listMeasurements()
    return isMeasureDue(last?.date ?? null, (await getSettings()).measure_interval_days, localDate())
  })
  const [snoozed, setSnoozed] = useState(() => readSnooze() === localDate())

  // 次にやるメニュー = 未実施、または最後に行ってから一番時間が空いているもの
  const next = routines?.length
    ? [...routines].sort((a, b) => (a.last?.date ?? '') .localeCompare(b.last?.date ?? '') || a.sort_order - b.sort_order)[0]
    : undefined

  // 初回（メニューが1つもなく、チュートリアル未完了）はチュートリアルへ
  if (routines?.length === 0 && !isOnboarded()) return <Navigate to="/welcome" replace />

  async function start(id: string) {
    nav(`/s/${await startSession(id)}`)
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={md(localDate())}
        side={132}
        right={
          <>
            <IconButton label="からだ" onClick={() => nav('/body')}>
              <Icon name="tape" />
            </IconButton>
            <IconButton label="履歴" onClick={() => nav('/history')}>
              <Icon name="history" />
            </IconButton>
            <IconButton label="設定" onClick={() => nav('/settings')}>
              <Icon name="settings" />
            </IconButton>
          </>
        }
      />

      {measureDue && !snoozed && (
        <div className="mx-5 mt-1 flex h-14 shrink-0 items-center rounded-2xl bg-panel pl-4">
          <span className="min-w-0 flex-1 truncate text-sm">そろそろ計測の時期です</span>
          <button onClick={() => nav('/body/measure')} className="h-10 shrink-0 rounded-full bg-fg px-4 text-sm text-bg">
            計測する
          </button>
          <button
            onClick={() => {
              writeSnooze(localDate())
              setSnoozed(true)
            }}
            aria-label="今日は表示しない"
            className="flex h-12 w-11 shrink-0 items-center justify-center text-faint"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <button
        onClick={() => next && start(next.id)}
        disabled={!next}
        aria-label={next ? `${next.name}を開始` : undefined}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-8 py-6"
      >
        <BodyArt
          parts={next?.profile.parts ?? []}
          intensity={next?.profile.intensity ?? 0.2}
          className="aspect-square max-h-[340px] min-h-0 w-full max-w-[340px] flex-1 text-fg"
        />
        {next && (
          <span className="flex flex-col items-center gap-1">
            <span className="text-[11px] tracking-[0.2em] text-dim">NEXT</span>
            <span className="text-lg">{next.name}</span>
            {/* 今日の見どころ: 重量が上がる種目数と、守っている連続更新 */}
            <span className="h-4 text-[11px] leading-4 text-dim">{outlook(next.profile.weightUps, next.streak)}</span>
          </span>
        )}
      </button>

      {chain && chain.length > 0 && (
        <button
          onClick={() => nav('/history')}
          aria-label={`直近 ${chain.length} 回のうち、全種目で前回を超えた回 ${chain.filter((c) => allImproved(c.p)).length}`}
          className="mx-auto flex h-10 shrink-0 items-center gap-2.5 px-4"
        >
          {chain.map(({ s, p }) => (
            <span
              key={s.id}
              className={`block h-2 w-2 rounded-full ${allImproved(p) ? 'bg-fg' : p.improved > 0 ? 'border border-dim' : 'border border-faint'}`}
            />
          ))}
        </button>
      )}

      <nav className="no-scrollbar flex shrink-0 snap-x gap-2 overflow-x-auto px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        {routines?.map((r) => (
          <button
            key={r.id}
            onClick={() => start(r.id)}
            className={`flex w-[84px] shrink-0 snap-center flex-col items-center gap-2 transition first:ml-auto last:mr-auto active:text-fg ${
              r.id === next?.id ? 'text-fg' : 'text-dim'
            }`}
          >
            <BodyArt parts={r.profile.parts} intensity={r.profile.intensity} detail={0.55} clip className="h-14 w-14" />
            <span className="w-full truncate text-center text-[13px] leading-4 text-fg">{r.name}</span>
            <span className="h-3 text-[11px] leading-3 text-faint">{r.last ? md(r.last.date) : ''}</span>
          </button>
        ))}
        <button
          onClick={() => nav('/menu/new')}
          className="flex w-[84px] shrink-0 snap-center flex-col items-center gap-2 text-dim transition first:ml-auto last:mr-auto active:text-fg"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-faint">
            <Icon name="plus" />
          </span>
          <span className="text-[13px] leading-4">メニュー作成</span>
          <span className="h-3" />
        </button>
      </nav>
    </div>
  )
}

/** ホーム下部の連なりに出す直近セッション数 */
const CHAIN_LENGTH = 12

/** NEXT の下の一言。何もなければ空（初回など） */
function outlook(weightUps: number, streak: number): string {
  const marks: string[] = []
  if (weightUps > 0) marks.push(`重量アップ ${weightUps} 種目`)
  if (streak > 0) marks.push(`${streak}回連続更新中`)
  return marks.join(' · ')
}

// 計測のお知らせを「今日は表示しない」にした日
const SNOOZE_KEY = 'measure-snooze'
function readSnooze() {
  try {
    return localStorage.getItem(SNOOZE_KEY)
  } catch {
    return null
  }
}
function writeSnooze(date: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, date)
  } catch {
    // 保存できなくても続行
  }
}
