import { lazy, Suspense, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  exerciseHistory,
  getSettings,
  listExercises,
  listMeasurements,
  patch,
  previousPerformance,
  remove,
  save,
  sessionExercises,
  setsOf,
  uuid,
} from '../data/repo'
import { figureOf, idealTargets } from '../lib/ideal'
import { fmtVolume, md, num } from '../lib/format'
import { fix, volume } from '../lib/progression'
import type { Exercise, Session, SessionExercise, Settings } from '../lib/types'
import { DIMS_OF_PART } from '../ui/Figure3D'

// 背景の 3D は別チャンク
const Figure3D = lazy(() => import('../ui/Figure3D'))
import { Stepper, type Editor } from '../ui/Stepper'
import { TopBar } from '../ui/TopBar'
import { Icon } from '../ui/Icon'
import { ExercisePanel, progressOf, type PanelData } from './ExercisePanel'

export default function SessionPage() {
  const { id } = useParams()
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id!)
    if (!session || session.deleted) return null
    const settings = await getSettings()
    const exercises = await listExercises(true)
    const byId = new Map(exercises.map((e) => [e.id, e]))
    const ses = await sessionExercises(session.id)
    const panels: PanelData[] = []
    for (const se of ses) {
      const ex = byId.get(se.exercise_id)
      if (!ex) continue
      panels.push({
        se,
        ex,
        sets: await setsOf(se.id),
        prev: await previousPerformance(ex.id, session),
        history: await exerciseHistory(ex, session),
      })
    }
    const unused = exercises.filter((e) => !e.archived && !ses.some((s) => s.exercise_id === e.id))
    const [latest] = await listMeasurements()
    const figure = figureOf(latest ?? null, idealTargets(latest ?? null, settings.height_cm))
    return { session, settings, panels, unused, figure, hasBody: !!latest && !!settings.height_cm }
  }, [id])

  const [editor, setEditor] = useState<Editor | null>(null)
  const [page, setPage] = useState(0)
  // 種目の入れ替え先を選んでいるパネル
  const [replacing, setReplacing] = useState<SessionExercise | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  if (data === undefined) return null
  if (data === null) return <TopBar back="/" />
  const { session, settings, panels, unused, figure, hasBody } = data

  function onScroll() {
    const el = scroller.current!
    setPage(Math.round(el.scrollLeft / el.clientWidth))
  }

  function goTo(i: number) {
    const el = scroller.current!
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  function editBodyWeight() {
    setEditor({
      key: 'bw',
      label: 'BODY',
      unit: 'kg',
      value: Math.round(session.body_weight_kg),
      step: 1,
      big: 5,
      min: 20,
      apply: (v) => {
        void patch<Session>('sessions', session.id, { body_weight_kg: v })
        void save<Settings>('settings', { ...settings, body_weight_kg: v })
      },
    })
  }

  /** 今日の順番を入れ替える（隣と sort_order を交換） */
  async function move(i: number, dir: -1 | 1) {
    const a = panels[i]?.se
    const b = panels[i + dir]?.se
    if (!a || !b) return
    await save<SessionExercise>('session_exercises', [
      { ...a, sort_order: b.sort_order },
      { ...b, sort_order: a.sort_order },
    ])
    requestAnimationFrame(() => goTo(i + dir))
  }

  /** 今日はやらない。記録があれば確認してから記録ごと外す */
  async function dropExercise(p: PanelData) {
    if (p.sets.length && !confirm(`${p.ex.name} の今日の記録ごと外しますか？`)) return
    for (const w of p.sets) await remove('work_sets', w.id)
    await remove('session_exercises', p.se.id)
  }

  /** 別の種目に入れ替える（記録がないときだけ。順番はそのまま） */
  async function replaceExercise(se: SessionExercise, ex: Exercise) {
    setReplacing(null)
    await patch<SessionExercise>('session_exercises', se.id, { exercise_id: ex.id })
  }

  async function addExercise(exerciseId: string) {
    await save<SessionExercise>('session_exercises', {
      id: uuid(),
      session_id: session.id,
      exercise_id: exerciseId,
      sort_order: Math.max(-1, ...panels.map((p) => p.se.sort_order)) + 1,
      fatigue: 50,
      comment: '',
    })
    requestAnimationFrame(() => {
      const el = scroller.current!
      el.scrollTo({ left: panels.length * el.clientWidth, behavior: 'smooth' })
    })
  }

  const total = panels.length + 1
  const current = panels[page]
  // 背景の全身図で強調する部位 = 開いている種目の部位
  const emphasis = new Set(current?.ex.body_part ? DIMS_OF_PART[current.ex.body_part] : [])
  // 前回を超えた種目のドットは白く灯る。進むほど灯りが増える
  const beaten = panels.map((p) => {
    if (!p.sets.length) return false
    const actual = volume(p.sets, p.ex.equipment, session.body_weight_kg)
    const prevVolume = p.prev
      ? volume([...p.prev.prev.main, ...p.prev.prev.backoff], p.ex.equipment, p.prev.session.body_weight_kg)
      : null
    return progressOf(p.sets, actual, prevVolume, p.history).beat
  })
  const title = current ? current.ex.name : '今日'
  const sub = current
    ? `${current.ex.target_reps}回 × ${current.ex.main_sets}${current.ex.pyramid ? ' + B' : ''}`
    : md(session.date)

  return (
    <div className="relative flex h-full flex-col">
      {/* 背景: 対象部位を強調した全身図を薄く。操作は受けない */}
      <div className="pointer-events-none absolute inset-x-0 top-14 bottom-0 flex items-center justify-center opacity-25">
        <Suspense fallback={null}>
          <Figure3D figure={figure} showTarget={hasBody} emphasis={emphasis} sex={settings.sex} motion="idle" className="h-[62%] w-full max-w-[420px]" />
        </Suspense>
      </div>
      <TopBar
        back="/"
        title={title}
        sub={sub}
        right={
          <button
            onClick={editBodyWeight}
            className={`h-11 rounded-xl px-2 text-sm transition ${editor?.key === 'bw' ? 'bg-chip text-fg' : 'text-dim'}`}
            aria-label="体重"
          >
            {num(session.body_weight_kg)}
            <span className="ml-0.5 text-[11px] text-faint">kg</span>
          </button>
        }
      />
      <div ref={scroller} onScroll={onScroll} className="snap-x-panels relative flex min-h-0 flex-1 overflow-x-auto">
        {panels.map((p, i) => (
          <ExercisePanel
            key={p.se.id}
            data={p}
            session={session}
            settings={settings}
            activeKey={editor?.key ?? null}
            openEditor={setEditor}
            closeEditor={() => setEditor(null)}
            arrange={{
              canBack: i > 0,
              canForward: i < panels.length - 1,
              onMove: (dir) => void move(i, dir),
              onDrop: () => void dropExercise(p),
              onReplace: unused.length && !p.sets.length ? () => setReplacing(p.se) : undefined,
            }}
          />
        ))}
        <section className="no-scrollbar flex h-full w-full shrink-0 grow-0 basis-full flex-col overflow-y-auto px-5 pt-4 pb-56 [&>*]:shrink-0">
          <TodaySummary panels={panels} session={session} />
          {unused.length > 0 && (
            <span className="mt-8 border-b border-line pb-2 text-[11px] tracking-[0.15em] text-dim">ADD</span>
          )}
          {unused.map((e) => (
            <button
              key={e.id}
              onClick={() => addExercise(e.id)}
              className="flex h-14 items-center justify-between border-b border-line text-left transition active:text-dim"
            >
              <span className="truncate">{e.name}</span>
              <Icon name="plus" size={18} className="shrink-0 text-faint" />
            </button>
          ))}
        </section>
      </div>
      {!editor && (
        <div className="flex shrink-0 justify-center pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`${i + 1}`}
              className="flex h-10 w-9 items-center justify-center"
            >
              <span
                className={`block rounded-full transition ${
                  i === page ? 'h-2 w-2 bg-fg' : beaten[i] ? 'h-1.5 w-1.5 bg-fg' : 'h-1.5 w-1.5 bg-faint'
                }`}
              />
            </button>
          ))}
        </div>
      )}
      {replacing && (
        <div className="fixed inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-[28px] border-t border-line bg-panel px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="relative flex h-12 items-center justify-center">
            <span className="text-sm">入れ替える種目</span>
            <button onClick={() => setReplacing(null)} aria-label="閉じる" className="absolute right-0 flex h-11 w-11 items-center justify-center text-dim">
              <Icon name="down" />
            </button>
          </div>
          {unused.map((e) => (
            <button
              key={e.id}
              onClick={() => void replaceExercise(replacing, e)}
              className="flex h-14 w-full items-center justify-between border-b border-line text-left transition active:text-dim"
            >
              <span className="truncate">{e.name}</span>
              <Icon name="arrow" size={18} className="shrink-0 text-faint" />
            </button>
          ))}
        </div>
      )}
      {editor && (
        <Stepper
          editor={editor}
          onChange={(v) => {
            editor.apply(v)
            setEditor({ ...editor, value: v })
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  )
}

/**
 * 最後のパネルの「今日のまとめ」。終了ボタンの代わりに、ここまでの到達点を一目で。
 * 合計ボリューム / 前回比（前回と比べられる種目の合計）/ 更新した種目数 / 自己ベスト数
 */
function TodaySummary({ panels, session }: { panels: PanelData[]; session: Session }) {
  const bw = session.body_weight_kg
  let total = 0
  let actualCompared = 0
  let prevCompared = 0
  let compared = 0
  let improved = 0
  let bests = 0
  let recorded = 0
  for (const p of panels) {
    if (!p.sets.length) continue
    recorded += p.sets.length
    const actual = volume(p.sets, p.ex.equipment, bw)
    total += actual
    const prevVolume = p.prev ? volume([...p.prev.prev.main, ...p.prev.prev.backoff], p.ex.equipment, p.prev.session.body_weight_kg) : null
    const { beat, isBest } = progressOf(p.sets, actual, prevVolume, p.history)
    if (prevVolume !== null) {
      compared++
      actualCompared += actual
      prevCompared += prevVolume
      if (beat) improved++
    }
    if (isBest) bests++
  }
  if (!recorded) return null
  const delta = fix(actualCompared - prevCompared)
  const allBeat = compared > 0 && improved === compared
  const marks: string[] = []
  if (compared) marks.push(`更新 ${improved}/${compared} 種目`)
  if (bests) marks.push(`自己ベスト ${bests}`)
  return (
    <div className="flex flex-col items-center border-b border-line pb-8">
      <span className="text-[11px] tracking-[0.2em] text-dim">TODAY</span>
      <span className="mt-3 text-[56px] leading-none tracking-tight">{fmtVolume(total)}</span>
      <span className={`mt-2 h-4 text-xs leading-4 ${delta > 0 ? 'text-fg' : 'text-dim'}`}>
        {compared ? (delta > 0 ? `+${fmtVolume(delta)}` : `あと ${fmtVolume(Math.max(1, -delta + 1))}`) : ''}
      </span>
      <span className={`mt-1 h-4 text-[11px] leading-4 ${allBeat ? 'text-fg' : 'text-dim'}`}>{marks.join(' · ')}</span>
    </div>
  )
}
