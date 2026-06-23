-- ============================================================
-- Training Helper — Custom Foods Schema
-- Run this in your Supabase SQL editor (after nutrition-schema.sql + recipes-schema.sql)
-- ============================================================

-- A custom food is a user-owned packaged product entered straight from its
-- nutrition label. `per100g` holds the per-100g snapshot keyed by nutrient
-- registry keys (calories, protein_g, …) — the single source used when logging,
-- scaled to the eaten grams exactly like a USDA/Frida food. Editing a custom
-- food updates this; already-logged entries keep their own snapshot.
create table if not exists custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  brand text,
  per100g jsonb not null default '{}',
  serving_size_g decimal,        -- optional default serving (grams)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_custom_foods_user on custom_foods(user_id);

-- ============================================================
-- food_log_entries: add a custom-food reference so the 'custom' source flows
-- through the existing snapshot pipeline (mirrors recipe_id).
-- ============================================================
alter table food_log_entries add column if not exists custom_food_id text;

-- ============================================================
-- Disable RLS (single-user personal app, auth via PIN + JWT; scoped in app code)
-- ============================================================
alter table custom_foods disable row level security;
