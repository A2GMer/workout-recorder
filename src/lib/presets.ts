import type { BodyPart, Equipment, Exercise } from './types'

/**
 * 事前登録の種目。メニュー作成で選ばれた時点で種目として作られる。
 * heavy: 高重量（3回×5セット + バックオフ）/ それ以外は中重量（8回×3セット）
 */
export interface Preset {
  name: string
  part: BodyPart
  equipment: Equipment
  heavy: boolean
}

const P = (name: string, part: BodyPart, equipment: Equipment, heavy = false): Preset => ({ name, part, equipment, heavy })

export const PRESETS: Preset[] = [
  // 胸
  P('ベンチプレス', 'chest', 'barbell', true),
  P('インクラインベンチプレス', 'chest', 'barbell', true),
  P('スミスベンチプレス', 'chest', 'smith', true),
  P('スミスインクラインベンチプレス', 'chest', 'smith', true),
  P('ダンベルプレス', 'chest', 'dumbbell'),
  P('インクラインダンベルプレス', 'chest', 'dumbbell'),
  P('ダンベルフライ', 'chest', 'dumbbell'),
  P('ディップス', 'chest', 'bodyweight'),
  P('チェストプレス', 'chest', 'machine'),
  P('ペックフライ', 'chest', 'machine'),
  P('ケーブルクロスオーバー', 'chest', 'machine'),
  // 背中
  P('デッドリフト', 'back', 'barbell', true),
  P('懸垂', 'back', 'bodyweight', true),
  P('ベントオーバーロウ', 'back', 'barbell', true),
  P('スミスベントオーバーロウ', 'back', 'smith'),
  P('Tバーロウ', 'back', 'barbell'),
  P('ラットプルダウン', 'back', 'machine'),
  P('シーテッドロウ', 'back', 'machine'),
  P('ワンハンドダンベルロウ', 'back', 'dumbbell'),
  P('バックエクステンション', 'back', 'bodyweight'),
  // 肩
  P('オーバーヘッドプレス', 'shoulders', 'barbell', true),
  P('スミスショルダープレス', 'shoulders', 'smith', true),
  P('ダンベルショルダープレス', 'shoulders', 'dumbbell'),
  P('サイドレイズ', 'shoulders', 'dumbbell'),
  P('リアレイズ', 'shoulders', 'dumbbell'),
  P('フロントレイズ', 'shoulders', 'dumbbell'),
  P('アップライトロウ', 'shoulders', 'ez'),
  P('フェイスプル', 'shoulders', 'machine'),
  P('シュラッグ', 'shoulders', 'dumbbell'),
  // 腕
  P('ナローベンチプレス', 'arms', 'barbell', true),
  P('バーベルカール', 'arms', 'barbell'),
  P('EZバーカール', 'arms', 'ez'),
  P('ダンベルカール', 'arms', 'dumbbell'),
  P('ハンマーカール', 'arms', 'dumbbell'),
  P('プリーチャーカール', 'arms', 'ez'),
  P('ライイングトライセプスエクステンション', 'arms', 'ez'),
  P('プレスダウン（ケーブル）', 'arms', 'machine'),
  P('フレンチプレス', 'arms', 'dumbbell'),
  // 脚
  P('スクワット', 'legs', 'barbell', true),
  P('フロントスクワット', 'legs', 'barbell', true),
  P('スミススクワット', 'legs', 'smith', true),
  P('45度レッグプレス', 'legs', 'machine', true),
  P('レッグプレス', 'legs', 'machine'),
  P('ルーマニアンデッドリフト', 'legs', 'barbell'),
  P('ヒップスラスト', 'legs', 'barbell'),
  P('ブルガリアンスクワット', 'legs', 'dumbbell'),
  P('レッグエクステンション', 'legs', 'machine'),
  P('レッグカール', 'legs', 'machine'),
  P('カーフレイズ', 'legs', 'machine'),
  // 腹
  P('クランチ', 'core', 'bodyweight'),
  P('レッグレイズ', 'core', 'bodyweight'),
  P('ハンギングレッグレイズ', 'core', 'bodyweight'),
  P('アブローラー', 'core', 'bodyweight'),
  P('ケーブルクランチ', 'core', 'machine'),
]

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
