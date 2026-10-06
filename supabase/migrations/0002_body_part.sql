-- 種目に部位を追加（メニューの模様に使う）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.exercises
  add column if not exists body_part text
  check (body_part in ('chest', 'back', 'shoulders', 'arms', 'legs', 'core'));
