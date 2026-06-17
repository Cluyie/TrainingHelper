-- ============================================================
-- Training Helper — Multi-user ownership
-- Run AFTER schema.sql + nutrition-schema.sql + recipes-schema.sql + frida-schema.sql.
-- Safe to re-run (idempotent).
-- ============================================================

-- Users. Each person logs in with their own unique PIN; the PIN identifies them.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null unique,
  created_at timestamptz default now()
);
alter table users disable row level security;

-- Seed the current owner with a FIXED id so the backfill below is deterministic.
insert into users (id, name, pin)
values ('00000000-0000-0000-0000-000000000001', 'Steffen', '1811')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Add user_id to every user-owned table (shared catalogs are left global:
-- exercises, stretching_exercises, stretching_routines,
-- stretching_routine_exercises, food_cache, frida_foods).
-- ------------------------------------------------------------
alter table user_settings        add column if not exists user_id uuid references users(id);
alter table planned_workouts      add column if not exists user_id uuid references users(id);
alter table planned_exercises     add column if not exists user_id uuid references users(id);
alter table workout_sessions      add column if not exists user_id uuid references users(id);
alter table workout_sets          add column if not exists user_id uuid references users(id);
alter table running_sessions      add column if not exists user_id uuid references users(id);
alter table stretching_sessions   add column if not exists user_id uuid references users(id);
alter table food_log_entries      add column if not exists user_id uuid references users(id);
alter table supplements           add column if not exists user_id uuid references users(id);
alter table recipes               add column if not exists user_id uuid references users(id);
alter table recipe_ingredients    add column if not exists user_id uuid references users(id);
alter table nutrient_targets      add column if not exists user_id uuid references users(id);

-- ------------------------------------------------------------
-- Backfill all existing rows to the seeded owner.
-- ------------------------------------------------------------
update user_settings      set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update planned_workouts   set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update planned_exercises  set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update workout_sessions   set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update workout_sets       set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update running_sessions   set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update stretching_sessions set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update food_log_entries   set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update supplements        set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update recipes            set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update recipe_ingredients set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;
update nutrient_targets   set user_id = '00000000-0000-0000-0000-000000000001' where user_id is null;

-- ------------------------------------------------------------
-- nutrient_targets: was keyed by nutrient_key alone → make it per-user.
-- ------------------------------------------------------------
alter table nutrient_targets drop constraint if exists nutrient_targets_pkey;
alter table nutrient_targets alter column user_id set not null;
alter table nutrient_targets add primary key (user_id, nutrient_key);

-- ------------------------------------------------------------
-- Indexes for the high-traffic scoped reads.
-- ------------------------------------------------------------
create index if not exists idx_user_settings_user      on user_settings(user_id);
create index if not exists idx_planned_workouts_user    on planned_workouts(user_id);
create index if not exists idx_workout_sessions_user    on workout_sessions(user_id);
create index if not exists idx_workout_sets_user        on workout_sets(user_id);
create index if not exists idx_running_sessions_user    on running_sessions(user_id);
create index if not exists idx_stretching_sessions_user on stretching_sessions(user_id);
create index if not exists idx_food_log_entries_user    on food_log_entries(user_id);
create index if not exists idx_supplements_user         on supplements(user_id);
create index if not exists idx_recipes_user             on recipes(user_id);
