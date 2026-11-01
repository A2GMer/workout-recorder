-- 種目の「動き」（混んでいるときに同じ動きの代わりの種目を出す）と「軸の種目」（部位ごとに伸びを測る種目）
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する
-- movement が null の種目は、アプリ側で事前登録の同名の種目から動きを引く

alter table public.exercises
  add column if not exists movement text,
  add column if not exists anchor boolean not null default false;
