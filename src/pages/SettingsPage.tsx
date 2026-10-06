import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, listExercises, listRoutines, patch, remove, routineItems, save, uuid } from '../data/repo'
import { db } from '../data/db'
import { supabase } from '../data/supabase'
import { BODY_PART_LABEL, EQUIPMENT_LABEL, type BodyPart, type Equipment, type Exercise, type Routine, type RoutineItem, type Settings } from '../lib/types'
import { Icon } from '../ui/Icon'
import { BodyArt } from '../ui/BodyArt'
import { TopBar } from '../ui/TopBar'
import { HoldButton } from '../ui/Stepper'
import { num } from '../lib/format'
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
  const data = useLiveQuery(async () => ({
    settings: await getSettings(),
    exercises: await listExercises(),
    routines: await listRoutines(),
  }))
  const [open, setOpen] = useState<string | null>(null)
  if (!data) return null
  const { settings, exercises, routines } = data

  const saveSettings = (c: Partial<Settings>) => save<Settings>('settings', { ...settings, ...c })

  async function addRoutine() {
    const r: Routine = { id: uuid(), name: `メニュー${routines.length + 1}`, body_parts: [], sort_order: routines.length }
    await save('routines', r)
    setOpen(r.id)
  }

  async function addExercise() {
    const e = newExercise(`種目${exercises.length + 1}`, null, exercises.length)
    await save('exercises', e)
    setOpen(e.id)
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" title="設定" />
      <main className="flex flex-col gap-8 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+4rem)]">
        <Section title="BODY">
          <div className="flex flex-col rounded-2xl bg-panel px-5 py-1">
            <StepField label="体重" unit="kg" step={0.1} min={20} value={settings.body_weight_kg} onChange={(v) => saveSettings({ body_weight_kg: v })} />
            <StepField label="EZバー" unit="kg" step={0.5} min={0} value={settings.ez_bar_kg} onChange={(v) => saveSettings({ ez_bar_kg: v })} />
            <StepField label="スミスバー" unit="kg" step={0.5} min={0} value={settings.smith_bar_kg} onChange={(v) => saveSettings({ smith_bar_kg: v })} />
          </div>
        </Section>

        <Section title="MENU">
          {routines.map((r) => (
            <RoutineEditor
              key={r.id}
              routine={r}
              exercises={exercises}
              open={open === r.id}
              toggle={() => setOpen(open === r.id ? null : r.id)}
            />
          ))}
          <AddButton onClick={addRoutine} label="メニュー追加" />
        </Section>

        <Section title="EXERCISE">
          {exercises.map((e) => (
            <ExerciseEditor key={e.id} ex={e} open={open === e.id} toggle={() => setOpen(open === e.id ? null : e.id)} />
          ))}
          <AddButton onClick={addExercise} label="種目追加" />
        </Section>

        {supabase && (
          <button onClick={() => supabase!.auth.signOut()} className="mx-auto h-11 px-6 text-sm text-faint">
            ログアウト
          </button>
        )}
      </main>
    </div>
  )
}

function Row({ title, meta, open, toggle }: { title: string; meta: React.ReactNode; open: boolean; toggle: () => void }) {
  return (
    <button onClick={toggle} className="flex h-16 w-full items-center gap-3 px-5 text-left">
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="shrink-0 text-xs text-faint">{meta}</span>
      <Icon name={open ? 'up' : 'down'} size={18} className="shrink-0 text-faint" />
    </button>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 h-10 self-end px-2 text-xs text-dim">
      削除
    </button>
  )
}

