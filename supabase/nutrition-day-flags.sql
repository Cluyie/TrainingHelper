-- ============================================================
-- Training Helper — "didn't track properly" day mark
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- A day eaten out and only partly logged would otherwise look like a low-calorie
-- day. The 28-day maintenance estimate would then conclude maintenance is lower than
-- it is and pull future calorie targets down for no reason.
--
-- One row per marked day:
--   estimated_kcal set  → that day's intake counts as the estimate
--   estimated_kcal null → the day is left out of the intake used for the estimate
-- In both cases the day is left out of the weekly nutrient averages. Weigh-ins are
-- unaffected: the scale is still right on those days.
-- ============================================================

create table if not exists nutrition_day_flags (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  estimated_kcal integer check (estimated_kcal is null or estimated_kcal between 0 and 20000),
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Matches the other owned tables: access is scoped in the app by user_id
-- (service role), RLS off.
alter table nutrition_day_flags disable row level security;
