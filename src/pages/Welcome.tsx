import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSettings, save } from '../data/repo'
import type { Settings } from '../lib/types'
import { BodyArt } from '../ui/BodyArt'
import { PrimaryButton, Question } from '../ui/Flow'
import { Icon, WaveArt } from '../ui/Icon'
import { HoldButton } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'
import { MenuWizard } from './MenuWizard'

const ONBOARDED_KEY = 'onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    // 保存できなくても続行
  }
}

type Step = 'intro' | 'body' | 'menu' | 'howto'

/**
 * 初回チュートリアル（一方通行）: はじめに → 体重 → メニュー作成（部位 → 種目 → 順番） → 使い方
 * /welcome?howto で使い方だけを見られる
 */
export default function Welcome() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const howtoOnly = params.has('howto')
  const [step, setStep] = useState<Step>(howtoOnly ? 'howto' : 'intro')

  function done() {
    markOnboarded()
    if (howtoOnly) nav(-1)
    else nav('/', { replace: true })
  }

  if (step === 'intro') {
    return (
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-10 px-8 pt-[env(safe-area-inset-top)]">
          <WaveArt className="h-56 w-auto text-fg" />
          <div className="text-center">
            <h1 className="text-[26px] leading-tight">前回を、1kgでも超える。</h1>
            <p className="mt-3 text-sm leading-6 text-dim">
              記録するたびに、前回を超える
              <br />
              次のメニューが自動で決まります。
            </p>
          </div>
        </div>
        <PrimaryButton onClick={() => setStep('body')}>はじめる</PrimaryButton>
      </div>
    )
  }

  if (step === 'body') return <BodyStep onBack={() => setStep('intro')} onNext={() => setStep('menu')} />

  if (step === 'menu') {
    return (
      <MenuWizard
        progress={{ offset: 1, total: 4 }}
        onCancel={() => setStep('body')}
        onDone={() => setStep('howto')}
      />
    )
  }

  return <HowTo onDone={done} />
}

function BodyStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const settings = useLiveQuery(getSettings)
  const value = useRef<number | null>(null)
  if (!settings) return null
  const bw = Math.round(settings.body_weight_kg)
  value.current = bw
  const add = (d: number) => {
    const v = Math.max(20, Math.min(250, (value.current ?? bw) + d))
    value.current = v
    void save<Settings>('settings', { ...settings, body_weight_kg: v })
  }
  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={onBack} title="はじめに" sub="1 / 4" />
      <Question sub="懸垂などの自重種目のボリューム計算に使います">体重は？</Question>
      <div className="flex flex-1 items-center justify-center gap-6">
        <HoldButton label="減らす" onFire={() => add(-1)} className="h-16 w-16 text-fg">
          <Icon name="minus" size={26} />
        </HoldButton>
        <span className="w-32 text-center text-6xl">
          {bw}
          <span className="ml-1 text-base text-dim">kg</span>
        </span>
        <HoldButton label="増やす" onFire={() => add(1)} className="h-16 w-16 text-fg">
          <Icon name="plus" size={26} />
        </HoldButton>
      </div>
      <PrimaryButton onClick={onNext}>次へ</PrimaryButton>
    </div>
  )
}

/** 使い方（4枚）。図は実際の画面の部品と同じ見た目で描く */
function HowTo({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const slides = [
    {
      title: 'メニューをタップで開始',
      body: '中央には次にやるメニューが表示されます。前回より挑戦的なほど、模様が激しく動きます。',
      art: <BodyArt parts={['chest', 'back']} intensity={0.8} className="h-48 w-48 text-fg" />,
    },
    {
      title: 'チェックで1セット記録',
      body: '提案どおりならタップ1回。重さや回数は数字をタップして ＋／− で調整します。',
      art: (
        <div className="flex w-72 items-center border-y border-line py-3">
          <span className="w-6 text-xs text-faint">1</span>
          <span className="w-20 text-right text-[26px]">105</span>
          <span className="w-6 text-center text-xs text-faint">×</span>
          <span className="text-[26px]">3</span>
          <span className="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-fg text-bg">
            <Icon name="check" size={20} />
          </span>
        </div>
      ),
    },
    {
      title: '左右にスワイプで次の種目',
      body: '上の数字は今日のボリューム。前回を超えるまでの進み具合を細い線で表示します。',
      art: (
        <div className="flex flex-col items-center">
          <span className="text-[56px] leading-none">1,575</span>
          <span className="mt-2 text-xs text-dim">/ 2,100</span>
          <div className="mt-4 h-px w-40 bg-line">
            <div className="h-px w-3/4 bg-fg" />
          </div>
          <div className="mt-8 flex gap-3">
            {[0, 1, 2].map((d) => (
              <span key={d} className={`h-1.5 w-1.5 rounded-full ${d === 0 ? 'bg-fg' : 'bg-faint'}`} />
            ))}
          </div>
        </div>
      ),
    },
    {
      title: '最後に疲労度',
      body: '軽かったか重かったかをゲージで。全セットできていれば、疲労度に合わせて次回の重量が上がります。',
      art: (
        <div className="flex w-72 items-center gap-4">
          <span className="text-xs text-dim">軽</span>
          <div className="relative h-px flex-1 bg-faint">
            <div className="h-px w-1/3 bg-fg" />
            <span className="absolute top-1/2 left-1/3 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg" />
          </div>
          <span className="text-xs text-dim">重</span>
        </div>
      ),
    },
  ]
  const s = slides[i]
  const last = i === slides.length - 1
  return (
    <div className="flex h-full flex-col">
      <TopBar
        onBack={i ? () => setI(i - 1) : undefined}
        title="使い方"
        side={88}
        right={
          <button onClick={onDone} className="h-11 px-3 text-sm whitespace-nowrap text-dim">
            スキップ
          </button>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-12 px-8">
        <div className="flex h-56 items-center justify-center">{s.art}</div>
        <div className="text-center">
          <h1 className="text-[22px]">{s.title}</h1>
          <p className="mt-3 text-sm leading-6 text-dim">{s.body}</p>
        </div>
        <div className="flex gap-2">
          {slides.map((_, d) => (
            <span key={d} className={`h-1.5 w-1.5 rounded-full ${d === i ? 'bg-fg' : 'bg-faint'}`} />
          ))}
        </div>
      </div>
      <PrimaryButton onClick={() => (last ? onDone() : setI(i + 1))}>{last ? 'はじめる' : '次へ'}</PrimaryButton>
    </div>
  )
}
