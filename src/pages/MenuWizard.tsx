import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../data/db'
import {
  exerciseSummary,
  lackingParts,
  listCandidates,
  listExercises,
  remove,
  routineItems,
  saveRoutine,
  type Candidate,
  type ExerciseSummary,
} from '../data/repo'
import { fmtWeight, num } from '../lib/format'
import { BODY_PART_LABEL, EQUIPMENT_LABEL, type BodyPart, type Equipment, type Routine } from '../lib/types'
import { BodyArt } from '../ui/BodyArt'
import { Icon } from '../ui/Icon'
import { PrimaryButton, Question } from '../ui/Flow'
import { TopBar } from '../ui/TopBar'

const PARTS = Object.keys(BODY_PART_LABEL) as BodyPart[]
const partsName = (parts: BodyPart[]) => parts.map((p) => BODY_PART_LABEL[p]).join('・')

/** 歩み: プロポーション目標に足りない部位と、種目ごとの最大重量・伸び・次回の重量アップ */
function useProgress() {
  return useLiveQuery(async () => ({
    lacking: await lackingParts(),
    summaries: new Map(await Promise.all((await listExercises()).map(async (e) => [e.id, await exerciseSummary(e)] as const))),
  }))
}

type Step = 'parts' | 'exercises' | 'create' | 'finish'

/**
 * メニュー作成（一方通行）: 部位 → 種目 → 並び順と名前 → 完了
 * 種目の新規作成は「種目」の段階の中だけで行う。完了を押すまで何も保存しない。
 */
