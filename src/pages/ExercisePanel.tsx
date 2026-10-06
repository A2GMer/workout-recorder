import { useEffect, useRef, useState } from 'react'
import { patch, remove, save, uuid } from '../data/repo'
import {
  backoffWeight,
  barWeight,
  effectiveWeight,
  fix,
  neededBackoffReps,
  suggest,
  volume,
  type PrevPerformance,
} from '../lib/progression'
import { fmtSets, fmtVolume, fmtWeight, md, num } from '../lib/format'
import type { Exercise, Session, SessionExercise, Settings, SetKind, WorkSet } from '../lib/types'
import type { Editor } from '../ui/Stepper'

type Field = 'weight' | 'reps' | 'cheat'
interface Draft {
  weight?: number
  reps?: number
  cheat?: number
}
interface Row {
  key: string
  kind: SetKind
  setNo: number
  weight: number
  reps: number
  cheat: number
  rec?: WorkSet
  /** バックオフの必要回数（目安） */
  need?: number | null
}

export interface PanelData {
  se: SessionExercise
  ex: Exercise
  sets: WorkSet[]
  prev: { prev: PrevPerformance; session: Session } | null
}

const FIELD_COL: Record<Field, keyof WorkSet> = {
  weight: 'weight_kg',
  reps: 'reps',
  cheat: 'cheat_reps',
}

