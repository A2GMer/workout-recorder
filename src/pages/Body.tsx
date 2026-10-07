import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { getSettings, listMeasurements, saveMeasurement, trainingSince } from '../data/repo'
import { md, num } from '../lib/format'
import { bodySummary, isAtBest, nextMeasureDate } from '../lib/measure'
import { fix } from '../lib/progression'
import { MEASURE_ITEMS, measureLabel, type MeasureKey, type Measurement } from '../lib/types'
import { PrimaryButton } from '../ui/Flow'
import { Sparkline } from '../ui/Sparkline'
import { Stepper, type Editor } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'

const SIDE = ['左', '右']

function Delta({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="text-faint">—</span>
  return <span className={value > 0 ? 'text-fg' : 'text-dim'}>{value > 0 ? `+${num(value)}` : `−${num(-value)}`}</span>
}

const diff = (a?: number | null, b?: number | null) => (a == null || b == null ? null : fix(a - b))

/** /body: 最新の計測と、前回・初回からの変化。行をタップでその項目の推移 */
export default function Body() {
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const list = await listMeasurements()
    return {
      list,
      settings: await getSettings(),
      // 最後の計測からの積み上げ（次の計測で見えるはずのもの）
      since: list[0] ? await trainingSince(list[0].date) : null,
    }
  })
  const [open, setOpen] = useState<MeasureKey | null>(null)
  if (!data) return null
  const { list, settings, since } = data
  const [latest, prev] = list
  const first = list[list.length - 1]
  const next = nextMeasureDate(latest?.date ?? null, settings.measure_interval_days)
  const hasHistory = list.length > 1
  const summary = bodySummary(list)

  return (
    <div className="flex h-full flex-col">
      <TopBar back="/" title="からだ" sub={latest ? `${md(latest.date)} 計測 ・ 次回 ${md(next!)}` : 'まだ記録がありません'} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {latest && (
          <>
            {/* 前進のまとめ: 初回からいちばん伸びた部位を大きく。下に伸びた項目数と、今が最大の項目数 */}
            {hasHistory && summary.total > 0 && (
              <div className="flex flex-col items-center pt-4 pb-8">
                <span className="text-[11px] tracking-[0.2em] text-dim">SINCE {md(first.date)}</span>
                {summary.top ? (
                  <span className="mt-3 flex items-baseline gap-2">
                    <span className="text-base text-dim">{measureLabel(summary.top.key)}</span>
                    <span className="text-[44px] leading-none tracking-tight">+{num(summary.top.delta)}</span>
                    <span className="text-xs text-dim">cm</span>
                  </span>
                ) : (
                  <span className="mt-3 text-[44px] leading-none tracking-tight text-dim">—</span>
                )}
                <span className="mt-3 text-xs text-dim">
                  大きくなった {summary.grown}/{summary.total} 項目
                  {summary.atBest > 0 && <span className="text-fg"> · 今が最大 {summary.atBest}</span>}
                </span>
              </div>
            )}
            {/* 最後の計測からの努力量。次の計測への期待 */}
            {since && since.sessions > 0 && (
              <p className={`${hasHistory && summary.total > 0 ? '' : 'pt-4 '}pb-6 text-center text-xs text-dim`}>
                前回の計測から {since.sessions}回
                {since.compared > 0 && ` · 更新 ${since.improved}/${since.compared} 種目`}
              </p>
            )}
            <div className="flex h-10 items-end border-b border-line pb-2 text-[11px] tracking-[0.15em] text-dim">
              <span className="flex-1" />
              <span className="w-16 text-right">NOW</span>
              <span className="w-16 text-right">{prev ? md(prev.date) : ''}</span>
              <span className="w-16 text-right">{list.length > 2 ? md(first.date) : ''}</span>
            </div>
            {MEASURE_ITEMS.map((item) =>
              item.keys.map((k, i) => {
                const isOpen = open === k
                // 今が過去いちばんなら NOW を白く、そうでなければ少し落とす（体重は判定せず白）
                const best = isAtBest(list, k)
                const nowTone = best === false ? 'text-dim' : 'text-fg'
                return (
                  <div key={k} className="border-b border-line">
                    <button
                      onClick={() => hasHistory && setOpen(isOpen ? null : k)}
                      aria-expanded={isOpen}
                      className="flex h-12 w-full items-center text-left text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-dim">
                        {i === 0 ? item.label : ''}
                        {item.keys.length > 1 && <span className="ml-2 text-faint">{SIDE[i]}</span>}
                      </span>
                      <span className={`w-16 text-right text-base ${isOpen ? 'text-fg' : nowTone}`}>
                        {latest[k] ?? '—'}
                        <span className="ml-0.5 text-[10px] text-faint">{item.unit}</span>
                      </span>
                      <span className="w-16 text-right text-xs">{prev && <Delta value={diff(latest[k], prev[k])} />}</span>
                      <span className="w-16 text-right text-xs">{list.length > 2 && <Delta value={diff(latest[k], first[k])} />}</span>
                    </button>
                    {isOpen && <Trend list={list} k={k} unit={item.unit} />}
                  </div>
                )
              }),
            )}
            <p className="mt-3 text-xs leading-5 text-faint">
              中央の列は前回から、右の列は初回からの変化{hasHistory ? '。白い値は今が過去いちばん。行をタップで推移' : ''}
            </p>
          </>
        )}
      </div>
      <PrimaryButton onClick={() => nav('/body/measure')}>計測する</PrimaryButton>
    </div>
  )
}

