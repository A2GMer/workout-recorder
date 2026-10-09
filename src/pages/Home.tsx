import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import { figureOf, idealTargets, proposals, type DimKey } from '../lib/ideal'
import { isMeasureDue } from '../lib/measure'
import { md, num } from '../lib/format'
import { fix } from '../lib/progression'
import { MEASURE_ITEMS, type BodyPart, type Measurement } from '../lib/types'
import { DIMS_OF_PART, RANDOM } from '../ui/Figure3D'

// 3D（three.js とモデル）は別チャンク。読み込むまでは線画を出す
const Figure3D = lazy(() => import('../ui/Figure3D'))
import { Backdrop } from '../ui/Backdrop'
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

  const body = useLiveQuery(async () => {
    const list = await listMeasurements()
    const settings = await getSettings()
    const targets = idealTargets(list[0] ?? null, settings.height_cm)
    return {
      list,
      height: settings.height_cm,
      sex: settings.sex,
      figure: figureOf(list[0] ?? null, targets),
      due: isMeasureDue(list[0]?.date ?? null, settings.measure_interval_days, localDate()),
    }
  })
  const measureDue = body?.due
  const [snoozed, setSnoozed] = useState(() => readSnooze() === localDate())

  // 次にやるメニュー = 未実施、または最後に行ってから一番時間が空いているもの
  const next = routines?.length
    ? [...routines].sort((a, b) => (a.last?.date ?? '') .localeCompare(b.last?.date ?? '') || a.sort_order - b.sort_order)[0]
    : undefined

  // 初回（メニューが1つもなく、チュートリアル未完了）はチュートリアルへ
  if (routines?.length === 0 && !isOnboarded()) return <Navigate to="/welcome" replace />

  const art = (
    <BodyArt
      parts={next?.profile.parts ?? []}
      intensity={next?.profile.intensity ?? 0.2}
      className="aspect-square max-h-[340px] min-h-0 w-full max-w-[340px] flex-1 text-fg"
    />
  )

  async function start(id: string) {
    nav(`/s/${await startSession(id)}`)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* 背景: 昇る粒子と広がるさざ波 */}
      <Backdrop className="pointer-events-none absolute inset-0 h-full w-full" />
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

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 py-4">
        <div className="rise relative flex aspect-square max-h-[340px] min-h-0 w-full max-w-[340px] flex-1 items-center justify-center">
          {body ? (
            <Suspense fallback={art}>
              <Figure3D
                figure={body.figure}
                showTarget={!!body.height && body.list.length > 0}
                emphasis={emphasisOf(next?.profile.parts ?? [])}
                sex={body.sex}
                motion={RANDOM}
                className="h-full w-full text-fg"
              />
            </Suspense>
          ) : (
            art
          )}
          {/* 足元の輪。ゆっくり呼吸する */}
          <div className="pointer-events-none absolute bottom-[4%] left-1/2 w-44 -translate-x-1/2">
            <svg viewBox="0 0 176 16" className="breathe h-4 w-full text-fg" fill="none" stroke="currentColor" aria-hidden="true">
              <ellipse cx="88" cy="8" rx="86" ry="6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
        {next && (
          <button
            onClick={() => start(next.id)}
            aria-label={`${next.name}を開始`}
            style={{ '--delay': '0.15s' } as React.CSSProperties}
            className="rise flex flex-col items-center gap-1 rounded-2xl px-6 py-2 transition active:bg-panel"
          >
            <span className="text-[11px] tracking-[0.2em] text-dim">NEXT</span>
            <span className="flex items-center gap-2 text-lg">
              {next.name}
              <Icon name="arrow" size={18} className="nudge text-dim" />
            </span>
            {/* 今日の見どころ: 重量が上がる種目数と、守っている連続更新 */}
            <span className="h-4 text-[11px] leading-4 text-dim">{outlook(next.profile.weightUps, next.streak)}</span>
          </button>
        )}
      </div>

      {body && (
        <div className="rise relative" style={{ '--delay': '0.3s' } as React.CSSProperties}>
          <BodyStrip list={body.list} height={body.height} onOpen={() => nav('/body')} onMeasure={() => nav('/body/measure')} onHeight={() => nav('/settings')} />
        </div>
      )}

      {chain && chain.length > 0 && (
        <button
          onClick={() => nav('/history')}
          aria-label={`直近 ${chain.length} 回のうち、全種目で前回を超えた回 ${chain.filter((c) => allImproved(c.p)).length}`}
          style={{ '--delay': '0.4s' } as React.CSSProperties}
          className="rise relative mx-auto flex h-10 shrink-0 items-center gap-2.5 px-4"
        >
          {chain.map(({ s, p }, i) => (
            <span
              key={s.id}
              className={`block h-2 w-2 rounded-full ${allImproved(p) ? 'bg-fg' : p.improved > 0 ? 'border border-dim' : 'border border-faint'} ${
                i === chain.length - 1 ? 'pulse-ring text-fg' : ''
              }`}
            />
          ))}
        </button>
      )}

      <nav
        style={{ '--delay': '0.5s' } as React.CSSProperties}
        className="no-scrollbar rise relative flex shrink-0 snap-x gap-2 overflow-x-auto px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+2rem)]"
      >
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

