-- スミスマシンを器具に追加し、スミスのバー重量を設定に持つ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

alter table public.exercises drop constraint if exists exercises_equipment_check;
alter table public.exercises
  add constraint exercises_equipment_check
  check (equipment in ('barbell', 'ez', 'smith', 'dumbbell', 'machine', 'bodyweight'));

alter table public.settings
  add column if not exists smith_bar_kg numeric(5, 2) default 20;
