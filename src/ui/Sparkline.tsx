/**
 * 計測値の推移を描く細い折れ線。モノクロ・線のみ。
 * 横は等間隔（計測回ごと）、縦は最小〜最大に合わせる。最後の点だけ白い丸。
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const W = 200
  const H = 36
  const PAD = 4
  const n = values.length
  if (n === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const x = (i: number) => (n === 1 ? W / 2 : PAD + ((W - PAD * 2) * i) / (n - 1))
  const y = (v: number) => (span === 0 ? H / 2 : H - PAD - ((H - PAD * 2) * (v - min)) / span)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
  const last = n - 1
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ aspectRatio: `${W} / ${H}` }}
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={d} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {values.map((v, i) =>
        i === last ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={1.5} fill="var(--color-bg)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ),
      )}
      <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="currentColor" stroke="none" />
    </svg>
  )
}
