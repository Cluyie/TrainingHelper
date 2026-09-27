-- ============================================================
-- Training Helper — fixed Mon-Fri strength program (v2)
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Adds ONE column. Everything else in the new program reuses existing fields:
--   exercise / sets / reps / weight / increment → planned_exercises + workout_sets
--   RIR                                         → workout_sets.rpe  (stored as 10 − RIR)
--   week / deload                               → derived from user_settings.strength_block_start
--   phase                                       → user_settings.current_phase
--
-- workout_sets.form_breakdown — "technique (or, for power, speed/height) broke down"
-- on that set. When set, the next session repeats the load instead of increasing it,
-- because progression achieved with worse technique isn't progression.
-- Existing rows default to false. Until this runs, logging still works — only
-- ticking the "form broke down" box will return an error.
-- ============================================================

alter table workout_sets
  add column if not exists form_breakdown boolean not null default false;

-- ------------------------------------------------------------
-- After running this:
--   1. POST /api/seed  (header x-seed-secret: <AUTH_PIN>)  — adds the new exercises
--      (Smith squat/bench/incline/hip thrust/calf/Bulgarian, cable lateral raise,
--      cable leg curl, trap bar farmer carry, countermovement jump, medicine ball
--      chest pass) and updates equipment/descriptions of reused ones. Upserts by
--      name, so ids — and therefore all logged history — are kept.
--   2. Settings → "Save & Generate Program" — writes the new Mon-Fri week.
--
-- Nothing is deleted. Old planned-but-never-run running_sessions rows stay in the
-- table and are simply no longer shown; completed runs remain as history.
-- ------------------------------------------------------------
