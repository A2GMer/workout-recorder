import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import {
  exerciseSummary,
  getSettings,
  journey,
  listExercises,
  listRoutines,
  patch,
  routineSummary,
  save,
  type ExerciseSummary,
} from '../data/repo'
import { supabase } from '../data/supabase'
import { BODY_PART_LABEL, EQUIPMENT_LABEL, type BodyPart, type Equipment, type Exercise, type Settings } from '../lib/types'
import { Icon } from '../ui/Icon'
import { BodyArt } from '../ui/BodyArt'
import { TopBar } from '../ui/TopBar'
import { HoldButton } from '../ui/Stepper'
import { fmtWeight, md, num } from '../lib/format'
import { fix } from '../lib/progression'

const inputCls = 'h-11 rounded-xl bg-chip px-4 placeholder:text-faint'

/** フォーカスが外れた時だけ保存する入力欄 */
function TextField({ value, onCommit, className, ...rest }: {
  value: string
  onCommit: (v: string) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue'>) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      className={`${inputCls} ${className ?? ''}`}
      {...rest}
    />
  )
}

/** タップ（長押しで連続）で増減する数値。キーボードは使わない */
function StepField({ label, value, step, min, max, unit, format = (v) => num(v), onChange }: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  unit?: string
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  const [local, setLocal] = useState(value)
  const cur = useRef(value)
  // 外から値が変わったら追従（自分の操作中の値とは一致する）
  useEffect(() => {
    cur.current = value
    setLocal(value)
  }, [value])
  const add = (d: number) => {
    let v = fix(cur.current + d)
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    if (v === cur.current) return
    cur.current = v
    setLocal(v)
    onChange(v)
  }
  return (
    <div className="flex h-14 items-center justify-between gap-3">
      <span className="text-sm text-dim">{label}</span>
      <span className="flex items-center gap-1">
        <HoldButton label={`${label}を減らす`} onFire={() => add(-step)} className="h-11 w-11 text-dim">
          <Icon name="minus" size={18} />
        </HoldButton>
        <span className="w-16 text-center text-lg">
          {format(local)}
          {unit && <span className="ml-0.5 text-[11px] text-faint">{unit}</span>}
        </span>
        <HoldButton label={`${label}を増やす`} onFire={() => add(step)} className="h-11 w-11 text-dim">
          <Icon name="plus" size={18} />
        </HoldButton>
      </span>
    </div>
  )
}

