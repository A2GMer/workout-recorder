import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { getSettings, listExercises, listMeasurements, listSessions, remove, sessionProgress } from '../data/repo'
import { fmtVolume, md, num } from '../lib/format'
import { figureOf, idealTargets, proposals } from '../lib/ideal'
import { BODY_PART_LABEL } from '../lib/types'
import { FigureArt } from '../ui/FigureArt'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'

/**
 * 全身図と「次に伸ばすところ」。
 * 直近の計測と身長から目標（lib/ideal.ts）を出し、足りない部位を斜線で強調する
 */
function Proportion() {
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const [latest] = await listMeasurements()
    const settings = await getSettings()
    const targets = idealTargets(latest ?? null, settings.height_cm)
    return { latest: latest ?? null, height: settings.height_cm, targets, figure: figureOf(latest ?? null, targets) }
  })
  if (!data) return null
  const { latest, height, targets, figure } = data
  const next = proposals(targets).slice(0, 3)
  const ready = !!height && !!latest
  return (
    <div className="flex flex-col items-center pt-2 pb-8">
      <FigureArt figure={figure} heightCm={height ?? 170} showTarget={ready} className="h-72 text-fg" />
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

export default function History() {
  const rows = useLiveQuery(async () => {
    const exercises = new Map((await listExercises(true)).map((e) => [e.id, e]))
    const routines = new Map((await db.routines.toArray()).map((r) => [r.id, r.name]))
    const out = []
    for (const s of await listSessions()) {
      // 総ボリューム、記録のある種目数、前回と比べられた種目数とそのうち前回を超えた数
      const { volume: total, recorded: count, compared, improved } = await sessionProgress(s, exercises)
      out.push({ s, total, count, compared, improved, name: s.routine_id ? routines.get(s.routine_id) : undefined })
    }
    return out
  })

  const anyCompared = rows?.some((r) => r.compared > 0)
  // 積み上げ: 全期間の合計ボリュームと更新数。減ることはない
  const lifetime = rows?.reduce((s, r) => s + r.total, 0) ?? 0
  const sessionsDone = rows?.filter((r) => r.count > 0).length ?? 0
  const improvedAll = rows?.reduce((s, r) => s + r.improved, 0) ?? 0
  const comparedAll = rows?.reduce((s, r) => s + r.compared, 0) ?? 0

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" title="履歴" />
      <main className="flex flex-col px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <Proportion />
        {sessionsDone > 0 && (
          <div className="flex flex-col items-center pt-4 pb-8">
            <span className="text-[11px] tracking-[0.2em] text-dim">TOTAL</span>
            <span className="mt-3 text-[44px] leading-none tracking-tight">{fmtVolume(lifetime)}</span>
            <span className="mt-2 text-xs text-dim">
              {sessionsDone}回{comparedAll ? ` · 更新 ${improvedAll}/${comparedAll} 種目` : ''}
            </span>
          </div>
        )}
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
