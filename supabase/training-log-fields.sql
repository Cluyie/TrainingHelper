-- ============================================================
-- Training Helper — richer training log, for later analysis
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- Design rule: store RAW measurements only, never derived ones.
--
-- Heart-rate recovery is the clearest example. It would be tempting to store
-- "hr_drop_2min", but then the definition is baked in forever. Storing hr_end,
-- hr_60s and hr_120s instead lets you compute HRR at 1 min AND at 2 min, and
-- change your mind about which matters, years later, from the same rows.
-- The same reasoning is why pace isn't stored: duration and distance already
-- contain it.
--
-- Everything here is nullable on purpose. A missing value is honest; a guessed
-- one silently corrupts the analysis it was added to support.
-- ============================================================

alter table running_sessions
  -- Perceived exertion, 1-10, given just after finishing. Needs no device, and
  -- multiplied by duration it gives a session load that is directly comparable
  -- with strength work.
  add column if not exists rpe integer,

  -- Straight off the watch. Average HR is the field that reveals "zone 2 drift" —
  -- easy runs quietly creeping into zone 3, which is the usual way this style of
  -- programme stops working.
  add column if not exists avg_hr integer,
  add column if not exists max_hr integer,

  -- Heart-rate recovery: HR on finishing, then after standing still for 60s and
  -- 120s. HRR1 = hr_end - hr_60s, HRR2 = hr_end - hr_120s — both derived at read
  -- time. Only meaningful after a hard effort; after an easy run HR is already
  -- low and the drop says little.
  add column if not exists hr_end integer,
  add column if not exists hr_60s integer,
  add column if not exists hr_120s integer,

  -- Conditions. Heat raises HR substantially at a given pace, so without this a
  -- genuine fitness gain and a change of season look identical when you compare
  -- August with February.
  add column if not exists temperature_c numeric,

  -- road | forest | beach | grass | gravel | track | treadmill
  -- Sand and treadmill matter most: both break the usual pace-to-effort
  -- relationship and would otherwise read as fitness changes.
  add column if not exists surface text;

-- workout_sets.rpe already exists (see schema.sql) and has never been written to.
-- No migration needed there — only a control in the UI.
