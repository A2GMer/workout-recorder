import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, localDate, monthReview, type MonthPart } from '../data/repo'
import { fmtVolume, md, num } from '../lib/format'
import { BODY_PART_LABEL } from '../lib/types'

/** その月の回数・合計ボリューム・更新（履歴の行から集める） */
export interface MonthTotals {
  sessions: number
  volume: number
  compared: number
  improved: number
}

const COLS = 'grid grid-cols-[2.25rem_1fr_1fr_4.5rem] gap-x-2'

/**
 * 月のふりかえり（履歴のカレンダーで見ている月）: 回数 · 合計 · 更新 と、部位ごとに
 * 重量（軸の種目の推定1RMの変化）· 見た目（計測の変化）· 量（週あたりのセット数 / 目安）を1枚に
 */
export function MonthReview({ month, totals, scrollIntoView }: {
  month: string
  totals: MonthTotals
  /** ホームの案内から来たときは、ここまでスクロールする */
  scrollIntoView?: boolean
}) {
  const data = useLiveQuery(async () => ({ review: await monthReview(month), target: (await getSettings()).weekly_sets }), [month])
  const ref = useRef<HTMLElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!scrollIntoView || !data || scrolled.current) return
    scrolled.current = true
    ref.current?.scrollIntoView({ block: 'start' })
  }, [scrollIntoView, data])

  if (!data) return null
  const { review, target } = data
  // 今月はまだ途中なので「（11/10まで）」と添える
  const partial = month === localDate().slice(0, 7)

  return (
    <section ref={ref} className="flex scroll-mt-16 flex-col pt-10">
      <span className="text-center text-[11px] tracking-[0.2em] text-dim">MONTH</span>
      <span className="mt-1 text-center text-sm">
        {Number(month.slice(5))}月のまとめ
        {partial && <span className="ml-1 text-[11px] text-faint">（{md(review.to)}まで）</span>}
      </span>
      <span className="mt-1 mb-5 text-center text-xs text-dim">
        {totals.sessions
          ? `${totals.sessions}回 · 合計 ${fmtVolume(totals.volume)}${totals.compared ? ` · 更新 ${totals.improved}/${totals.compared} 種目` : ''}`
          : 'この月の記録はありません'}
      </span>

      {review.parts.length > 0 && (
        <>
          <div className={`${COLS} border-b border-line pb-1 text-[11px] text-faint`}>
            <span />
            <span>重量</span>
            <span>見た目</span>
            <span className="text-right">週のセット</span>
          </div>
          {review.parts.map((p) => (
            <PartRow key={p.part} p={p} target={target} />
          ))}
          <p className="mt-3 text-[11px] leading-5 text-faint">
            重量 = 軸の種目の推定1RMの変化（前の月の最後の回から）。見た目 = 同じ部位の計測の変化。週のセット = その月の1週間あたり / 目安
          </p>
        </>
      )}
    </section>
  )
}

function PartRow({ p, target }: { p: MonthPart; target: number }) {
  return (
    <div className={`${COLS} h-14 items-center border-b border-line`}>
      <span className="text-xs text-dim">{BODY_PART_LABEL[p.part]}</span>
      <Cell delta={p.lift?.delta} unit="kg" sub={p.lift?.name ?? '軸の種目なし'} />
      <Cell delta={p.measure?.delta} unit="cm" sub={p.measure?.label ?? (p.part === 'core' ? '' : '計測なし')} />
      <span className="text-right">
        <span className={`text-base ${p.weekly >= target ? 'text-fg' : 'text-dim'}`}>{num(p.weekly)}</span>
        <span className="text-[10px] text-faint"> / {target}</span>
      </span>
    </div>
  )
}

/** 変化の数字（増えたら白）と、その下に何の変化か */
function Cell({ delta, unit, sub }: { delta?: number; unit: string; sub: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      {delta === undefined ? (
        <span className="text-base text-faint">—</span>
      ) : (
        <span className={`text-base ${delta > 0 ? 'text-fg' : 'text-dim'}`}>
          {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
          {num(Math.abs(delta))}
          <span className="ml-0.5 text-[10px] text-faint">{unit}</span>
        </span>
      )}
      <span className="truncate text-[11px] leading-4 text-faint">{sub}</span>
    </span>
  )
}