export function MenuWizard({
  routine,
  initial = [],
  progress,
  onDone,
  onCancel,
}: {
  routine?: Routine
  initial?: Candidate[]
  /** チュートリアルに組み込むときの通し番号 */
  progress?: { offset: number; total: number }
  onDone: (routineId: string) => void
  onCancel: () => void
}) {
  const candidates = useLiveQuery(listCandidates) ?? []
  const progressData = useProgress()
  const lacking = progressData?.lacking ?? []
  const summaries = progressData?.summaries
  const [step, setStep] = useState<Step>(routine ? 'exercises' : 'parts')
  const [parts, setParts] = useState<BodyPart[]>(routine?.body_parts ?? [])
  const [selected, setSelected] = useState<Candidate[]>(initial)
  const [custom, setCustom] = useState<Candidate[]>([])
  const [name, setName] = useState(routine?.name ?? '')
  const [nameEdited, setNameEdited] = useState(!!routine && routine.name !== partsName(routine.body_parts ?? []))
  const [busy, setBusy] = useState(false)

  const shownName = nameEdited ? name : partsName(parts)

  const order: Step[] = ['parts', 'exercises', 'finish']
  const index = order.indexOf(step === 'create' ? 'exercises' : step)
  const sub = `${(progress?.offset ?? 0) + index + 1} / ${progress?.total ?? order.length}`

  function back() {
    if (step === 'create') return setStep('exercises')
    if (index === 0) return onCancel()
    setStep(order[index - 1])
  }

  const isSelected = (c: Candidate) => selected.some((s) => s.key === c.key)
  const toggle = (c: Candidate) =>
    setSelected((s) => (s.some((x) => x.key === c.key) ? s.filter((x) => x.key !== c.key) : [...s, c]))

  async function finish() {
    setBusy(true)
    const id = await saveRoutine({ id: routine?.id, name: shownName || 'メニュー', body_parts: parts, candidates: selected })
    onDone(id)
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar onBack={back} title={routine ? 'メニュー編集' : 'メニュー作成'} sub={sub} />

      {step === 'parts' && (
        <>
          <Question sub={lacking.length ? `目標のプロポーションに足りないのは ${partsName(lacking)}` : undefined}>どこを鍛える？</Question>
          <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-5 pb-4">
            {PARTS.map((p) => {
              const on = parts.includes(p)
              const want = lacking.includes(p)
              return (
                <button
                  key={p}
                  onClick={() => setParts((ps) => (on ? ps.filter((x) => x !== p) : [...ps, p]))}
                  aria-pressed={on}
                  className={`relative flex aspect-[5/4] flex-col items-center justify-center gap-2 rounded-2xl border transition ${
                    on ? 'border-fg bg-panel text-fg' : 'border-line text-faint'
                  }`}
                >
                  {/* 伸ばしどころの印: 右上に白い点 */}
                  {want && <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-fg" aria-label="伸ばしどころ" />}
                  <BodyArt parts={[p]} intensity={on ? 0.5 : 0} animate={on} className="h-16 w-16" />
                  <span className={`text-sm ${on ? 'text-fg' : 'text-dim'}`}>{BODY_PART_LABEL[p]}</span>
                </button>
              )
            })}
          </div>
          <PrimaryButton disabled={!parts.length} onClick={() => setStep('exercises')}>
            次へ
          </PrimaryButton>
        </>
      )}

      {step === 'exercises' && (
        <>
          <Question sub="タップした順に並びます">種目を選ぶ</Question>
          <ExerciseList
            parts={parts}
            candidates={[...custom, ...candidates]}
            selected={selected}
            summaries={summaries}
            isSelected={isSelected}
            onToggle={toggle}
            onCreate={() => setStep('create')}
          />
          <PrimaryButton disabled={!selected.length} onClick={() => setStep('finish')}>
            次へ{selected.length ? `（${selected.length}）` : ''}
          </PrimaryButton>
        </>
      )}

      {step === 'create' && (
        <CreateExercise
          parts={parts}
          onAdd={(c) => {
            setCustom((cs) => [c, ...cs])
            setSelected((s) => [...s, c])
            setStep('exercises')
          }}
        />
      )}

      {step === 'finish' && (
        <>
          <Question>順番と名前</Question>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-5 pb-4">
            <input
              value={shownName}
              onChange={(e) => {
                setName(e.target.value)
                setNameEdited(true)
              }}
              placeholder="メニュー名"
              aria-label="メニュー名"
              className="h-14 rounded-2xl bg-panel px-5 text-center text-lg placeholder:text-faint"
            />
            <MenuOutlook selected={selected} summaries={summaries} lacking={lacking} />
            {selected.map((c, i) => (
              <div key={c.key} className="flex h-14 items-center border-b border-line">
                <span className="w-7 shrink-0 text-xs text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <button
                  onClick={() => setSelected((s) => swap(s, i, i - 1))}
                  disabled={i === 0}
                  aria-label="上へ"
                  className="flex h-12 w-10 items-center justify-center text-dim disabled:opacity-20"
                >
                  <Icon name="up" size={18} />
                </button>
                <button
                  onClick={() => setSelected((s) => swap(s, i, i + 1))}
                  disabled={i === selected.length - 1}
                  aria-label="下へ"
                  className="flex h-12 w-10 items-center justify-center text-dim disabled:opacity-20"
                >
                  <Icon name="down" size={18} />
                </button>
              </div>
            ))}
            {routine && (
              <button
                onClick={async () => {
                  if (!confirm(`${routine.name} を削除しますか？`)) return
                  await remove('routines', routine.id)
                  onCancel()
                }}
                className="mt-6 h-11 self-center px-4 text-sm text-dim"
              >
                このメニューを削除
              </button>
            )}
          </div>
          <PrimaryButton disabled={busy || !selected.length} onClick={finish}>
            完了
          </PrimaryButton>
        </>
      )}
    </div>
  )
}

/**
 * このメニューの見どころ: 次にやるとき重量が上がる種目数、初めての種目数、伸ばしどころを含むか。
 * 完了を押す前に「このメニューで前に進める」ことを見せる
 */
function MenuOutlook({ selected, summaries, lacking }: {
  selected: Candidate[]
  summaries?: Map<string, ExerciseSummary>
  lacking: BodyPart[]
}) {
  const ups = selected.filter((c) => c.exercise && summaries?.get(c.exercise.id)?.weightUp).length
  const fresh = selected.filter((c) => !c.exercise || !summaries?.get(c.exercise.id)?.sessions).length
  const covered = lacking.filter((b) => selected.some((c) => c.part === b))
  const missing = lacking.filter((b) => !covered.includes(b))
  const marks: string[] = []
  if (ups) marks.push(`重量アップ ${ups} 種目`)
  if (fresh) marks.push(`初めての種目 ${fresh}`)
  if (!marks.length && !lacking.length) return <div className="mb-4" />
  return (
    <div className="mb-4 flex flex-col items-center gap-1 pt-3 text-xs">
      <span className={ups ? 'text-fg' : 'text-dim'}>{marks.join(' · ')}</span>
      {lacking.length > 0 && (
        <span className="text-dim">
          {covered.length > 0 && <>伸ばしどころの {partsName(covered)} を含む</>}
          {covered.length > 0 && missing.length > 0 && ' · '}
          {missing.length > 0 && <span className="text-faint">{partsName(missing)} は別のメニューで</span>}
        </span>
      )}
    </div>
  )
}

function swap<T>(xs: T[], i: number, j: number): T[] {
  if (j < 0 || j >= xs.length) return xs
  const out = [...xs]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** 選んだ部位の種目だけを、部位ごとに並べる */
function ExerciseList({ parts, candidates, selected, summaries, isSelected, onToggle, onCreate }: {
  parts: BodyPart[]
  candidates: Candidate[]
  selected: Candidate[]
  summaries?: Map<string, ExerciseSummary>
  isSelected: (c: Candidate) => boolean
  onToggle: (c: Candidate) => void
  onCreate: () => void
}) {
  // 編集時など、選択済みで対象部位の外にある種目も見えるようにする
  const others = selected.filter((c) => !c.part || !parts.includes(c.part))
  const groups: { label: string; items: Candidate[] }[] = [
    ...parts.map((p) => ({ label: BODY_PART_LABEL[p], items: candidates.filter((c) => c.part === p) })),
    ...(others.length ? [{ label: 'その他', items: others }] : []),
  ]
  return (
    <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">
      {groups.map((g) => (
        <section key={g.label} className="mb-6">
          <h3 className="mb-1 text-[11px] tracking-[0.2em] text-dim">{g.label}</h3>
          {g.items.map((c) => {
            const n = selected.findIndex((s) => s.key === c.key)
            const on = isSelected(c)
            const s = c.exercise ? summaries?.get(c.exercise.id) : undefined
            return (
              <button key={c.key} onClick={() => onToggle(c)} className="flex h-14 w-full items-center gap-3 border-b border-line text-left">
                <span className={`min-w-0 flex-1 truncate ${on ? 'text-fg' : 'text-dim'}`}>{c.name}</span>
                {/* 既存の種目は今の最大重量と伸びを。自己ベスト一覧から選ぶ感覚に */}
                {s && s.topWeight !== null ? (
                  <span className="flex shrink-0 flex-col items-end">
                    <span className={`text-sm leading-none ${on ? 'text-fg' : 'text-dim'}`}>
                      {fmtWeight(c.equipment, s.topWeight)}
                      <span className="ml-0.5 text-[10px] text-faint">kg</span>
                    </span>
                    <span className="mt-1 text-[10px] leading-none text-faint">
                      {s.gain && s.gain > 0 ? `+${num(s.gain)}` : ''}
                      {s.gain && s.gain > 0 && s.weightUp ? ' · ' : ''}
                      {s.weightUp ? '次は重量アップ' : ''}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-faint">{EQUIPMENT_LABEL[c.equipment]}</span>
                )}
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs transition ${
                    on ? 'bg-fg text-bg' : 'border border-faint'
                  }`}
                >
                  {on ? n + 1 : ''}
                </span>
              </button>
            )
          })}
        </section>
      ))}
      <button onClick={onCreate} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-dim">
        <Icon name="plus" size={16} />
        一覧にない種目
      </button>
    </div>
  )
}

/** 一覧にない種目を作る（名前だけキーボード。あとは選ぶだけ） */
function CreateExercise({ parts, onAdd }: { parts: BodyPart[]; onAdd: (c: Candidate) => void }) {
  const [name, setName] = useState('')
  const [part, setPart] = useState<BodyPart | null>(parts[0] ?? null)
  const [equipment, setEquipment] = useState<Equipment>('barbell')
  const [heavy, setHeavy] = useState(false)
  const chip = (on: boolean) => `h-11 rounded-xl text-sm transition ${on ? 'bg-fg text-bg' : 'text-dim'}`

  return (
    <>
      <Question>新しい種目</Question>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 pb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="種目名"
          aria-label="種目名"
          autoFocus
          className="h-14 rounded-2xl bg-panel px-5 text-center text-lg placeholder:text-faint"
        />
        {parts.length > 1 && (
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-chip p-1">
            {parts.map((p) => (
              <button key={p} onClick={() => setPart(p)} className={chip(part === p)}>
                {BODY_PART_LABEL[p]}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-chip p-1">
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((eq) => (
            <button key={eq} onClick={() => setEquipment(eq)} className={chip(equipment === eq)}>
              {EQUIPMENT_LABEL[eq]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-chip p-1">
          <button onClick={() => setHeavy(true)} className={`${chip(heavy)} flex h-16 flex-col items-center justify-center`}>
            <span>高重量</span>
            <span className="text-[11px] opacity-60">3回×5 + バックオフ</span>
          </button>
          <button onClick={() => setHeavy(false)} className={`${chip(!heavy)} flex h-16 flex-col items-center justify-center`}>
            <span>中重量</span>
            <span className="text-[11px] opacity-60">8回×3</span>
          </button>
        </div>
      </div>
      <PrimaryButton
        disabled={!name.trim()}
        onClick={() => onAdd({ key: `new:${crypto.randomUUID()}`, name: name.trim(), part, equipment, heavy })}
      >
        追加
      </PrimaryButton>
    </>
  )
}

/** /menu/new と /menu/:id */
export default function MenuWizardPage() {
  const { id } = useParams()
  const nav = useNavigate()
  // 編集中に同期で選択が戻らないよう、初期値は開いた時に1回だけ読む
  const [data, setData] = useState<{ routine?: Routine; initial: Candidate[] }>()
  useEffect(() => {
    void (async () => {
      if (!id) return setData({ initial: [] })
      const routine = await db.routines.get(id)
      const all = await listCandidates()
      const initial = (await routineItems(id))
        .map((it) => all.find((c) => c.exercise?.id === it.exercise_id))
        .filter((c): c is Candidate => !!c)
      setData({ routine, initial })
    })()
  }, [id])
  if (!data) return null
  return (
    <MenuWizard
      routine={data.routine}
      initial={data.initial}
      onDone={() => nav('/', { replace: true })}
      onCancel={() => nav(-1)}
    />
  )
}
