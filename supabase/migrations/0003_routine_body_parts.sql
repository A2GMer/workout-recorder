-- メニューに対象部位を追加（種目選択の絞り込みと模様に使う）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.routines
  add column if not exists body_parts text[]
  check (body_parts <@ array['chest', 'back', 'shoulders', 'arms', 'legs', 'core']);