export function ExercisePanel({
  data,
  session,
  settings,
  activeKey,
  openEditor,
  closeEditor,
}: {
  data: PanelData
  session: Session
  settings: Settings
  activeKey: string | null
  openEditor: (e: Editor) => void
  closeEditor: () => void
}) {
  const { se, ex, sets, prev } = data
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [extra, setExtra] = useState(0)
  const bw = session.body_weight_kg
  const ctx = { bodyWeight: bw, ezBarKg: settings.ez_bar_kg }
  const sugg = suggest(ex, prev?.prev ?? null)
  const bar = barWeight(ex.equipment, settings.ez_bar_kg)

  // ---- 行の組み立て ----
  const mainSets = sets.filter((s) => s.kind === 'main')
  const backSet = sets.find((s) => s.kind === 'backoff')
  const mainCount = Math.max(ex.main_sets, ...mainSets.map((s) => s.set_no)) + extra
  const rows: Row[] = []
  let lastW = sugg.mainWeight ?? bar
  for (let i = 1; i <= mainCount; i++) {
    const key = `m${i}`
    const rec = mainSets.find((s) => s.set_no === i)
    const d = drafts[key]
    const row: Row = rec
      ? { key, kind: 'main', setNo: i, weight: rec.weight_kg, reps: rec.reps, cheat: rec.cheat_reps, rec }
      : {
          key,
          kind: 'main',
          setNo: i,
          weight: d?.weight ?? lastW,
          reps: d?.reps ?? sugg.mainReps[i - 1] ?? ex.target_reps,
          cheat: d?.cheat ?? 0,
        }
    lastW = row.weight
    rows.push(row)
  }
  const mainVolume = volume(
    rows.map((r) => ({ weight_kg: r.weight, reps: r.reps })),
    ex.equipment,
    bw,
  )

  if (ex.pyramid || backSet) {
    const key = 'b1'
    const d = drafts[key]
    const maxMain = Math.max(...rows.map((r) => r.weight))
    const weight = backSet?.weight_kg ?? d?.weight ?? backoffWeight(ex, maxMain, ctx)
    const need = neededBackoffReps(sugg.prevVolume, mainVolume, effectiveWeight(ex.equipment, weight, bw))
    const prevBackReps = prev?.prev.backoff[0]?.reps
    rows.push(
      backSet
        ? { key, kind: 'backoff', setNo: 1, weight, reps: backSet.reps, cheat: backSet.cheat_reps, rec: backSet, need }
        : { key, kind: 'backoff', setNo: 1, weight, reps: d?.reps ?? (need || prevBackReps || 8), cheat: d?.cheat ?? 0, need },
    )
  }

  const actual = volume(sets, ex.equipment, bw)
  const delta = sugg.prevVolume === null ? null : fix(actual - sugg.prevVolume)

  // ---- 操作 ----
  function setDraft(key: string, field: Field, v: number) {
    setDrafts((ds) => ({ ...ds, [key]: { ...ds[key], [field]: v } }))
  }

  function edit(row: Row, field: Field) {
    const value = field === 'weight' ? row.weight : field === 'reps' ? row.reps : row.cheat
    const isW = field === 'weight'
    openEditor({
      key: `${se.id}:${row.key}:${field}`,
      value,
      step: isW ? ex.weight_step : 1,
      big: isW ? 10 : undefined,
      min: isW ? (ex.equipment === 'bodyweight' ? undefined : bar) : 0,
      format: isW ? (v) => fmtWeight(ex.equipment, v) : String,
      apply: (v) => {
        if (row.rec) void patch<WorkSet>('work_sets', row.rec.id, { [FIELD_COL[field]]: v })
        else setDraft(row.key, field, v)
      },
    })
  }

  async function toggle(row: Row) {
    closeEditor()
    if (row.rec) {
      // 取り消し時は値を下書きに戻す
      setDrafts((ds) => ({ ...ds, [row.key]: { weight: row.weight, reps: row.reps, cheat: row.cheat } }))
      await remove('work_sets', row.rec.id)
      return
    }
    // バックオフの重量はその時点で確定させる
    await save<WorkSet>('work_sets', {
      id: uuid(),
      session_exercise_id: se.id,
      kind: row.kind,
      set_no: row.setNo,
      weight_kg: row.weight,
      reps: row.reps,
      cheat_reps: row.cheat,
    })
    setDrafts((ds) => {
      const { [row.key]: _, ...rest } = ds
      return rest
    })
  }

  // ---- 疲労度・コメント（少し待ってから保存） ----
  const [fatigue, setFatigue] = useState(se.fatigue)
  const [comment, setComment] = useState(se.comment)
  const [showComment, setShowComment] = useState(!!se.comment)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ fatigue, comment })
  latest.current = { fatigue, comment }
  const flush = () => {
    clearTimeout(pending.current)
    const { fatigue, comment } = latest.current
    if (fatigue !== se.fatigue || comment !== se.comment) {
      void patch<SessionExercise>('session_exercises', se.id, { fatigue, comment })
    }
  }
  const later = () => {
    clearTimeout(pending.current)
    pending.current = setTimeout(flush, 600)
  }
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const cell = (row: Row, field: Field) =>
    activeKey === `${se.id}:${row.key}:${field}` ? 'ring-2 ring-accent' : ''

  return (
    <section className="flex h-full w-screen shrink-0 flex-col overflow-y-auto px-4 pb-40">
      <div className="flex items-end justify-between pt-3">
        <h2 className="text-xl font-bold">{ex.name}</h2>
        <div className="text-right">
          <span className="text-2xl font-bold">{fmtVolume(actual)}</span>
          {delta !== null && (
            <span className={`ml-2 text-sm font-bold ${delta > 0 ? 'text-up' : 'text-dim'}`}>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '±'}
              {fmtVolume(Math.abs(delta))}
            </span>
          )}
        </div>
      </div>
      {prev && (
        <div className="mt-1 truncate text-xs text-dim">
          {md(prev.session.date)} {fmtSets(ex.equipment, [...prev.prev.main, ...prev.prev.backoff])}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => {
          const recorded = !!row.rec
          const tone = recorded ? 'text-fg' : 'text-dim'
          const perSide = bar > 0 ? (row.weight - bar) / 2 : null
          return (
            <div
              key={row.key}
              className={`flex items-center gap-1 rounded-xl px-2 py-1 ${
                row.kind === 'backoff' ? 'mt-2 border border-dashed border-line' : 'bg-panel'
              }`}
            >
              <span className="w-5 text-center text-xs text-dim">{row.kind === 'backoff' ? 'B' : row.setNo}</span>
              <button
                onClick={() => edit(row, 'weight')}
                className={`flex w-24 flex-col items-end rounded-lg px-2 py-1 ${tone} ${cell(row, 'weight')}`}
              >
                <span className="text-2xl font-bold">{fmtWeight(ex.equipment, row.weight)}</span>
                {perSide !== null && perSide > 0 && <span className="text-[10px] text-dim">片{num(perSide)}</span>}
              </button>
              <span className="text-dim">×</span>
              <button
                onClick={() => edit(row, 'reps')}
                className={`flex w-16 items-baseline justify-start rounded-lg px-2 py-2 ${tone} ${cell(row, 'reps')}`}
              >
                <span className="text-2xl font-bold">{row.reps}</span>
                {!recorded && row.need ? <span className="ml-1 text-xs text-accent">≥{row.need}</span> : null}
              </button>
              <button
                onClick={() => edit(row, 'cheat')}
                className={`rounded-lg px-2 py-2 text-sm ${row.cheat > 0 ? 'text-accent' : 'text-line'} ${cell(row, 'cheat')}`}
                aria-label="チーティング回数"
              >
                C{row.cheat}
              </button>
              <button
                onClick={() => toggle(row)}
                aria-label={recorded ? '記録取消' : '記録'}
                className={`ml-auto flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                  recorded ? 'bg-accent text-black' : 'border-2 border-line text-line'
                }`}
              >
                ✓
              </button>
            </div>
          )
        })}
        <button onClick={() => setExtra((n) => n + 1)} className="self-start px-3 py-1 text-2xl text-dim" aria-label="セット追加">
          ＋
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs text-dim">軽</span>
        <input
          type="range"
          min={0}
          max={100}
          value={fatigue}
          onChange={(e) => {
            setFatigue(Number(e.target.value))
            later()
          }}
          className="gauge flex-1"
          aria-label="疲労度"
        />
        <span className="text-xs text-dim">重</span>
      </div>

      <div className="mt-4">
        {showComment ? (
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              later()
            }}
            onBlur={flush}
            rows={3}
            className="w-full rounded-xl bg-panel p-3 text-sm"
          />
        ) : (
          <button onClick={() => setShowComment(true)} className="text-2xl text-dim" aria-label="コメント">
            💬
          </button>
        )}
      </div>
    </section>
  )
}
