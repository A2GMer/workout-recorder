-- 身長（プロポーション目標の基準）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.settings
  add column if not exists height_cm numeric(5, 1) check (height_cm is null or height_cm between 100 and 250);
