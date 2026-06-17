-- ============================================================
-- Training Helper — Bodyweight tracking + profile for adaptive targets
-- Run AFTER multiuser-schema.sql in the Supabase SQL editor.
-- ============================================================

-- Daily weigh-ins (one row per user per day; re-weighing the same day overwrites).
create table if not exists body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  date date not null default current_date,
  weight_kg numeric not null,
  created_at timestamptz default now(),
  unique (user_id, date)
);
create index if not exists idx_body_weights_user_date on body_weights(user_id, date);
alter table body_weights disable row level security;

-- Profile fields that feed the adaptive calorie/protein engine (all optional —
-- targets fall back to static defaults until these + a weigh-in exist).
alter table user_settings add column if not exists sex text;             -- 'male' | 'female'
alter table user_settings add column if not exists birth_year int;
alter table user_settings add column if not exists height_cm numeric;
alter table user_settings add column if not exists activity_level text;   -- 'sedentary'|'light'|'moderate'|'very'
alter table user_settings add column if not exists goal text default 'maintain'; -- 'cut'|'maintain'|'lean_gain'
