import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, listExercises, listRoutines, patch, remove, routineItems, save, uuid } from '../data/repo'
import { supabase } from '../data/supabase'
import { EQUIPMENT_LABEL, type Equipment, type Exercise, type Routine, type RoutineItem, type Settings } from '../lib/types'
import { Icon } from '../ui/Icon'
import { TopBar } from '../ui/TopBar'

const inputCls = 'h-11 rounded-2xl bg-white/[0.06] px-4 font-light placeholder:text-faint'

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

function NumField({ label, value, onCommit, step = 'any', unit }: {
  label: string
  value: number
  onCommit: (v: number) => void
  step?: string
  unit?: string
}) {
  return (
    <label className="flex h-12 items-center justify-between gap-3">
      <span className="text-sm text-dim">{label}</span>
      <span className="flex items-center gap-2">
        <TextField
          type="number"
          inputMode="decimal"
          step={step}
          value={String(value)}
          onCommit={(v) => {
            const n = Number(v)
            if (v !== '' && Number.isFinite(n)) onCommit(n)
          }}
          className="w-24 text-right"
        />
        <span className="w-6 text-xs text-faint">{unit}</span>
      </span>
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex h-12 items-center justify-between" role="switch" aria-checked={checked}>
      <span className="text-sm text-dim">{label}</span>
      <span className={`mr-8 flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? 'grad' : 'bg-line'}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="px-2 text-[11px] tracking-[0.2em] text-faint">{title}</h2>
    {children}
  </section>
)

const AddButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className="flex h-14 items-center justify-center rounded-[22px] border border-dashed border-line text-faint active:bg-panel"
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
    const r: Routine = { id: uuid(), name: `メニュー${routines.length + 1}`, sort_order: routines.length }
    await save('routines', r)
    setOpen(r.id)
  }

  async function addExercise() {
    const e: Exercise = {
      id: uuid(),
      name: `種目${exercises.length + 1}`,
      equipment: 'barbell',
      weight_step: 2.5,
      target_reps: 3,
      main_sets: 5,
      pyramid: true,
      backoff_ratio: 0.6,
      sort_order: exercises.length,
      archived: false,
    }
    await save('exercises', e)
    setOpen(e.id)
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopBar back="/" />
      <main className="flex flex-col gap-8 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+4rem)]">
        <Section title="BODY">
          <div className="glass flex flex-col rounded-[22px] px-5 py-1">
            <NumField label="体重" unit="kg" value={settings.body_weight_kg} onCommit={(v) => saveSettings({ body_weight_kg: v })} />
            <NumField label="EZバー" unit="kg" value={settings.ez_bar_kg} onCommit={(v) => saveSettings({ ez_bar_kg: v })} />
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
      <span className="min-w-0 flex-1 truncate font-light">{title}</span>
      <span className="shrink-0 text-xs text-faint">{meta}</span>
      <Icon name={open ? 'up' : 'down'} size={18} className="shrink-0 text-faint" />
    </button>
  )
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-2 h-10 self-end px-2 text-xs text-down/80">
      削除
    </button>
  )
}

function ExerciseEditor({ ex, open, toggle }: { ex: Exercise; open: boolean; toggle: () => void }) {
  const set = (c: Partial<Exercise>) => patch<Exercise>('exercises', ex.id, c)
  return (
    <div className="glass rounded-[22px]">
      <Row
        title={ex.name}
        meta={`${EQUIPMENT_LABEL[ex.equipment]}  ${ex.target_reps}×${ex.main_sets}${ex.pyramid ? '+B' : ''}`}
        open={open}
        toggle={toggle}
      />
      {open && (
        <div className="flex flex-col border-t border-line px-5 pt-4 pb-3">
          <TextField value={ex.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} />
          <div className="mt-3 mb-2 grid grid-cols-5 gap-1 rounded-2xl bg-white/[0.04] p-1">
            {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((eq) => (
              <button
                key={eq}
                onClick={() => set({ equipment: eq })}
                className={`h-10 rounded-xl text-[11px] transition ${ex.equipment === eq ? 'bg-white/15 text-fg' : 'text-faint'}`}
              >
                {EQUIPMENT_LABEL[eq]}
              </button>
            ))}
          </div>
          <NumField label="刻み" unit="kg" value={ex.weight_step} onCommit={(v) => v > 0 && set({ weight_step: v })} />
          <NumField label="目標回数" unit="回" value={ex.target_reps} step="1" onCommit={(v) => v >= 1 && set({ target_reps: Math.round(v) })} />
          <NumField label="メインセット" unit="set" value={ex.main_sets} step="1" onCommit={(v) => v >= 1 && set({ main_sets: Math.round(v) })} />
          <Toggle label="ピラミッド" checked={ex.pyramid} onChange={(v) => set({ pyramid: v })} />
          {ex.pyramid && (
            <NumField
              label="バックオフ"
              unit="%"
              value={Math.round(ex.backoff_ratio * 100)}
              step="1"
              onCommit={(v) => v > 0 && v <= 100 && set({ backoff_ratio: v / 100 })}
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
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const shown = items.filter((it) => byId.has(it.exercise_id))

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

  const candidates = exercises.filter((e) => !shown.some((it) => it.exercise_id === e.id))

  return (
    <div className="glass rounded-[22px]">
      <Row title={routine.name} meta={shown.length} open={open} toggle={toggle} />
      {open && (
        <div className="flex flex-col gap-2 border-t border-line px-5 pt-4 pb-3">
          <TextField value={routine.name} onCommit={(v) => v.trim() && patch<Routine>('routines', routine.id, { name: v.trim() })} />
          {shown.map((it, i) => (
            <div key={it.id} className="flex h-12 items-center rounded-2xl bg-white/[0.04] pl-4">
              <span className="min-w-0 flex-1 truncate text-sm font-light">{byId.get(it.exercise_id)!.name}</span>
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
          {candidates.length > 0 && (
            <label className="relative flex h-12 items-center justify-center rounded-2xl border border-dashed border-line text-faint">
              <Icon name="plus" size={20} />
              <select
                value=""
                onChange={(e) => e.target.value && add(e.target.value)}
                aria-label="種目を追加"
                className="absolute inset-0 opacity-0"
              >
                <option value="" />
                {candidates.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DeleteButton onClick={() => confirm(`${routine.name} 削除？`) && remove('routines', routine.id)} />
        </div>
      )}
    </div>
  )
}
