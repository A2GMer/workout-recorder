import { MOVEMENTS, type BodyPart, type Equipment, type Exercise, type Movement } from './types'

/**
 * 事前登録の種目。今日を組むときに選ばれ、開始した時点で種目として作られる。
 * heavy: 高重量（3回×5セット + バックオフ）/ それ以外は中重量（8回×3セット）
 */
export interface Preset {
  name: string
  part: BodyPart
  movement: Movement
  equipment: Equipment
  heavy: boolean
}

const P = (name: string, movement: Movement, equipment: Equipment, heavy = false): Preset => ({
  name,
  part: MOVEMENTS[movement].part,
  movement,
  equipment,
  heavy,
})

export const PRESETS: Preset[] = [
  // 胸
  P('ベンチプレス', 'chest_press', 'barbell', true),
  P('インクラインベンチプレス', 'chest_incline', 'barbell', true),
  P('スミスベンチプレス', 'chest_press', 'smith', true),
  P('スミスインクラインベンチプレス', 'chest_incline', 'smith', true),
  P('ダンベルプレス', 'chest_press', 'dumbbell'),
  P('インクラインダンベルプレス', 'chest_incline', 'dumbbell'),
  P('ダンベルフライ', 'chest_fly', 'dumbbell'),
  P('ディップス', 'chest_press', 'bodyweight'),
  P('チェストプレス', 'chest_press', 'machine'),
  P('ペックフライ', 'chest_fly', 'machine'),
  P('ケーブルクロスオーバー', 'chest_fly', 'machine'),
  // 背中
  P('デッドリフト', 'back_hinge', 'barbell', true),
  P('懸垂', 'back_vertical', 'bodyweight', true),
  P('ベントオーバーロウ', 'back_row', 'barbell', true),
  P('スミスベントオーバーロウ', 'back_row', 'smith'),
  P('Tバーロウ', 'back_row', 'barbell'),
  P('ラットプルダウン', 'back_vertical', 'machine'),
  P('シーテッドロウ', 'back_row', 'machine'),
  P('ワンハンドダンベルロウ', 'back_row', 'dumbbell'),
  P('バックエクステンション', 'back_hinge', 'bodyweight'),
  // 肩
  P('オーバーヘッドプレス', 'shoulder_press', 'barbell', true),
  P('スミスショルダープレス', 'shoulder_press', 'smith', true),
  P('ダンベルショルダープレス', 'shoulder_press', 'dumbbell'),
  P('サイドレイズ', 'shoulder_side', 'dumbbell'),
  P('リアレイズ', 'shoulder_rear', 'dumbbell'),
  P('フロントレイズ', 'shoulder_front', 'dumbbell'),
  P('アップライトロウ', 'shoulder_side', 'ez'),
  P('フェイスプル', 'shoulder_rear', 'machine'),
  P('シュラッグ', 'shoulder_shrug', 'dumbbell'),
  // 腕
  P('ナローベンチプレス', 'arms_extension', 'barbell', true),
  P('バーベルカール', 'arms_curl', 'barbell'),
  P('EZバーカール', 'arms_curl', 'ez'),
  P('ダンベルカール', 'arms_curl', 'dumbbell'),
  P('ハンマーカール', 'arms_curl', 'dumbbell'),
  P('プリーチャーカール', 'arms_curl', 'ez'),
  P('ライイングトライセプスエクステンション', 'arms_extension', 'ez'),
  P('プレスダウン（ケーブル）', 'arms_extension', 'machine'),
  P('フレンチプレス', 'arms_extension', 'dumbbell'),
  // 脚
  P('スクワット', 'legs_squat', 'barbell', true),
  P('フロントスクワット', 'legs_squat', 'barbell', true),
  P('スミススクワット', 'legs_squat', 'smith', true),
  P('45度レッグプレス', 'legs_squat', 'machine', true),
  P('レッグプレス', 'legs_squat', 'machine'),
  P('ルーマニアンデッドリフト', 'legs_hinge', 'barbell'),
  P('ヒップスラスト', 'legs_hinge', 'barbell'),
  P('ブルガリアンスクワット', 'legs_squat', 'dumbbell'),
  P('レッグエクステンション', 'legs_extension', 'machine'),
  P('レッグカール', 'legs_curl', 'machine'),
  P('カーフレイズ', 'legs_calf', 'machine'),
  // 腹
  P('クランチ', 'core_crunch', 'bodyweight'),
  P('レッグレイズ', 'core_leg_raise', 'bodyweight'),
  P('ハンギングレッグレイズ', 'core_leg_raise', 'bodyweight'),
  P('アブローラー', 'core_crunch', 'bodyweight'),
  P('ケーブルクランチ', 'core_crunch', 'machine'),
]

const PRESET_BY_NAME = new Map(PRESETS.map((p) => [p.name, p]))

/**
 * 種目の動き。設定した動きがなければ、事前登録の同名の種目から引く（事前登録から作った種目は名前が同じ）。
 * 部位と合わない動き（あとで部位を変えたなど）は無しとみなす
 */
export function movementOf(e: Pick<Exercise, 'name' | 'body_part' | 'movement'>): Movement | null {
  const m = e.movement ?? PRESET_BY_NAME.get(e.name)?.movement
  return m && MOVEMENTS[m].part === e.body_part ? m : null
}

/** 種目の初期設定（事前登録・新規作成の共通） */
export function exerciseDefaults(equipment: Equipment, heavy: boolean) {
  return {
    weight_step: equipment === 'dumbbell' ? 2 : 2.5,
    target_reps: heavy ? 3 : 8,
    main_sets: heavy ? 5 : 3,
    pyramid: heavy,
    backoff_ratio: 0.6,
  } satisfies Partial<Exercise>
}
