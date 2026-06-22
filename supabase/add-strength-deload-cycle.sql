-- Strength deload cycle: anchors a repeating 6-week block. Week 6 is a deload;
-- the user can also trigger a deload early (resets the block). All state is derived
-- from this single date in code (src/lib/deload.ts) — no scheduled job needed.

alter table user_settings
  add column if not exists strength_block_start date;