function ExerciseEditor({ ex, open, toggle }: { ex: Exercise; open: boolean; toggle: () => void }) {
  const set = (c: Partial<Exercise>) => patch<Exercise>('exercises', ex.id, c)
  return (
    <div className="rounded-2xl bg-panel">
      <Row
        title={ex.name}
        meta={`${ex.body_part ? BODY_PART_LABEL[ex.body_part] + '  ' : ''}${EQUIPMENT_LABEL[ex.equipment]}  ${ex.target_reps}×${ex.main_sets}${ex.pyramid ? '+B' : ''}`}
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

function RoutineEditor({ routine, exercises, open, toggle }: {
  routine: Routine
  exercises: Exercise[]
  open: boolean
  toggle: () => void
}) {
  const items = useLiveQuery(() => routineItems(routine.id), [routine.id]) ?? []
  const [newName, setNewName] = useState('')
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const shown = items.filter((it) => byId.has(it.exercise_id))
  const parts = routine.body_parts ?? []

  async function move(i: number, d: -1 | 1) {
    const j = i + d
    if (j < 0 || j >= shown.length) return
    const a = shown[i]
    const b = shown[j]
    await save<RoutineItem>('routine_items', [
      { ...a, sort_order: b.sort_order },
      { ...b, sort_order: a.sort_order },
    ])
  }

  async function add(exerciseId: string) {
    await save<RoutineItem>('routine_items', {
      id: uuid(),
      routine_id: routine.id,
      exercise_id: exerciseId,
      sort_order: Math.max(-1, ...items.map((i) => i.sort_order)) + 1,
    })
  }

  // 連続タップでも取りこぼさないよう、切り替えは順番に、保存済みの最新値から行う
  const queue = useRef(Promise.resolve())
  function togglePart(p: BodyPart) {
    queue.current = queue.current.then(async () => {
      const cur = (await db.routines.get(routine.id))?.body_parts ?? []
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]
      // 名前を手で変えていなければ、部位から自動で付ける（例: 胸・背中）
      const name = (await db.routines.get(routine.id))?.name ?? ''
      const auto = /^メニュー\d+$/.test(name) || name === partsName(cur)
      await patch<Routine>('routines', routine.id, auto && next.length ? { body_parts: next, name: partsName(next) } : { body_parts: next })
    })
  }

  /** 選択中の部位で新しい種目を作り、そのままメニューに入れる */
  async function createExercise() {
    const name = newName.trim()
    if (!name) return
    const e = newExercise(name, parts.length === 1 ? parts[0] : null, exercises.length)
    await save('exercises', e)
    await add(e.id)
    setNewName('')
  }

  // 部位を選んでいればその部位の種目だけ。部位未設定の種目は別枠で薄く出す
  const unused = exercises.filter((e) => !shown.some((it) => it.exercise_id === e.id))
  const matched = parts.length ? unused.filter((e) => e.body_part && parts.includes(e.body_part)) : unused
  const unset = parts.length ? unused.filter((e) => !e.body_part) : []

  const chip = (e: Exercise, dim = false) => (
    <button
      key={e.id}
      onClick={() => add(e.id)}
      className={`flex h-10 max-w-full items-center gap-1.5 rounded-full bg-chip pr-4 pl-3 text-sm transition active:bg-line ${dim ? 'text-dim' : ''}`}
    >
      <Icon name="plus" size={14} className="shrink-0 text-faint" />
      <span className="truncate">{e.name}</span>
    </button>
  )

  return (
    <div className="rounded-2xl bg-panel">
      <Row
        title={routine.name}
        meta={parts.length ? parts.map((p) => BODY_PART_LABEL[p]).join('・') : shown.length}
        open={open}
        toggle={toggle}
      />
      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-5 pt-4 pb-3">
          <TextField value={routine.name} onCommit={(v) => v.trim() && patch<Routine>('routines', routine.id, { name: v.trim() })} />

          <span className="mt-3 text-[11px] tracking-[0.2em] text-dim">TARGET</span>
          <PartPicker selected={parts} onToggle={togglePart} />

          {shown.length > 0 && <span className="mt-3 text-[11px] tracking-[0.2em] text-dim">EXERCISE</span>}
          {shown.map((it, i) => (
            <div key={it.id} className="flex h-12 items-center rounded-xl bg-chip pl-4">
              <span className="min-w-0 flex-1 truncate text-sm">{byId.get(it.exercise_id)!.name}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="flex h-12 w-10 items-center justify-center text-faint disabled:opacity-20" aria-label="上へ">
                <Icon name="up" size={18} />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === shown.length - 1} className="flex h-12 w-10 items-center justify-center text-faint disabled:opacity-20" aria-label="下へ">
                <Icon name="down" size={18} />
              </button>
              <button onClick={() => remove('routine_items', it.id)} className="flex h-12 w-10 items-center justify-center text-faint" aria-label="外す">
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}

          {(matched.length > 0 || unset.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {matched.map((e) => chip(e))}
              {unset.map((e) => chip(e, true))}
            </div>
          )}

          <div className="mt-1 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createExercise()}
              placeholder={parts.length === 1 ? `新しい${BODY_PART_LABEL[parts[0]]}の種目` : '新しい種目'}
              className={`${inputCls} min-w-0 flex-1`}
            />
            <button
              onClick={createExercise}
              disabled={!newName.trim()}
              aria-label="種目を作成して追加"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fg text-bg disabled:bg-chip disabled:text-faint"
            >
              <Icon name="plus" size={20} />
            </button>
          </div>

          <DeleteButton onClick={() => confirm(`${routine.name} 削除？`) && remove('routines', routine.id)} />
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

function newExercise(name: string, bodyPart: BodyPart | null, sortOrder: number): Exercise {
  return {
    id: uuid(),
    name,
    equipment: 'barbell',
    body_part: bodyPart,
    weight_step: 2.5,
    target_reps: 3,
    main_sets: 5,
    pyramid: true,
    backoff_ratio: 0.6,
    sort_order: sortOrder,
    archived: false,
  }
}

const partsName = (parts: BodyPart[]) => parts.map((p) => BODY_PART_LABEL[p]).join('・')
