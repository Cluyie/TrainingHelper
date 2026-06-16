-- ============================================================
-- Training Helper — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- User settings (single row, inserted during onboarding)
create table if not exists user_settings (
  id uuid primary key default gen_random_uuid(),
  training_days_per_week integer not null default 3,
  session_duration_min integer not null default 60,
  equipment text[] not null default '{"gym"}',
  current_phase integer not null default 1,
  program_start_date date,
  training_days text[] not null default '{}',
  stretching_days_per_week integer not null default 3,
  stretching_duration_min integer not null default 25,
  split_type text,
  onboarding_complete boolean not null default false,
  created_at timestamptz default now()
);

-- Exercise library (seeded via /api/seed)
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  equipment text[] not null default '{}',
  phase_unlock integer not null default 1,
  shoulder_safe boolean not null default true,
  lower_back_safe boolean not null default true,
  animation_url text,
  description text not null default '',
  muscle_groups text[] not null default '{}'
);

-- Planned workout templates (regenerated when settings change)
create table if not exists planned_workouts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  day_of_week text not null,
  order_in_week integer not null,
  created_at timestamptz default now()
);

-- Exercises within each planned workout
create table if not exists planned_exercises (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references planned_workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  order_index integer not null,
  target_sets integer not null default 3,
  target_reps_min integer not null default 8,
  target_reps_max integer not null default 12,
  progression_increment_kg decimal not null default 2.5
);

-- Logged workout sessions
create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid references planned_workouts(id),
  date date not null default current_date,
  started_at timestamptz default now(),
  completed_at timestamptz,
  notes text
);

-- Sets logged within a workout session
create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_number integer not null,
  weight_kg decimal not null,
  reps integer not null,
  rpe integer,
  completed_at timestamptz default now()
);

-- Stretching exercise library (seeded)
create table if not exists stretching_exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  duration_sec integer not null default 45,
  animation_url text,
  description text not null default ''
);

-- 6 yoga/stretching routine templates
create table if not exists stretching_routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  focus text not null,
  routine_number integer not null unique
);

-- Exercises within each routine (ordered)
create table if not exists stretching_routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references stretching_routines(id) on delete cascade,
  exercise_id uuid not null references stretching_exercises(id),
  order_index integer not null
);

-- Logged stretching sessions
create table if not exists stretching_sessions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid references stretching_routines(id),
  date date not null default current_date,
  completed boolean not null default false
);

-- Running sessions (16-week plan, seeded; user logs actuals)
create table if not exists running_sessions (
  id uuid primary key default gen_random_uuid(),
  program_week integer not null,
  session_in_week integer not null default 1,
  date date,
  type text not null default 'easy',
  target_duration_min integer not null,
  target_description text not null,
  actual_duration_min integer,
  actual_distance_km decimal,
  completed boolean not null default false,
  optional boolean not null default false,
  notes text
);

-- ============================================================
-- Disable RLS (single-user personal app, auth via PIN + JWT)
-- ============================================================
alter table user_settings disable row level security;
alter table exercises disable row level security;
alter table planned_workouts disable row level security;
alter table planned_exercises disable row level security;
alter table workout_sessions disable row level security;
alter table workout_sets disable row level security;
alter table stretching_exercises disable row level security;
alter table stretching_routines disable row level security;
alter table stretching_routine_exercises disable row level security;
alter table stretching_sessions disable row level security;
alter table running_sessions disable row level security;