/**
 * からだの数字。常に出す。
 * 上段: 初回からの変化（大きい順）。下段: 魅力的な体まで「あと何cm」（不足の割合が大きい順・上位3つ）
 * 左右がある項目は平均。変化が 0 の項目は出さない
 */
function BodyStrip({ list, height, onOpen, onMeasure, onHeight }: {
  list: Measurement[]
  height: number | null
  onOpen: () => void
  onMeasure: () => void
  onHeight: () => void
}) {
  const latest = list[0]
  const first = list[list.length - 1]
  const avg = (m: Measurement, keys: (keyof Measurement)[]) => {
    const vs = keys.map((k) => m[k]).filter((v): v is number => typeof v === 'number')
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null
  }
  const changes =
    list.length >= 2
      ? MEASURE_ITEMS.flatMap((item) => {
          const a = avg(latest, item.keys)
          const b = avg(first, item.keys)
          if (a === null || b === null) return []
          const d = Math.round((a - b) * 2) / 2
          return d === 0 ? [] : [{ label: item.label, delta: fix(d), unit: item.unit }]
        }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
      : []
  const next = proposals(idealTargets(latest ?? null, height)).slice(0, 3)

  // 日付や「あと」は動かさず、その右だけがゆっくり右から左へ流れてループする
  const Row = ({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) => (
    <button onClick={onClick} className="flex h-9 w-full items-center gap-4 pl-5 text-left whitespace-nowrap">
      <span className="w-8 shrink-0 text-[10px] tracking-[0.15em] text-faint">{label}</span>
      <Marquee>{children}</Marquee>
    </button>
  )

  return (
    <div className="shrink-0 pb-1">
      {/* 初回からの変化 */}
      {!latest ? (
        <Row label="BODY" onClick={onMeasure}>
          <span className="text-xs text-dim">計測すると、からだの変化がここに出ます</span>
        </Row>
      ) : changes.length === 0 ? (
        <Row label="BODY" onClick={onOpen}>
          <span className="text-xs text-dim">{list.length < 2 ? `${md(latest.date)} 計測 · 次の計測で変化が出ます` : '初回から変化なし'}</span>
        </Row>
      ) : (
        <Row label={md(first.date)} onClick={onOpen}>
          {changes.map((c) => (
            <span key={c.label} className="flex shrink-0 items-baseline gap-1">
              <span className="text-[11px] text-dim">{c.label}</span>
              <span className={`text-sm ${c.delta > 0 ? 'text-fg' : 'text-dim'}`}>
                {c.delta > 0 ? `+${num(c.delta)}` : `−${num(-c.delta)}`}
                {c.unit === 'kg' && <span className="ml-0.5 text-[10px] text-faint">kg</span>}
              </span>
            </span>
          ))}
        </Row>
      )}
      {/* 魅力的な体まで */}
      {latest &&
        (!height ? (
          <Row label="あと" onClick={onHeight}>
            <span className="text-xs text-faint">身長を設定すると、目標まであと何cmか出ます</span>
          </Row>
        ) : next.length === 0 ? (
          <Row label="あと" onClick={onOpen}>
            <span className="text-xs text-dim">目標のプロポーションに届いています</span>
          </Row>
        ) : (
          <Row label="あと" onClick={() => onOpen()}>
            {next.map((p) => (
              <span key={p.label} className="flex shrink-0 items-baseline gap-1">
                <span className="text-[11px] text-dim">{p.label}</span>
                <span className="text-sm text-fg">
                  {num(p.gap)}
                  <span className="ml-0.5 text-[10px] text-faint">cm</span>
                </span>
              </span>
            ))}
          </Row>
        ))}
    </div>
  )
}

/**
 * 横に流れる帯。中身が入り切るときは動かさない。
 * 中身を2つ並べて半分ぶん動かすことで継ぎ目なくループする。速さは一定（px/秒）
 */
function Marquee({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLSpanElement>(null)
  const [dur, setDur] = useState<number | null>(null)
  useEffect(() => {
    const measure = () => {
      const w = first.current?.scrollWidth ?? 0
      const boxW = box.current?.clientWidth ?? 0
      setDur(w > boxW ? (w + MARQUEE_GAP) / MARQUEE_SPEED : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [children])
  return (
    <div ref={box} className="min-w-0 flex-1 overflow-hidden">
      <div className={`flex w-max items-center ${dur ? 'marquee' : ''}`} style={{ gap: MARQUEE_GAP, ['--dur' as string]: `${dur ?? 0}s` }}>
        <span ref={first} className="flex items-center" style={{ gap: MARQUEE_GAP }}>
          {children}
        </span>
        {dur && (
          <span aria-hidden="true" className="flex items-center" style={{ gap: MARQUEE_GAP }}>
            {children}
          </span>
        )}
      </div>
    </div>
  )
}
const MARQUEE_GAP = 20 // px
const MARQUEE_SPEED = 28 // px/秒

/** ホーム下部の連なりに出す直近セッション数 */
const CHAIN_LENGTH = 12

/** 今日鍛える部位 → 強調する骨の部位 */
function emphasisOf(parts: BodyPart[]): Set<DimKey> {
  return new Set(parts.flatMap((p) => DIMS_OF_PART[p]))
}

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
