-- 部位ごとの1週間（直近7日）のセット数の目安。今日を組むときに「今週 4/10」と出す
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.settings
  add column if not exists weekly_sets integer not null default 10;
