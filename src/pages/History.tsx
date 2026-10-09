import { lazy, Suspense, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { getSettings, listExercises, listMeasurements, listSessions, localDate, remove, sessionProgress } from '../data/repo'
import { addMonths, monthGrid, WEEKDAYS } from '../lib/calendar'
import { fmtVolume, md, num } from '../lib/format'
import { figureOf, idealTargets, proposals } from '../lib/ideal'
import { BODY_PART_LABEL } from '../lib/types'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'

// 3D（three.js とモデル）は履歴を開いたときだけ読み込む
const Figure3D = lazy(() => import('../ui/Figure3D'))

/**
 * 全身図と「次に伸ばすところ」。
 * 直近の計測と身長から目標（lib/ideal.ts）を出し、足りない部位を強調する
 */
function Proportion() {
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const [latest] = await listMeasurements()
    const settings = await getSettings()
    const targets = idealTargets(latest ?? null, settings.height_cm)
    return { latest: latest ?? null, height: settings.height_cm, sex: settings.sex, targets, figure: figureOf(latest ?? null, targets) }
  })
  if (!data) return null
  const { latest, height, sex, targets, figure } = data
  const next = proposals(targets).slice(0, 3)
  const ready = !!height && !!latest
  return (
    <div className="flex flex-col items-center pt-2 pb-8">
      <Suspense fallback={<div className="h-80 w-full" />}>
        <Figure3D figure={figure} showTarget={ready} sex={sex} className="h-80 w-full" />
      </Suspense>
      {!height ? (
        <button onClick={() => nav('/settings')} className="mt-2 h-11 px-4 text-xs text-dim">
          身長を設定すると、足りない部位が出ます
        </button>
      ) : !latest ? (
        <button onClick={() => nav('/body/measure')} className="mt-2 h-11 px-4 text-xs text-dim">
          計測すると、足りない部位が出ます
        </button>
      ) : next.length === 0 ? (
        <span className="mt-4 text-xs text-dim">目標のプロポーションに届いています</span>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <span className="text-[11px] tracking-[0.2em] text-dim">NEXT</span>
          {next.map((p, i) => (
            <span key={p.label} className={`text-xs ${i === 0 ? 'text-fg' : 'text-dim'}`}>
              {p.label} あと {num(p.gap)} cm
              <span className="text-faint">　{p.parts.map((b) => BODY_PART_LABEL[b]).join('・')}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface Row {
  id: string
  date: string
  total: number
  count: number
  compared: number
  improved: number
  name?: string
}

export default function History() {
  const today = localDate()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)

  const data = useLiveQuery(async () => {
    const exercises = new Map((await listExercises(true)).map((e) => [e.id, e]))
    const routines = new Map((await db.routines.toArray()).map((r) => [r.id, r.name]))
    const rows: Row[] = []
    for (const s of await listSessions()) {
      // 総ボリューム、記録のある種目数、前回と比べられた種目数とそのうち前回を超えた数
      const { volume: total, recorded: count, compared, improved } = await sessionProgress(s, exercises)
      rows.push({ id: s.id, date: s.date, total, count, compared, improved, name: s.routine_id ? routines.get(s.routine_id) : undefined })
    }
    return { rows, measured: new Set((await listMeasurements()).map((m) => m.date)) }
  })
  const rows = data?.rows ?? []
  const measured = data?.measured ?? new Set<string>()

  // 積み上げ: 全期間の合計ボリュームと更新数。減ることはない
  const done = rows.filter((r) => r.count > 0)
  const lifetime = done.reduce((s, r) => s + r.total, 0)
  const improvedAll = rows.reduce((s, r) => s + r.improved, 0)
  const comparedAll = rows.reduce((s, r) => s + r.compared, 0)

  // 日ごとの状態: 記録があるか、全種目で前回を超えたか
  const byDate = new Map<string, Row[]>()
  for (const r of done) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const allImproved = (rs: Row[]) => rs.some((r) => r.compared > 0) && rs.every((r) => r.compared === 0 || r.improved === r.compared)

  const [y, m] = month.split('-').map(Number)
  const weeks = monthGrid(y, m)
  const daysDone = [...byDate.keys()].filter((d) => d.startsWith(month)).length
  const picked = byDate.get(selected) ?? []

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" title="履歴" />
      <main className="flex flex-col px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <Proportion />
        {done.length > 0 && (
          <div className="flex flex-col items-center pt-4 pb-8">
            <span className="text-[11px] tracking-[0.2em] text-dim">TOTAL</span>
            <span className="mt-3 text-[56px] leading-none tracking-tight">{fmtVolume(lifetime)}</span>
            <span className="mt-2 text-xs text-dim">
              {done.length}回{comparedAll ? ` · 更新 ${improvedAll}/${comparedAll} 種目` : ''}
            </span>
          </div>
        )}

        {/* カレンダー: 白丸 = 全種目で前回超え、輪 = 記録あり、下線 = 計測した日 */}
        <div className="flex h-12 items-center">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月" className="flex h-11 w-11 items-center justify-center text-dim">
            <Icon name="back" size={18} />
          </button>
          <span className="flex-1 text-center text-sm">
            {y}年{m}月
            {daysDone > 0 && <span className="ml-2 text-xs text-dim">{daysDone}回</span>}
          </span>
          <button
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={month >= today.slice(0, 7)}
            aria-label="次の月"
            className="flex h-11 w-11 items-center justify-center text-dim disabled:opacity-20"
          >
            <Icon name="back" size={18} className="rotate-180" />
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] tracking-[0.15em] text-faint">
          {WEEKDAYS.map((w) => (
            <span key={w} className="h-6 leading-6">
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {weeks.flat().map((d, i) => {
            if (!d) return <span key={i} />
            const rs = byDate.get(d)
            const isSel = d === selected
            const future = d > today
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                disabled={future}
                aria-label={d}
                aria-pressed={isSel}
                className="flex h-12 flex-col items-center justify-center gap-1"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isSel ? 'bg-fg text-bg' : future ? 'text-faint' : d === today ? 'text-fg' : 'text-dim'
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                <span className="flex h-2 items-center gap-1">
                  {rs && <span className={`block h-1.5 w-1.5 rounded-full ${allImproved(rs) ? 'bg-fg' : 'border border-dim'}`} />}
                  {measured.has(d) && <span className="block h-px w-2.5 bg-faint" />}
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 mb-4 text-center text-[11px] leading-5 text-faint">白丸 = 全種目で前回超え　輪 = 記録あり　線 = 計測</p>

        {/* 選んだ日のセッション */}
        <div className="border-t border-line">
          {picked.length === 0 ? (
            <p className="h-14 text-center text-xs leading-[3.5rem] text-faint">
              {md(selected)} {measured.has(selected) ? '計測のみ' : '記録なし'}
            </p>
          ) : (
            picked.map((r) => (
              <div key={r.id} className="flex h-16 items-center border-b border-line">
                <Link to={`/s/${r.id}`} className="flex h-full min-w-0 flex-1 items-center gap-4">
                  <span className="w-11 shrink-0 text-sm text-faint">{md(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name ?? '—'}</span>
                  <span className="shrink-0 text-lg">{fmtVolume(r.total)}</span>
                  {/* 前回を超えた種目数 / 比べられた種目数。全部超えたら白 */}
                  <span
                    className={`w-9 shrink-0 text-right text-xs ${r.compared && r.improved === r.compared ? 'text-fg' : 'text-dim'}`}
                    aria-label={r.compared ? `前回超え ${r.improved} / ${r.compared}` : undefined}
                  >
                    {r.compared ? (
                      <>
                        {r.improved}
                        <span className="text-faint">/{r.compared}</span>
                      </>
                    ) : (
                      ''
                    )}
                  </span>
                </Link>
                <button
                  onClick={() => confirm(`${md(r.date)} ${r.name ?? ''} 削除？`) && remove('sessions', r.id)}
                  className="flex h-full w-12 shrink-0 items-center justify-center text-faint"
                  aria-label="削除"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
