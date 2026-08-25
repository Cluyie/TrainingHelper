-- ============================================================
-- Training Helper — running_sessions gets a block dimension
-- Run this in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- WHY
-- program_week means week-in-block (1..6) and nothing else, so a completed run from
-- block 0 week 1 is indistinguishable from block 1 week 1. Two things broke on that:
--
--   1. The regeneration guard in api/running counts any placed row for the current
--      week number, completed ones included, and returns early if it finds one. Once
--      a week number had been logged it was frozen: six weeks later the same week
--      number came round, the guard saw last block's completed rows, and no new runs
--      were ever generated for it again.
--   2. The ⅔-completion gate that advances running_phase had to reconstruct "the
--      block that just ended" from a DATE WINDOW over running_sessions.date. That
--      column holds the date a run was LOGGED, so a run logged a day late counted
--      towards the wrong block.
--
-- Both become straightforward once a row knows which block it belongs to.
--
-- BACKFILL
-- The default of 0 is correct for every existing row: no user has passed block 0 yet
-- (blockIndex is derived from strength_block_start, and the anchors in this database
-- are all inside their first six weeks). Existing rows therefore stay exactly where
-- they are — block 0, at whatever program_week they already carry.
-- ============================================================

alter table running_sessions
  add column if not exists block_index integer not null default 0;

-- The regeneration guard, the delete-and-replace in persist-week.ts and the
-- previous-block completion count all filter on exactly these three columns.
create index if not exists idx_running_sessions_user_block
  on running_sessions(user_id, block_index, program_week);
