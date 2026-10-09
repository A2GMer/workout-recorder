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
import { FatigueGauge } from '../ui/FatigueGauge'
import { Toast } from '../ui/Toast'
import { useDragAdjust } from '../ui/useDragAdjust'

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

/** 今日の並べ替え・入れ替え・外す */
export interface Arrange {
  canBack: boolean
  canForward: boolean
  onMove: (dir: -1 | 1) => void
  onDrop: () => void
  /** 記録がなく、入れ替え先があるときだけ */
  onReplace?: () => void
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

/** 数字のボタン。タップで Stepper、長押しのあとドラッグで連続調整 */
function NumberCell({
  value,
  onApply,
  onTap,
  onDragStart,
  axis,
  pixelsPerStep,
  step,
  min,
  className,
  ariaLabel,
  children,
}: {
  value: number
  onApply: (v: number) => void
  onTap: (el: HTMLElement) => void
  onDragStart: () => void
  axis: 'x' | 'y'
  pixelsPerStep: number
  step: number
  min?: number
  className: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const start = useRef(value)
  const handlers = useDragAdjust({
    axis,
    pixelsPerStep,
    onStart: () => {
      start.current = value
      setDragging(true)
      onDragStart()
    },
    onSteps: (steps) => {
      const v = fix(start.current + steps * step)
      onApply(min === undefined ? v : Math.max(min, v))
    },
    onEnd: () => setDragging(false),
    onTap,
  })
  return (
    <button
      {...handlers}
      // キーボード操作（detail 0）だけここで拾う。ポインタ操作は上のハンドラが扱う
      onClick={(e) => {
        if (e.detail === 0) onTap(e.currentTarget)
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={ariaLabel}
      style={{ touchAction: axis === 'x' ? 'pan-y' : 'pan-x' }}
      className={`select-none ${className} ${dragging ? 'bg-chip' : ''}`}
    >
      {children}
    </button>
  )
}

export function ExercisePanel({
  data,
  session,
  settings,
  activeKey,
  openEditor,
  closeEditor,
  arrange,
}: {
  data: PanelData
  session: Session
  settings: Settings
  activeKey: string | null
  openEditor: (e: Editor) => void
  closeEditor: () => void
  arrange?: Arrange
}) {
  const { se, ex, sets, prev } = data
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [extra, setExtra] = useState(0)
  // 記録した瞬間の波紋（行キー → 発火時刻。span の key にして毎回つくり直す）
  const [ripples, setRipples] = useState<Record<string, number>>({})
  // 取り消した記録（「戻す」で復活できる）
  const [undo, setUndo] = useState<WorkSet | null>(null)
  const gaugeRef = useRef<HTMLDivElement>(null)
  const gaugeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(gaugeTimer.current), [])
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

  /** 数値の反映（Stepper もドラッグも共通）。記録済みなら保存、未記録なら下書き */
  function applyValue(row: Row, field: Field, v: number) {
    if (row.rec) void patch<WorkSet>('work_sets', row.rec.id, { [FIELD_COL[field]]: v })
    else setDraft(row.key, field, v)
  }

  function edit(row: Row, field: Field, el: HTMLElement) {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    const value = field === 'weight' ? row.weight : field === 'reps' ? row.reps : row.cheat
    const isW = field === 'weight'
    openEditor({
      key: `${se.id}:${row.key}:${field}`,
      label: row.kind === 'backoff' ? 'BACK-OFF' : `セット ${row.setNo}`,
      unit: isW ? 'kg' : field === 'reps' ? '回' : 'チート',
      value,
      step: isW ? ex.weight_step : 1,
      big: isW ? 10 : undefined,
      min: isW ? (ex.equipment === 'bodyweight' ? undefined : bar) : 0,
      format: isW ? (v) => fmtWeight(ex.equipment, v) : String,
      apply: (v) => applyValue(row, field, v),
    })
  }

  function ripple(key: string) {
    const stamp = Date.now()
    setRipples((r) => ({ ...r, [key]: stamp }))
    setTimeout(() => {
      setRipples((r) => {
        if (r[key] !== stamp) return r
        const { [key]: _, ...rest } = r
        return rest
      })
    }, 500)
  }

  async function toggle(row: Row) {
    closeEditor()
    if (row.rec) {
      // 取り消し時は値を下書きに戻す
      setDrafts((ds) => ({ ...ds, [row.key]: { weight: row.weight, reps: row.reps, cheat: row.cheat } }))
      const removed = row.rec
      await remove('work_sets', removed.id)
      setUndo(removed)
      return
    }
    setUndo(null)
    // バックオフの重量はその時点で確定させる
    ripple(row.key)
    try {
      navigator.vibrate?.(10)
    } catch {
      // 対応していない端末は無視
    }
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
    // メインセットが全部そろった / バックオフを記録したら、疲労ゲージへ
    const done = row.kind === 'backoff' || rows.filter((r) => r.kind === 'main').every((r) => r.rec || r.key === row.key)
    if (done) {
      clearTimeout(gaugeTimer.current)
      gaugeTimer.current = setTimeout(() => {
        const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        gaugeRef.current?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' })
      }, 300)
    }
  }

  async function restore() {
    if (!undo) return
    const rec = undo
    setUndo(null)
    await save<WorkSet>('work_sets', { ...rec, deleted: false })
    // 取り消し時に戻しておいた下書きは不要
    setDrafts((ds) => {
      const { [rec.kind === 'backoff' ? 'b1' : `m${rec.set_no}`]: _, ...rest } = ds
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
          // 次に押す ✓ だけが白。ほかの未記録は灰のまま
          const isNext = !recorded && nextRow?.key === row.key
          return (
            <div
              key={row.key}
              className={`flex h-16 items-center border-b border-line `}
            >
              <span className="w-7 shrink-0 text-xs text-faint">{backoff ? 'B' : row.setNo}</span>
              <NumberCell
                value={row.weight}
                onApply={(v) => applyValue(row, 'weight', v)}
                onTap={(el) => edit(row, 'weight', el)}
                onDragStart={closeEditor}
                axis="x"
                pixelsPerStep={24}
                step={ex.weight_step}
                min={ex.equipment === 'bodyweight' ? undefined : bar}
                className={`flex h-12 w-[92px] shrink-0 flex-col items-end justify-center rounded-xl px-2 transition ${tone} ${cell(row, 'weight')}`}
              >
                <span className="text-[26px] leading-none">{fmtWeight(ex.equipment, row.weight)}</span>
                {perSide !== null && perSide > 0 && (
                  <span className="mt-1 text-[11px] leading-none text-faint">片 {num(perSide)}</span>
                )}
              </NumberCell>
              <span className="w-6 shrink-0 text-center text-xs text-faint">×</span>
              <NumberCell
                value={row.reps}
                onApply={(v) => applyValue(row, 'reps', v)}
                onTap={(el) => edit(row, 'reps', el)}
                onDragStart={closeEditor}
                axis="y"
                pixelsPerStep={20}
                step={1}
                min={0}
                className={`flex h-12 min-w-12 shrink-0 items-center rounded-xl px-2 transition ${tone} ${cell(row, 'reps')}`}
              >
                <span className="text-[26px] leading-none">{row.reps}</span>
                {!recorded && row.need ? <span className="ml-1.5 text-xs text-dim">≥{row.need}</span> : null}
              </NumberCell>
              <NumberCell
                value={row.cheat}
                onApply={(v) => applyValue(row, 'cheat', v)}
                onTap={(el) => edit(row, 'cheat', el)}
                onDragStart={closeEditor}
                axis="y"
                pixelsPerStep={20}
                step={1}
                min={0}
                ariaLabel="チーティング回数"
                className={`ml-auto flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-2 text-xs transition ${
                  row.cheat > 0 ? 'text-fg' : 'text-faint'
                } ${cell(row, 'cheat')}`}
              >
                C{row.cheat}
              </NumberCell>
              <button
                onClick={() => toggle(row)}
                aria-label={recorded ? '記録取消' : '記録'}
                className={`relative ml-2 flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-full transition active:scale-90 ${
                  recorded ? 'bg-fg text-bg' : isNext ? 'border border-fg text-fg' : 'border border-faint text-faint'
                }`}
              >
                {ripples[row.key] !== undefined && (
                  <span
                    key={ripples[row.key]}
                    aria-hidden
                    className="ripple pointer-events-none absolute inset-0 rounded-full border border-fg"
                  />
                )}
                <Icon name="check" size={20} />
              </button>
            </div>
          )
  }

  return (
    <section className="no-scrollbar flex h-full w-full shrink-0 grow-0 basis-full flex-col overflow-y-auto px-5 pb-64 [&>*]:shrink-0">
      {/* ボリューム */}
      {/* 3D の線に数字が埋もれないよう、背面に黒をにじませる（位置は動かさない） */}
      <div className="-mx-5 -mb-6 flex flex-col items-center bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.85)_35%,rgba(0,0,0,0)_72%)] px-5 pb-6 pt-4">
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
          {prev ? (
            <>
              <span className="text-faint">{md(prev.session.date)}</span>
              <span className="text-dim">　{fmtSets(ex.equipment, [...prev.prev.main, ...prev.prev.backoff])}</span>
              <span className="text-fg"> = {fmtVolume(sugg.prevVolume!)}</span>
            </>
          ) : (
            '初回'
          )}
        </p>
      </div>

      {/* セット */}
      <div className="-mx-5 mt-8 flex flex-col bg-[linear-gradient(to_bottom,rgba(0,0,0,0)_0%,rgba(0,0,0,0.75)_8%,rgba(0,0,0,0.75)_92%,rgba(0,0,0,0)_100%)] px-5">
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
      <div ref={gaugeRef} className="mt-8 flex items-center gap-4">
        <span className="text-xs text-dim">軽</span>
        <FatigueGauge
          value={fatigue}
          onChange={(v) => {
            setFatigue(v)
            later()
          }}
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

      {/* 今日の予定を変える: 順番 / 入れ替え / 外す */}
      {arrange && (
        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-faint">
          <button
            onClick={() => arrange.onMove(-1)}
            disabled={!arrange.canBack}
            aria-label="順番を前へ"
            className="flex h-11 w-11 items-center justify-center rounded-full active:text-fg disabled:opacity-20"
          >
            <Icon name="back" size={18} />
          </button>
          {arrange.onReplace && (
            <button onClick={arrange.onReplace} className="h-11 rounded-full px-4 active:text-fg">
              種目を変える
            </button>
          )}
          <button onClick={arrange.onDrop} className="h-11 rounded-full px-4 active:text-fg">
            今日はやらない
          </button>
          <button
            onClick={() => arrange.onMove(1)}
            disabled={!arrange.canForward}
            aria-label="順番を後ろへ"
            className="flex h-11 w-11 items-center justify-center rounded-full active:text-fg disabled:opacity-20"
          >
            <Icon name="back" size={18} className="rotate-180" />
          </button>
        </div>
      )}

      {undo && (
        <Toast
          key={undo.id}
          message="取り消しました"
          action="戻す"
          onAction={() => void restore()}
          onClose={() => setUndo(null)}
        />
      )}
    </section>
  )
}
