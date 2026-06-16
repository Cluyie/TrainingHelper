-- ============================================================
-- Training Helper — Nutrition Schema
-- Run this in your Supabase SQL editor (after schema.sql)
-- ============================================================

-- Logged foods. One row per food eaten.
-- `nutrients` is a JSONB snapshot already scaled to `quantity_g`, so daily
-- totals are a simple sum and history never shifts if USDA data changes.
-- A missing/unknown nutrient is stored as null ("no data").
create table if not exists food_log_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  fdc_id text,
  food_name text not null,
  brand text,
  quantity_g decimal not null,
  nutrients jsonb not null default '{}',
  data_type text,              -- USDA dataType; provenance for the refined-carb heuristic
  created_at timestamptz default now()
);
create index if not exists idx_food_log_date on food_log_entries(date);

-- Per-nutrient target overrides. Defaults live in the nutrient registry
-- (src/lib/nutrients.ts); a row only exists once the user edits a target.
-- `enabled` powers the net-carb hard-limit toggle (default on, 50g).
create table if not exists nutrient_targets (
  nutrient_key text primary key,
  target_amount decimal not null,
  direction text not null default 'floor',  -- 'floor' (hit at least) | 'limit' (stay under)
  enabled boolean not null default true
);

-- Daily supplements. Added to totals, but always displayed separately from food.
create table if not exists supplements (
  id uuid primary key default gen_random_uuid(),
  nutrient_key text not null,
  name text,
  dose_amount decimal not null,
  created_at timestamptz default now()
);

-- Read-through cache of USDA food detail responses (speeds re-logging frequent foods).
create table if not exists food_cache (
  fdc_id text primary key,
  data jsonb not null,
  cached_at timestamptz default now()
);

-- ============================================================
-- Disable RLS (single-user personal app, auth via PIN + JWT)
-- ============================================================
alter table food_log_entries disable row level security;
alter table nutrient_targets disable row level security;
alter table supplements disable row level security;
alter table food_cache disable row level security;