/** 1項目の推移: 折れ線 + 計測ごとの値（古い → 新しい） */
function Trend({ list, k, unit }: { list: Measurement[]; k: MeasureKey; unit: string }) {
  // 値のある計測だけ、古い順に
  const points = [...list].reverse().flatMap((m) => (m[k] == null ? [] : [{ date: m.date, value: m[k] }]))
  if (points.length < 2) return <p className="pb-4 text-xs text-faint">まだ比べられる記録がありません</p>
  return (
    <div className="pb-4">
      <Sparkline values={points.map((p) => p.value)} className="mt-1 w-full text-fg" />
      <div className="no-scrollbar mt-3 flex gap-5 overflow-x-auto">
        {points.map((p, i) => {
          const last = i === points.length - 1
          const d = i ? diff(p.value, points[i - 1].value) : null
          return (
            <div key={p.date} className="flex shrink-0 flex-col items-end">
              <span className={`text-sm leading-none ${last ? 'text-fg' : 'text-dim'}`}>
                {num(p.value)}
                <span className="ml-0.5 text-[10px] text-faint">{unit}</span>
              </span>
              <span className="mt-1.5 text-[10px] leading-none text-faint">{md(p.date)}</span>
              <span className="mt-1 h-3 text-[10px] leading-none">{d !== null && <Delta value={d} />}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** /body/measure: 前回の値から始めて、変わった項目だけタップで増減 */
export function Measure() {
  const nav = useNavigate()
  const latest = useLiveQuery(async () => (await listMeasurements())[0] ?? null)
  const [values, setValues] = useState<Partial<Record<MeasureKey, number>>>({})
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  if (latest === undefined) return null

  const value = (k: MeasureKey) => values[k] ?? latest?.[k] ?? null

  function edit(k: MeasureKey, unit: 'kg' | 'cm', label: string) {
    const isKg = unit === 'kg'
    setEditor({
      key: k,
      label,
      unit,
      value: value(k) ?? (isKg ? 70 : 30),
      step: isKg ? 1 : 0.5,
      big: 5,
      min: 0,
      format: num,
      apply: (v) => setValues((vs) => ({ ...vs, [k]: v })),
    })
  }

  async function submit() {
    setBusy(true)
    const row: Partial<Measurement> = {}
    for (const item of MEASURE_ITEMS) for (const k of item.keys) row[k] = value(k)
    await saveMeasurement(row)
    nav('/body', { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={() => nav(-1)} title="計測" sub={latest ? `前回 ${md(latest.date)} の値から` : undefined} />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-56">
        {MEASURE_ITEMS.map((item) => (
          <div key={item.label} className="flex h-16 items-center border-b border-line">
            <span className="min-w-0 flex-1 truncate text-sm text-dim">{item.label}</span>
            {item.keys.map((k, i) => {
              const v = value(k)
              const changed = values[k] !== undefined && values[k] !== latest?.[k]
              const active = editor?.key === k
              return (
                <button
                  key={k}
                  onClick={() => edit(k, item.unit, item.keys.length > 1 ? `${item.label} ${SIDE[i]}` : item.label)}
                  className={`ml-1 flex h-12 w-20 shrink-0 flex-col items-end justify-center rounded-xl px-2 transition ${
                    active ? 'bg-chip' : ''
                  }`}
                >
                  <span className={`text-xl leading-none ${changed ? 'text-fg' : v === null ? 'text-faint' : 'text-dim'}`}>
                    {item.keys.length > 1 && <span className="mr-1 text-[10px] text-faint">{SIDE[i]}</span>}
                    {v === null ? '—' : num(v)}
                  </span>
                  <span className="mt-1 h-3 text-[10px] leading-none">
                    {changed && latest?.[k] != null ? <Delta value={diff(v, latest[k])} /> : null}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {editor ? (
        <Stepper
          editor={editor}
          onChange={(v) => {
            editor.apply(v)
            setEditor({ ...editor, value: v })
          }}
          onClose={() => setEditor(null)}
        />
      ) : (
        <PrimaryButton disabled={busy} onClick={submit}>
          記録する
        </PrimaryButton>
      )}
    </div>
  )
}
