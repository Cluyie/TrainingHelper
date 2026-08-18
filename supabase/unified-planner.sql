-- ============================================================
-- Training Helper — Unified Training-Load Planner
-- Run this in the Supabase SQL editor.
--
-- Two jobs:
--   1. Repair three columns that the application code reads and writes but that no
--      SQL file in this directory ever created. They exist in the live database — the
--      app works — which means they were added by hand in the dashboard and never
--      written back. Anyone rebuilding from this repo got a broken app.
--   2. Add the columns the unified planner needs.
--
-- Everything is `if not exists`, so this is idempotent and safe to re-run against a
-- live database.
-- ============================================================

-- ── 1. The undocumented columns ─────────────────────────────
-- exercises.home_compatible     — used by program-generator.ts, seed-data.ts, types
-- planned_workouts.is_home_workout — used by api/settings, strength pages
-- user_settings.home_days       — used by api/settings, settings page

alter table exercises
  add column if not exists home_compatible boolean not null default false;

alter table planned_workouts
  add column if not exists is_home_workout boolean not null default false;

alter table user_settings
  add column if not exists home_days text[] not null default '{}';

-- ── 2. Split phases ─────────────────────────────────────────
-- current_phase already exists and stays the manual, shoulder-gated STRENGTH tier.
-- running_phase is separate and advances automatically at block end: your shoulders
-- have no bearing on whether your legs and lungs are ready for intervals, so a single
-- dial was forcing a false trade-off.

alter table user_settings
  add column if not exists running_phase integer not null default 1;

-- Which block the running-phase bump was last evaluated for, as "<anchor>#<index>",
-- so the ⅔-completion gate fires exactly once per block rather than re-evaluating on
-- every read. Text rather than a date because it carries the derived block index too.
alter table user_settings
  add column if not exists running_phase_block text;

-- ── 3. Planner inputs ───────────────────────────────────────
-- The planner owns all weekday placement now, so training_days / home_days /
-- training_days_per_week / split_type are no longer read. They are deliberately NOT
-- dropped: unrelated code paths still reference them and removing columns buys
-- nothing. The one input that remains is when the gym is unreachable.

alter table user_settings
  add column if not exists no_gym_days text[] not null default '{saturday,sunday}';

-- ── 4. Runs get a weekday ───────────────────────────────────
-- Previously runs had no weekday at all, so nothing could stop a VO2 session landing
-- next to the heavy squat day — run-schedule.ts could only print advice about it.

alter table running_sessions
  add column if not exists day_of_week text;

-- ── 5. Reconcile existing running rows ──────────────────────
-- The 16-week calendar program is retired; running content is now derived from
-- running_phase × week-in-block, sharing the 6-week clock with strength so the two
-- finally deload in the same week. program_week is repurposed to hold 1..6.
--
-- Completed sessions are KEPT as history. Only unrun future rows are cleared, since
-- they describe a program that no longer exists.

delete from running_sessions
where completed = false;

-- Logged strength history is already safe: workout_sessions.planned_workout_id is
-- ON DELETE SET NULL, so regenerating the plan unlinks sessions without deleting them.

-- ── 6. Backfill ─────────────────────────────────────────────
-- Give existing users a block anchor if they have none, so the derived block index
-- (and with it the Phase 3 A/B/C running rotation) starts from a real date.
update user_settings
set strength_block_start = current_date
where strength_block_start is null;

-- Leave running_phase_block NULL: the first read after this migration then records
-- the current block without awarding a bump for a block that predates the feature.
