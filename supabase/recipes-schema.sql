-- ============================================================
-- Training Helper — Recipes Schema
-- Run this in your Supabase SQL editor (after nutrition-schema.sql)
-- ============================================================

-- A recipe is a named set of ingredients. `per100g` is a computed snapshot
-- (total nutrients ÷ total weight × 100) — the single source used when logging
-- a recipe, scaled to the eaten grams exactly like a USDA food. Editing a
-- recipe recomputes this; already-logged entries keep their own snapshot.
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_weight_g decimal not null default 0,  -- raw sum of ingredient grams
  per100g jsonb not null default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One row per ingredient. `nutrients` is a snapshot already scaled to
-- `quantity_g` (mirrors food_log_entries), so the recipe total is a simple sum.
create table if not exists recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  fdc_id text,
  food_name text not null,
  brand text,
  quantity_g decimal not null,
  nutrients jsonb not null default '{}',
  data_type text,
  order_index int not null default 0
);
create index if not exists idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);

-- ============================================================
-- food_log_entries: add provenance so non-USDA sources flow through the
-- existing snapshot pipeline. Existing rows are USDA by default.
-- ============================================================
alter table food_log_entries add column if not exists source text not null default 'usda';
alter table food_log_entries add column if not exists recipe_id text;

-- ============================================================
-- Disable RLS (single-user personal app, auth via PIN + JWT)
-- ============================================================
alter table recipes disable row level security;
alter table recipe_ingredients disable row level security;
