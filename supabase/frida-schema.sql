-- ============================================================
-- Training Helper — Frida (Danish food database) Schema
-- Run this in your Supabase SQL editor, then seed via
--   POST /api/nutrition/frida-import   (header x-seed-secret: 1811)
-- ============================================================

-- Whole-food data from DTU's Frida (FCDB v6.1). `id` = Frida FoodID.
-- `per100g` is a snapshot mapped onto the nutrient registry (src/lib/nutrients.ts).
-- `search_text` = lowercased English + Danish name for ILIKE search.
create table if not exists frida_foods (
  id text primary key,
  name text not null,        -- English name
  name_da text,              -- Danish name
  per100g jsonb not null default '{}',
  search_text text,
  created_at timestamptz default now()
);
create index if not exists idx_frida_search on frida_foods (search_text text_pattern_ops);

alter table frida_foods disable row level security;
