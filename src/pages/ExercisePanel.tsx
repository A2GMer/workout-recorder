import { useEffect, useRef, useState } from 'react'
import { patch, remove, save, uuid, type ExerciseLog } from '../data/repo'
import {
  backoffWeight,
  barWeight,
  effectiveWeight,
  fix,
  neededBackoffReps,
  streak,
  suggest,
  volume,
  type PrevPerformance,
} from '../lib/progression'
import { fmtSets, fmtVolume, fmtWeight, md, num } from '../lib/format'
import type { Exercise, Session, SessionExercise, Settings, SetKind, WorkSet } from '../lib/types'
import type { Editor } from '../ui/Stepper'
import { Icon } from '../ui/Icon'

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
  /** 過去の実績（新しい順）。連続更新と自己ベストに使う */
  history: ExerciseLog[]
}

/** 今日の到達点: 前回を超えたか、何回連続か、自己ベストか */
export function progressOf(sets: WorkSet[], actual: number, prevVolume: number | null, history: ExerciseLog[]) {
  const beat = prevVolume !== null && actual > prevVolume
  const past = history.map((h) => h.volume)
  const run = beat ? streak([actual, ...past]) : streak(past)
  const best = Math.max(-Infinity, ...history.map((h) => h.maxWeight))
  const todayMax = Math.max(-Infinity, ...sets.filter((s) => s.kind === 'main').map((s) => s.weight_kg))
  const isBest = history.length > 0 && todayMax > best
  return { beat, run, isBest, todayMax }
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
  const ctx = { bodyWeight: bw, ezBarKg: settings.ez_bar_kg, smithBarKg: settings.smith_bar_kg }
  const sugg = suggest(ex, prev?.prev ?? null)
  const bar = barWeight(ex.equipment, ctx)

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
  const { beat, run, isBest, todayMax } = progressOf(sets, actual, sugg.prevVolume, data.history)

  // ---- 前回を超えた瞬間: 数字がひと呼吸ふくらみ、端末が短く震える ----
  const [pulse, setPulse] = useState(false)
  const wasBeat = useRef(beat)
  useEffect(() => {
    const crossed = beat && !wasBeat.current
    wasBeat.current = beat
    if (!crossed) return
    setPulse(true)
    try {
      navigator.vibrate?.(40)
    } catch {
      // 対応していない端末は無視
    }
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [beat])

  // 到達点の一言（更新の連続・自己ベスト）
  const marks: string[] = []
  if (isBest) marks.push(`自己ベスト ${fmtWeight(ex.equipment, todayMax)}`)
  if (beat && run >= 2) marks.push(`${run}回連続で更新`)
  else if (!beat && run >= 1) marks.push(`${run}回連続更新中`)

  // 次に記録するセット（提案どおり）で前回を超えるなら予告する
  const nextRow = rows.find((r) => !r.rec)
  const remaining = delta === null ? null : Math.max(1, -delta + 1)
  const nextSetVolume = nextRow ? effectiveWeight(ex.equipment, nextRow.weight, bw) * nextRow.reps : 0
  const nextBeats = !beat && remaining !== null && nextRow !== undefined && nextSetVolume >= remaining

  // ---- 操作 ----
  function setDraft(key: string, field: Field, v: number) {
    setDrafts((ds) => ({ ...ds, [key]: { ...ds[key], [field]: v } }))
  }

  function edit(row: Row, field: Field, el: HTMLElement) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    const value = field === 'weight' ? row.weight : field === 'reps' ? row.reps : row.cheat
    const isW = field === 'weight'
    openEditor({
      key: `${se.id}:${row.key}:${field}`,
      label: row.kind === 'backoff' ? 'BACK-OFF' : `SET ${row.setNo}`,
      unit: isW ? 'kg' : field === 'reps' ? '回' : 'チート',
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
    activeKey === `${se.id}:${row.key}:${field}` ? 'bg-chip text-fg' : ''
  // 進み具合の線。前回の位置に目盛りがあり、超えた分は目盛りの先へ伸びる（最大 +15%）
  const OVER = 1.15
  const progress = sugg.prevVolume ? Math.min(OVER, actual / sugg.prevVolume) : 0

  // 疲労ゲージに応じた次回の提案（メインセットが全部記録されてから）
  const mainDone = rows.filter((r) => r.kind === 'main').every((r) => r.rec)
  const nextTime = mainDone
    ? suggest(ex, {
        main: sets.filter((s) => s.kind === 'main'),
        backoff: sets.filter((s) => s.kind === 'backoff'),
        fatigue,
        body_weight_kg: bw,
      })
    : null

  function renderRow(row: Row) {
          const recorded = !!row.rec
          const tone = recorded ? 'text-fg' : 'text-faint'
          const perSide = bar > 0 ? (row.weight - bar) / 2 : null
          const backoff = row.kind === 'backoff'
          return (
            <div
              key={row.key}
              className={`flex h-16 items-center border-b border-line `}
            >
              <span className="w-7 shrink-0 text-xs text-faint">{backoff ? 'B' : row.setNo}</span>
              <button
                onClick={(e) => edit(row, 'weight', e.currentTarget)}
                className={`flex h-12 w-[92px] shrink-0 flex-col items-end justify-center rounded-xl px-2 transition ${tone} ${cell(row, 'weight')}`}
              >
                <span className="text-[26px] leading-none">{fmtWeight(ex.equipment, row.weight)}</span>
                {perSide !== null && perSide > 0 && (
                  <span className="mt-1 text-[10px] leading-none text-faint">片 {num(perSide)}</span>
                )}
              </button>
              <span className="w-6 shrink-0 text-center text-xs text-faint">×</span>
              <button
                onClick={(e) => edit(row, 'reps', e.currentTarget)}
                className={`flex h-12 min-w-12 shrink-0 items-center rounded-xl px-2 transition ${tone} ${cell(row, 'reps')}`}
              >
                <span className="text-[26px] leading-none">{row.reps}</span>
                {!recorded && row.need ? <span className="ml-1.5 text-xs text-dim">≥{row.need}</span> : null}
              </button>
              <button
                onClick={(e) => edit(row, 'cheat', e.currentTarget)}
                aria-label="チーティング回数"
                className={`ml-auto flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-2 text-xs transition ${
                  row.cheat > 0 ? 'text-fg' : 'text-faint'
                } ${cell(row, 'cheat')}`}
              >
                C{row.cheat}
              </button>
              <button
                onClick={() => toggle(row)}
                aria-label={recorded ? '記録取消' : '記録'}
                className={`ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                  recorded ? 'bg-fg text-bg' : 'border border-faint text-faint'
                }`}
              >
                <Icon name="check" size={20} />
              </button>
            </div>
          )
  }

  return (
    <section className="no-scrollbar flex h-full w-full shrink-0 grow-0 basis-full flex-col overflow-y-auto px-5 pb-64 [&>*]:shrink-0">
      {/* ボリューム */}
      <div className="flex flex-col items-center pt-4">
        <span className={`text-[56px] leading-none tracking-tight ${pulse ? 'animate-beat' : ''}`}>{fmtVolume(actual)}</span>
        {/* 前回比: 超えたら白で +N、まだなら「あと N」（前回 +1 まで） */}
        <span className={`mt-2 h-4 text-xs leading-4 ${beat ? 'text-fg' : 'text-dim'}`}>
          {delta === null ? '' : beat ? `+${fmtVolume(delta)}` : `あと ${fmtVolume(remaining!)}`}
          {nextBeats && <span className="text-fg">　次のセットで超える</span>}
        </span>
        <span className={`mt-1 h-4 text-[11px] leading-4 ${beat ? 'text-dim' : 'text-faint'}`}>{marks.join(' · ')}</span>
        {sugg.prevVolume !== null && (
          <div className="relative mt-3 h-3 w-48">
            <div className="absolute top-1/2 h-px w-full bg-line" />
            <div
              className="absolute top-1/2 h-px bg-fg transition-all duration-500"
              style={{ width: `${(progress / OVER) * 100}%` }}
            />
            {/* 前回の位置 */}
            <div className={`absolute top-0 h-3 w-px ${beat ? 'bg-fg' : 'bg-dim'}`} style={{ left: `${(1 / OVER) * 100}%` }} />
          </div>
        )}
        <p className="mt-4 text-center text-xs leading-5 text-dim">
          {prev
            ? `${md(prev.session.date)}　${fmtSets(ex.equipment, [...prev.prev.main, ...prev.prev.backoff])} = ${fmtVolume(sugg.prevVolume!)}`
            : '初回'}
        </p>
      </div>

      {/* セット */}
      <div className="mt-8 flex flex-col">
        {rows.filter((r) => r.kind === 'main').map(renderRow)}
        <button
          onClick={() => setExtra((n) => n + 1)}
          aria-label="セット追加"
          className="mx-auto mt-2 flex h-11 w-11 items-center justify-center rounded-full text-faint active:text-fg"
        >
          <Icon name="plus" />
        </button>
        {rows.some((r) => r.kind === 'backoff') && (
          <>
            <span className="mt-6 border-b border-line pb-2 text-[11px] tracking-[0.15em] text-dim">
              BACK-OFF {Math.round(ex.backoff_ratio * 100)}%
            </span>
            {rows.filter((r) => r.kind === 'backoff').map(renderRow)}
          </>
        )}
      </div>

      {/* 疲労度 */}
      <div className="mt-8 flex items-center gap-4">
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
          style={{ '--p': `${fatigue}%` } as React.CSSProperties}
          className="gauge flex-1"
          aria-label="疲労度"
        />
        <span className="text-xs text-dim">重</span>
      </div>
      {/* ゲージを動かすと、次回の重量がその場で変わる。今日の全セットが次回を決める、が見える */}
      <p className={`mt-3 h-4 text-center text-xs leading-4 ${nextTime?.achieved ? 'text-fg' : 'text-dim'}`}>
        {nextTime === null || nextTime.mainWeight === null
          ? ''
          : nextTime.achieved
            ? `次回 ${fmtWeight(ex.equipment, nextTime.mainWeight)} kg（+${num(nextTime.increase)}）`
            : `次回 ${fmtWeight(ex.equipment, nextTime.mainWeight)} kg × ${nextTime.mainReps.join(',')}`}
      </p>

      {/* コメント */}
      <div className="mt-8">
        {showComment ? (
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              later()
            }}
            onBlur={flush}
            rows={3}
            className="w-full resize-none rounded-2xl bg-panel p-4 text-sm leading-relaxed"
          />
        ) : (
          <button
            onClick={() => setShowComment(true)}
            aria-label="コメント"
            className="mx-auto flex h-11 w-11 items-center justify-center rounded-full text-faint active:text-fg"
          >
            <Icon name="comment" />
          </button>
        )}
      </div>
    </section>
  )
}
