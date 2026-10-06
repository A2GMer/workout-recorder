import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, listExercises, listRoutines, patch, remove, routineItems, save, uuid } from '../data/repo'
import { supabase } from '../data/supabase'
import { EQUIPMENT_LABEL, type Equipment, type Exercise, type Routine, type RoutineItem, type Settings } from '../lib/types'
import { TopBar } from '../ui/TopBar'

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
      className={`rounded-lg bg-bg px-3 py-2 ${className ?? ''}`}
      {...rest}
    />
  )
}

function NumField({ label, value, onCommit, step = 'any' }: {
  label: string
  value: number
  onCommit: (v: number) => void
  step?: string
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-dim">{label}</span>
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
    </label>
  )
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-2">
    <h2 className="px-1 text-xs text-dim">{title}</h2>
    {children}
  </section>
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
      <main className="flex flex-col gap-6 p-4 pb-16">
        <Section title="体重 / EZバー (kg)">
          <div className="flex flex-col gap-2 rounded-xl bg-panel p-3">
            <NumField label="体重" value={settings.body_weight_kg} onCommit={(v) => saveSettings({ body_weight_kg: v })} />
            <NumField label="EZバー" value={settings.ez_bar_kg} onCommit={(v) => saveSettings({ ez_bar_kg: v })} />
          </div>
        </Section>

        <Section title="メニュー">
          {routines.map((r) => (
            <RoutineEditor
              key={r.id}
              routine={r}
              exercises={exercises}
              open={open === r.id}
              toggle={() => setOpen(open === r.id ? null : r.id)}
            />
          ))}
          <button onClick={addRoutine} className="rounded-xl border border-dashed border-line py-2 text-xl text-dim">
            ＋
          </button>
        </Section>

        <Section title="種目">
          {exercises.map((e) => (
            <ExerciseEditor key={e.id} ex={e} open={open === e.id} toggle={() => setOpen(open === e.id ? null : e.id)} />
          ))}
          <button onClick={addExercise} className="rounded-xl border border-dashed border-line py-2 text-xl text-dim">
            ＋
          </button>
        </Section>

        {supabase && (
          <button onClick={() => supabase!.auth.signOut()} className="self-center text-sm text-dim">
            ログアウト
          </button>
        )}
      </main>
    </div>
  )
}

function ExerciseEditor({ ex, open, toggle }: { ex: Exercise; open: boolean; toggle: () => void }) {
  const set = (c: Partial<Exercise>) => patch<Exercise>('exercises', ex.id, c)
  return (
    <div className="rounded-xl bg-panel">
      <button onClick={toggle} className="flex w-full items-baseline justify-between px-4 py-3 text-left">
        <span>{ex.name}</span>
        <span className="text-xs text-dim">
          {EQUIPMENT_LABEL[ex.equipment]} {ex.target_reps}×{ex.main_sets}
          {ex.pyramid ? ' +B' : ''}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line p-3">
          <TextField value={ex.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} />
          <div className="grid grid-cols-5 gap-1">
            {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((eq) => (
              <button
                key={eq}
                onClick={() => set({ equipment: eq })}
                className={`rounded-lg py-2 text-xs ${ex.equipment === eq ? 'bg-accent text-black' : 'bg-bg text-dim'}`}
              >
                {EQUIPMENT_LABEL[eq]}
              </button>
            ))}
          </div>
          <NumField label="刻み (kg)" value={ex.weight_step} onCommit={(v) => v > 0 && set({ weight_step: v })} />
          <NumField label="目標回数" value={ex.target_reps} step="1" onCommit={(v) => v >= 1 && set({ target_reps: Math.round(v) })} />
          <NumField label="メインセット数" value={ex.main_sets} step="1" onCommit={(v) => v >= 1 && set({ main_sets: Math.round(v) })} />
          <label className="flex items-center justify-between">
            <span className="text-sm text-dim">ピラミッド</span>
            <input type="checkbox" checked={ex.pyramid} onChange={(e) => set({ pyramid: e.target.checked })} className="h-6 w-6 accent-accent" />
          </label>
          {ex.pyramid && (
            <NumField
              label="バックオフ (%)"
              value={Math.round(ex.backoff_ratio * 100)}
              step="1"
              onCommit={(v) => v > 0 && v <= 100 && set({ backoff_ratio: v / 100 })}
            />
          )}
          <button
            onClick={() => confirm(`${ex.name} 削除？`) && set({ archived: true })}
            className="self-end text-sm text-down"
          >
            削除
          </button>
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

  return (
    <div className="rounded-xl bg-panel">
      <button onClick={toggle} className="flex w-full items-baseline justify-between px-4 py-3 text-left">
        <span>{routine.name}</span>
        <span className="text-xs text-dim">{shown.length}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <TextField value={routine.name} onCommit={(v) => v.trim() && patch<Routine>('routines', routine.id, { name: v.trim() })} />
          {shown.map((it, i) => (
            <div key={it.id} className="flex items-center gap-1 rounded-lg bg-bg pl-3">
              <span className="flex-1 truncate py-2">{byId.get(it.exercise_id)!.name}</span>
              <button onClick={() => move(i, -1)} className="px-3 py-2 text-dim" aria-label="上へ">↑</button>
              <button onClick={() => move(i, 1)} className="px-3 py-2 text-dim" aria-label="下へ">↓</button>
              <button onClick={() => remove('routine_items', it.id)} className="px-3 py-2 text-dim" aria-label="外す">×</button>
            </div>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && add(e.target.value)}
            className="rounded-lg bg-bg px-3 py-2 text-dim"
          >
            <option value="">＋ 種目</option>
            {exercises
              .filter((e) => !shown.some((it) => it.exercise_id === e.id))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => confirm(`${routine.name} 削除？`) && remove('routines', routine.id)}
            className="self-end text-sm text-down"
          >
            削除
          </button>
        </div>
      )}
    </div>
  )
}
