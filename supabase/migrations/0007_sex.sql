-- 全身図の体型（男性 / 女性）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.settings
  add column if not exists sex text not null default 'male' check (sex in ('male', 'female'));
