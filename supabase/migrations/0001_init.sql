-- 筋トレ記録アプリ 初期スキーマ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行する

-- updated_at はサーバー時刻で更新（端末の同期カーソルに使う）
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create table public.settings (
  id uuid primary key,                                   -- = auth.uid()
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body_weight_kg numeric(5, 1) not null default 70,
  ez_bar_kg numeric(5, 2) not null default 10,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  constraint settings_id_is_user check (id = user_id)
);

create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  equipment text not null check (equipment in ('barbell', 'ez', 'dumbbell', 'machine', 'bodyweight')),
  weight_step numeric(5, 2) not null default 2.5 check (weight_step > 0),
  target_reps int not null default 3 check (target_reps > 0),
  main_sets int not null default 5 check (main_sets > 0),
  pyramid boolean not null default true,
  backoff_ratio numeric(3, 2) not null default 0.6 check (backoff_ratio > 0 and backoff_ratio <= 1),
  sort_order int not null default 0,
  archived boolean not null default false,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.routines (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.routine_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  sort_order int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid references public.routines (id) on delete set null,
  date date not null,
  body_weight_kg numeric(5, 1) not null,
  created_at timestamptz not null default now(),
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.session_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  sort_order int not null default 0,
  fatigue int not null default 50 check (fatigue between 0 and 100),
  comment text not null default '',
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.work_sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  kind text not null check (kind in ('main', 'backoff')),
  set_no int not null,
  weight_kg numeric(6, 2) not null,     -- 自重は加重分（補助はマイナス）
  reps int not null check (reps >= 0),
  cheat_reps int not null default 0 check (cheat_reps >= 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

-- 共通: トリガー / インデックス / RLS / 権限
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'exercises', 'routines', 'routine_items',
    'sessions', 'session_exercises', 'work_sets'
  ] loop
    execute format(
      'create trigger %1$s_touch before insert or update on public.%1$I
         for each row execute function public.touch_updated_at()', t);
    execute format('create index %1$s_sync_idx on public.%1$I (user_id, updated_at)', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %1$s_own on public.%1$I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end;
$$;

create index session_exercises_session_idx on public.session_exercises (session_id);
create index session_exercises_exercise_idx on public.session_exercises (exercise_id);
create index work_sets_se_idx on public.work_sets (session_exercise_id);
create index routine_items_routine_idx on public.routine_items (routine_id);
