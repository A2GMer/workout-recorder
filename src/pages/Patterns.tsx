import { useState } from 'react'
import { BODY_PART_LABEL, type BodyPart } from '../lib/types'
import { BodyArt } from '../ui/BodyArt'
import { TopBar } from '../ui/TopBar'

/** 開発用: 部位ごとの模様と激しさの一覧 */
const PARTS = Object.keys(BODY_PART_LABEL) as BodyPart[]
const LEVELS = [
  { k: 0.2, label: '初回' },
  { k: 0.35, label: '再挑戦' },
  { k: 0.55, label: '+1刻み' },
  { k: 0.75, label: '+2刻み' },
  { k: 1, label: '+3刻み' },
]

export default function Patterns() {
  const [k, setK] = useState(0.55)
  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" title="Patterns" sub={`挑戦度 ${k}`} />
      <div className="flex justify-center gap-1 px-4 pb-4">
        {LEVELS.map((l) => (
          <button
            key={l.k}
            onClick={() => setK(l.k)}
            className={`h-10 rounded-full px-3 text-xs ${k === l.k ? 'bg-fg text-bg' : 'bg-chip text-dim'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 px-5 pb-16">
        {PARTS.map((p) => (
          <figure key={p} className="flex flex-col items-center gap-2">
            <BodyArt parts={[p]} intensity={k} className="aspect-square w-full text-fg" />
            <figcaption className="text-sm">{BODY_PART_LABEL[p]}</figcaption>
          </figure>
        ))}
        <figure className="flex flex-col items-center gap-2">
          <BodyArt parts={['chest', 'back']} intensity={k} className="aspect-square w-full text-fg" />
          <figcaption className="text-sm">胸 + 背中</figcaption>
        </figure>
        <figure className="flex flex-col items-center gap-2">
          <BodyArt parts={[]} intensity={k} className="aspect-square w-full text-fg" />
          <figcaption className="text-sm text-dim">未設定</figcaption>
        </figure>
      </div>
    </div>
  )
}
