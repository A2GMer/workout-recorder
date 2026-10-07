-- 体のサイズ計測（メジャー）と、計測を促す間隔
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

create table public.measurements (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight_kg numeric(5, 1),
  waist numeric(5, 1),
  chest numeric(5, 1),
  shoulders numeric(5, 1),
  arm_relaxed_l numeric(5, 1),
  arm_relaxed_r numeric(5, 1),
  arm_flexed_l numeric(5, 1),
  arm_flexed_r numeric(5, 1),
  forearm_l numeric(5, 1),
  forearm_r numeric(5, 1),
  thigh_l numeric(5, 1),
  thigh_r numeric(5, 1),
  calf_l numeric(5, 1),
  calf_r numeric(5, 1),
  hip numeric(5, 1),
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create trigger measurements_touch before insert or update on public.measurements
  for each row execute function public.touch_updated_at();
create index measurements_sync_idx on public.measurements (user_id, updated_at);
alter table public.measurements enable row level security;
create policy measurements_own on public.measurements for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.measurements to authenticated;

alter table public.settings
  add column if not exists measure_interval_days int default 14 check (measure_interval_days > 0);