/** 決まった候補から選ぶ数値 */
function ChoiceField({ label, value, options, unit, onChange }: {
  label: string
  value: number
  options: number[]
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <span className="text-sm text-dim">
        {label}
        {unit && <span className="ml-1 text-[11px] text-faint">{unit}</span>}
      </span>
      <div className="flex gap-1 rounded-xl bg-chip p-1">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={`h-10 flex-1 rounded-lg text-sm transition ${value === o ? 'bg-fg text-bg' : 'text-dim'}`}
          >
            {num(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex h-12 items-center justify-between" role="switch" aria-checked={checked}>
      <span className="text-sm text-dim">{label}</span>
      <span className={`mr-8 flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? 'bg-fg' : 'bg-line'}`}>
        <span className={`h-5 w-5 rounded-full transition ${checked ? 'bg-bg' : 'bg-dim'} ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="px-2 text-[11px] tracking-[0.2em] text-dim">{title}</h2>
    {children}
  </section>
)

const AddButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="flex h-14 items-center justify-center rounded-2xl border border-dashed border-line text-faint active:text-fg"
  >
    <Icon name="plus" />
  </button>
)

export default function SettingsPage() {
  const data = useLiveQuery(async () => {
    const exercises = await listExercises()
    const routines = await listRoutines()
    return {
      settings: await getSettings(),
      exercises,
      routines,
      // 歩み: 種目ごとの最大重量と伸び、メニューごとの回数と連続更新、はじめてからの日数
      exerciseSummaries: new Map(await Promise.all(exercises.map(async (e) => [e.id, await exerciseSummary(e)] as const))),
      routineSummaries: new Map(await Promise.all(routines.map(async (r) => [r.id, await routineSummary(r.id)] as const))),
      journey: await journey(),
    }
  })
  const nav = useNavigate()
  const [open, setOpen] = useState<string | null>(null)
  if (!data) return null
  const { settings, exercises, routines, exerciseSummaries, routineSummaries } = data

  const saveSettings = (c: Partial<Settings>) => save<Settings>('settings', { ...settings, ...c })

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        back="/"
        title="設定"
        sub={data.journey ? `${md(data.journey.firstDate)} から ${data.journey.days}日 ・ ${data.journey.sessions}回` : undefined}
      />
      <main className="flex flex-col gap-8 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+4rem)]">
        <Section title="BODY">
          <div className="flex flex-col rounded-2xl bg-panel px-5 py-1">
            <StepField label="体重" unit="kg" step={1} min={20} max={250} value={Math.round(settings.body_weight_kg)} onChange={(v) => saveSettings({ body_weight_kg: v })} />
            <StepField
              label="身長"
              unit="cm"
              step={1}
              min={100}
              max={250}
              value={settings.height_cm ?? 170}
              format={(v) => (settings.height_cm === null ? '—' : num(v))}
              onChange={(v) => saveSettings({ height_cm: v })}
            />
            <StepField label="EZバー" unit="kg" step={0.5} min={0} value={settings.ez_bar_kg} onChange={(v) => saveSettings({ ez_bar_kg: v })} />
            <StepField label="スミスバー" unit="kg" step={0.5} min={0} value={settings.smith_bar_kg} onChange={(v) => saveSettings({ smith_bar_kg: v })} />
            <div className="flex h-14 items-center justify-between gap-3">
              <span className="text-sm text-dim">体型</span>
              <span className="flex gap-1 rounded-xl bg-chip p-1">
                {(['male', 'female'] as const).map((sx) => (
                  <button
                    key={sx}
                    onClick={() => saveSettings({ sex: sx })}
                    aria-pressed={settings.sex === sx}
                    className={`h-9 rounded-lg px-4 text-sm transition ${settings.sex === sx ? 'bg-fg text-bg' : 'text-dim'}`}
                  >
                    {sx === 'male' ? '男性' : '女性'}
                  </button>
                ))}
              </span>
            </div>
            {settings.height_cm === null && (
              <p className="pb-2 text-xs leading-5 text-faint">身長を入れると、履歴に体のプロポーション目標が出ます</p>
            )}
            <div className="flex h-14 items-center justify-between gap-3">
              <span className="text-sm text-dim">計測の間隔</span>
              <span className="flex gap-1 rounded-xl bg-chip p-1">
                {[7, 14, 28].map((d) => (
                  <button
                    key={d}
                    onClick={() => saveSettings({ measure_interval_days: d })}
                    aria-pressed={settings.measure_interval_days === d}
                    className={`h-9 rounded-lg px-3 text-sm transition ${settings.measure_interval_days === d ? 'bg-fg text-bg' : 'text-dim'}`}
                  >
                    {d / 7}週
                  </button>
                ))}
              </span>
            </div>
          </div>
        </Section>

        <Section title="MENU">
          {routines.map((r) => {
            const s = routineSummaries.get(r.id)
            return (
              <button
                key={r.id}
                onClick={() => nav(`/menu/${r.id}`)}
                className="flex h-16 items-center gap-3 rounded-2xl bg-panel px-5 text-left"
              >
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {/* 積み上げ: 回数と、全種目で前回を超え続けている回数 */}
                {s && s.sessions > 0 && (
                  <span className="shrink-0 text-xs text-dim">
                    {s.sessions}回{s.streak > 0 && <span className="text-fg"> · {s.streak}連続更新</span>}
                  </span>
                )}
                <Icon name="back" size={18} className="shrink-0 rotate-180 text-faint" />
              </button>
            )
          })}
          <AddButton onClick={() => nav('/menu/new')} label="メニュー作成" />
        </Section>

        <Section title="EXERCISE">
          {exercises.map((e) => (
            <ExerciseEditor
              key={e.id}
              ex={e}
              summary={exerciseSummaries.get(e.id)}
              open={open === e.id}
              toggle={() => setOpen(open === e.id ? null : e.id)}
            />
          ))}
          <p className="px-2 text-xs leading-5 text-faint">
            右は今の最大重量と、初回からの伸び。種目はメニュー作成の中で追加します
          </p>
        </Section>

        <button onClick={() => nav('/welcome?howto')} className="mx-auto h-11 px-6 text-sm text-dim">
          使い方を見る
        </button>

        {supabase && (
          <button onClick={() => supabase!.auth.signOut()} className="mx-auto h-11 px-6 text-sm text-faint">
            ログアウト
          </button>
        )}
      </main>
    </div>
  )
}

function Row({ title, meta, right, open, toggle }: {
  title: string
  meta: React.ReactNode
  right?: React.ReactNode
  open: boolean
  toggle: () => void
}) {
  return (
    <button onClick={toggle} className="flex h-16 w-full items-center gap-3 px-5 text-left">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{title}</span>
        <span className="truncate text-[11px] leading-4 text-faint">{meta}</span>
      </span>
      {right}
      <Icon name={open ? 'up' : 'down'} size={18} className="shrink-0 text-faint" />
    </button>
  )
}

/** 種目の歩み: 今の最大重量を大きく、初回からの伸びを小さく。自己ベスト一覧として読める */
function Gain({ ex, s }: { ex: Exercise; s?: ExerciseSummary }) {
  if (!s || s.topWeight === null) return null
  return (
    <span className="flex shrink-0 flex-col items-end">
      <span className="text-lg leading-none">
        {fmtWeight(ex.equipment, s.topWeight)}
        <span className="ml-0.5 text-[11px] text-faint">kg</span>
      </span>
      <span className={`mt-1 text-[11px] leading-none ${s.gain && s.gain > 0 ? 'text-fg' : 'text-faint'}`}>
        {s.gain && s.gain > 0 ? `+${num(s.gain)}` : s.streak > 0 ? `${s.streak}連続更新` : `${s.sessions}回`}
        {s.gain && s.gain > 0 && s.streak > 0 ? ` · ${s.streak}連続更新` : ''}
      </span>
    </span>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 h-10 self-end px-2 text-xs text-dim">
      削除
    </button>
  )
}

function ExerciseEditor({ ex, summary, open, toggle }: {
  ex: Exercise
  summary?: ExerciseSummary
  open: boolean
  toggle: () => void
}) {
  const set = (c: Partial<Exercise>) => patch<Exercise>('exercises', ex.id, c)
  return (
    <div className="rounded-2xl bg-panel">
      <Row
        title={ex.name}
        meta={`${ex.body_part ? BODY_PART_LABEL[ex.body_part] + '  ' : ''}${EQUIPMENT_LABEL[ex.equipment]}  ${ex.target_reps}×${ex.main_sets}${ex.pyramid ? '+B' : ''}`}
        right={<Gain ex={ex} s={summary} />}
        open={open}
        toggle={toggle}
      />
      {open && (
        <div className="flex flex-col border-t border-line px-5 pt-4 pb-3">
          <TextField value={ex.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} />
          <div className="mt-3">
            <PartPicker selected={[ex.body_part]} onToggle={(bp) => set({ body_part: ex.body_part === bp ? null : bp })} />
          </div>
          <div className="mt-1 mb-2 grid grid-cols-3 gap-1 rounded-xl bg-chip p-1">
            {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((eq) => (
              <button
                key={eq}
                onClick={() => set({ equipment: eq })}
                className={`h-10 rounded-xl text-[11px] transition ${ex.equipment === eq ? 'bg-fg text-bg' : 'text-dim'}`}
              >
                {EQUIPMENT_LABEL[eq]}
              </button>
            ))}
          </div>
          <ChoiceField label="刻み" unit="kg" value={ex.weight_step} options={[0.5, 1, 1.25, 2, 2.5, 5]} onChange={(v) => set({ weight_step: v })} />
          <StepField label="目標回数" unit="回" step={1} min={1} max={50} value={ex.target_reps} onChange={(v) => set({ target_reps: v })} />
          <StepField label="メインセット" unit="set" step={1} min={1} max={10} value={ex.main_sets} onChange={(v) => set({ main_sets: v })} />
          <Toggle label="ピラミッド" checked={ex.pyramid} onChange={(v) => set({ pyramid: v })} />
          {ex.pyramid && (
            <StepField
              label="バックオフ"
              unit="%"
              step={5}
              min={30}
              max={90}
              value={Math.round(ex.backoff_ratio * 100)}
              onChange={(v) => set({ backoff_ratio: v / 100 })}
            />
          )}
          <DeleteButton onClick={() => confirm(`${ex.name} 削除？`) && set({ archived: true })} />
        </div>
      )}
    </div>
  )
}

/** 部位の選択（複数可）。模様つき */
function PartPicker({ selected, onToggle }: { selected: (BodyPart | null | undefined)[]; onToggle: (p: BodyPart) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1 rounded-xl bg-chip p-1">
      {(Object.keys(BODY_PART_LABEL) as BodyPart[]).map((bp) => {
        const on = selected.includes(bp)
        return (
          <button
            key={bp}
            onClick={() => onToggle(bp)}
            aria-pressed={on}
            className={`flex h-14 flex-col items-center justify-center gap-1 rounded-xl transition ${on ? 'bg-fg text-bg' : 'text-dim'}`}
          >
            <BodyArt parts={[bp]} intensity={0} detail={0.6} animate={false} className="h-6 w-6" />
            <span className="text-[11px] leading-none">{BODY_PART_LABEL[bp]}</span>
          </button>
        )
      })}
    </div>
  )
}


