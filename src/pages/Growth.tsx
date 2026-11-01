import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { anchorGrowth, type Growth } from '../data/repo'
import { fmtWeight, md, num } from '../lib/format'
import { fix } from '../lib/progression'
import { BODY_PART_LABEL } from '../lib/types'
import { nearestDate, TimeLine, valueAt } from '../ui/TimeLine'

/**
 * 履歴の「伸び」: 軸の種目ごとに、推定1RM（重量と回数を1回だけ挙げられる重さに換算）の推移と、
 * 同じ部位の計測（見た目の結果）を、同じ日付の範囲で上下に並べる（縦の目盛りが違うので重ねない）
 */
export function GrowthSection() {
  const list = useLiveQuery(anchorGrowth)
  if (!list) return null
  return (
    <section className="flex flex-col pb-8">
      <span className="text-center text-[11px] tracking-[0.2em] text-dim">GROWTH</span>
      <span className="mt-1 mb-5 text-center text-[11px] text-faint">軸の種目の推定1RMと、同じ部位の計測</span>
      {list.length === 0 ? (
        <p className="text-center text-xs leading-5 text-dim">
          部位ごとに「軸の種目」を決めると、ここに伸びが出ます
          <br />
          <span className="text-faint">設定の種目か、今日を組むで種目の名前をタップ</span>
        </p>
      ) : (
        list.map((g) => <GrowthCard key={g.ex.id} g={g} />)
      )}
    </section>
  )
}

function GrowthCard({ g }: { g: Growth }) {
  // 指でなぞっている日付（縦の細線）。null なら最新の値を出す
  const [at, setAt] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const head = <span className="text-[11px] text-dim">{BODY_PART_LABEL[g.part]} · {g.ex.name}</span>

  if (!g.lifts.length) {
    return (
      <div className="mb-8 flex flex-col gap-1">
        {head}
        <span className="text-xs text-faint">まだ記録がありません</span>
      </div>
    )
  }

  const mpts = g.measure?.points ?? []
  const dates = [...new Set([...g.lifts.map((p) => p.date), ...mpts.map((p) => p.date)])].sort()
  const domain: [string, string] = [dates[0], dates[dates.length - 1]]
  const first = g.lifts[0]
  const lift = (at ? valueAt(g.lifts, at) : null) ?? g.lifts[g.lifts.length - 1]
  const meas = at ? valueAt(mpts, at) : mpts[mpts.length - 1] ?? null
  const gain = fix(lift.value - first.value)
  const mgain = meas && mpts.length ? fix(meas.value - mpts[0].value) : 0

  function scrub(clientX: number) {
    const r = box.current!.getBoundingClientRect()
    setAt(nearestDate(dates, clientX - r.left, r.width, domain))
  }

  function onKey(e: React.KeyboardEvent) {
    const i = at ? dates.indexOf(at) : dates.length
    if (e.key === 'ArrowLeft') setAt(dates[Math.max(0, i - 1)])
    else if (e.key === 'ArrowRight') setAt(i + 1 < dates.length ? dates[i + 1] : null)
    else if (e.key === 'Escape') setAt(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="mb-8 flex flex-col">
      <div className="flex h-8 items-center justify-between">
        {head}
        <button onClick={() => setTable((t) => !t)} aria-expanded={table} className="-mr-2 h-8 px-2 text-[11px] text-faint">
          {table ? '閉じる' : '記録を見る'}
        </button>
      </div>

      {/* 値が先: なぞっている間はその日、ふだんは最新と初回からの伸び */}
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] leading-tight">
          {num(lift.value)}
          <span className="ml-0.5 text-[10px] text-faint">kg</span>
        </span>
        <span className="text-[11px] text-dim">推定1RM</span>
        <span className={`ml-auto text-[11px] ${!at && gain > 0 ? 'text-fg' : 'text-dim'}`}>
          {at ? md(lift.date) : g.lifts.length > 1 ? `${gain > 0 ? '+' : gain < 0 ? '−' : '±'}${num(Math.abs(gain))} · ${md(first.date)}から` : '1回目'}
        </span>
      </div>

      <div
        ref={box}
        tabIndex={0}
        aria-label={`${g.ex.name}の推定1RMの推移。左右キーで日付を選ぶ`}
        onPointerDown={(e) => scrub(e.clientX)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons) scrub(e.clientX)
        }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setAt(null)}
        onPointerCancel={() => setAt(null)}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
        className="mt-2 flex flex-col outline-none"
        style={{ touchAction: 'pan-y' }}
      >
        <TimeLine points={g.lifts} domain={domain} at={at} className="h-16 text-fg" />
        {g.measure && (
          <>
            <div className="mt-3 flex items-baseline gap-2 pl-9 text-[11px]">
              <span className="text-dim">{g.measure.label}</span>
              {meas ? (
                <>
                  <span className="text-sm text-fg">
                    {num(meas.value)}
                    <span className="ml-0.5 text-[10px] text-faint">cm</span>
                  </span>
                  <span className={`ml-auto ${!at && mgain > 0 ? 'text-fg' : 'text-dim'}`}>
                    {at ? `${md(meas.date)} 計測` : mpts.length > 1 ? `${mgain > 0 ? '+' : mgain < 0 ? '−' : '±'}${num(Math.abs(mgain))} · ${md(mpts[0].date)}から` : ''}
                  </span>
                </>
              ) : (
                <span className="text-faint">{mpts.length ? 'この日より前の計測なし' : '計測すると、ここに並びます'}</span>
              )}
            </div>
            {mpts.length > 0 && <TimeLine points={mpts} domain={domain} at={at} className="mt-1 h-10 text-dim" />}
          </>
        )}
        {/* 横軸: 範囲の始まりと終わりの日付だけ */}
        <DateAxis domain={domain} />
      </div>

      {table && (
        <div className="mt-3 flex flex-col border-t border-line">
          {[...g.lifts].reverse().map((p) => (
            <div key={p.date} className="flex h-10 items-center gap-4 border-b border-line text-sm">
              <span className="w-11 shrink-0 text-xs text-faint">{md(p.date)}</span>
              <span className="flex-1 text-dim">
                {fmtWeight(g.ex.equipment, p.set.weight_kg)}×{p.set.reps}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {num(p.value)}
                <span className="ml-0.5 text-[10px] text-faint">kg</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 横軸の両端の日付（左はグラフの縦の数字の余白のぶん下げる。1日だけなら真ん中） */
function DateAxis({ domain }: { domain: [string, string] }) {
  return (
    <div className={`mt-1 flex h-4 pl-9 text-[11px] leading-4 text-faint ${domain[0] === domain[1] ? 'justify-center' : 'justify-between'}`}>
      <span>{md(domain[0])}</span>
      {domain[0] !== domain[1] && <span>{md(domain[1])}</span>}
    </div>
  )
}
