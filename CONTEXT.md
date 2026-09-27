# TrainingHelper — Project Context

Personal training PWA for Steffen (34, longevity focus, shoulder issues, returning athlete).
Read this file at the start of every session before touching any code.

## Stack
- Next.js 16.2.9 — webpack mode (NOT Turbopack, conflicts with next-pwa)
- Supabase (PostgreSQL)
- Tailwind CSS v4
- @ducanh2912/next-pwa
- jose (JWT auth)

## Critical Next.js 16 differences from what you know
- Middleware = `src/proxy.ts`, export named `proxy` (not default, not `middleware`)
- Every API route needs `export const dynamic = "force-dynamic"` at the top
- Use lazy `getSupabaseAdmin()` singleton — never init Supabase at module level

## Project structure
```
src/
  app/
    (app)/           — authenticated app routes
      page.tsx       — dashboard
      strength/      — strength training
        page.tsx
        workout/[id]/page.tsx   — active workout session
      stretching/
        page.tsx
        session/page.tsx        — active stretching session
      running/page.tsx
      analytics/page.tsx
      settings/page.tsx
    login/page.tsx
    api/
      settings/route.ts   — saves settings + regenerates program
      workouts/route.ts
      sessions/route.ts
      sets/route.ts
      seed/route.ts       — one-time DB seeding
      stretching/route.ts
      running/route.ts
      analytics/route.ts
      auth/verify/route.ts
      auth/logout/route.ts
  lib/
    supabase.ts             — lazy getSupabaseAdmin() singleton
    program-generator.ts    — gym/home split, A/B/C templates
    progression.ts          — progressive overload logic
    running-program.ts      — 16-week Zone 2 + VO2 max plan
    seed-data.ts            — ALL exercise data hardcoded here
  proxy.ts                  — route protection (JWT)
  types/index.ts
```

## Auth
- PIN: 1811
- Cookie: `training_auth` (JWT signed with AUTH_SECRET)
- 3 wrong attempts → 10 min lockout

## How the program works
A FIXED, deterministic Tue–Sat strength week defined in `src/lib/program-generator.ts`
(`PROGRAM`). No phases. Settings → "Save & Generate Program" writes it to planned_workouts.
- Mon hard run (no strength) · Tue Upper Strength + Rotational Power · Wed Lower Strength +
  Pull + Carry · Thu Upper Hypertrophy + Power (then Zone 2) · Fri Posterior Chain +
  Unilateral + Core · Sat Low-Fatigue Full Body (then Zone 2) · Sun full rest.
- Shoulders first: landmine press is the primary vertical press; cable external rotation
  Tue/Thu. Each day has a concrete warm-up checklist and a ramp-up note.
- Kit: Smith, dual cable, barbell, open trap bar, bench, pull-up station, landmine, one
  medicine ball. No dumbbells/kettlebells.
- 6-week blocks from `strength_block_start`: RIR ~3 → 1–2 over weeks 1–5, week 6 deload
  (sets ≈ halved, ~12.5% lighter, 4+ RIR).
- Decided at READ time in `GET /api/workouts` (never stored): the 3-week medicine-ball
  rotation (Tue/Thu) and the pull ladder (lat pulldown → pull-up → weighted pull-up,
  = the rung logged most recently).
- Progression (`progression.ts`) is double progression gated on quality: no increase if
  logged RIR < planned or `workout_sets.form_breakdown` is set. Power never adds load.
  RIR is stored in `workout_sets.rpe` as 10 − RIR.
- Running is a LOG only (`/running/log` POSTs completed runs). Nothing is planned.
- Migration: `supabase/strength-program-v2.sql`, then POST /api/seed, then regenerate.
- Food: `nutrition_day_flags` ("didn't track properly"; `supabase/nutrition-day-flags.sql`).
  Marked day with estimate → counts as the estimate in the 28-day TDEE; without → dropped.
  Always excluded from weekly nutrient averages. Weigh-ins unaffected.

All exercises hardcoded in `src/lib/seed-data.ts`. No external exercise API.
`/api/seed` just writes the hardcoded data to Supabase. Run once on setup.

## Database — extra columns (must be added manually in Supabase)
```sql
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS home_compatible boolean DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS home_days text[] DEFAULT '{}';
ALTER TABLE planned_workouts ADD COLUMN IF NOT EXISTS is_home_workout boolean DEFAULT false;
ALTER TABLE running_sessions ADD COLUMN IF NOT EXISTS optional boolean NOT NULL DEFAULT false;
```

## Setup from scratch
1. Supabase SQL editor: run `supabase/schema.sql` + the 3 ALTER statements above, then `supabase/nutrition-schema.sql`
2. `.env.local.example` → `.env.local` (fill SUPABASE_URL, SUPABASE_SECRET_KEY, AUTH_PIN, AUTH_SECRET, FDC_API_KEY)
3. `npm install && npm run dev`
4. `POST /api/seed` with header `x-seed-secret: 1811`
5. Visit app → PIN 1811 → Settings → pick days → Save & Generate Program

## Running program
16 weeks. Longevity-first, built to become a sustainable lifelong pattern.
- Weeks 1-3: run/walk → continuous (reaches continuous running by wk 3).
- Weeks 5+: standard Zone 2 settles ~40 min + one weekly long Zone 2 (45-75 min) +
  one OPTIONAL unstructured easy session (45-75 min, no targets, `optional: true`).
- VO2 max (`interval`) introduced wk 9, built to Norwegian 4×4, but WAVED not linear —
  intensity is pulled back every 3-4 weeks (reduced intervals or Zone-2-only weeks).
- Deload/easier weeks: 4, 8, 12 (and reduced-VO2 at 11, 15).
- Session types: `easy` | `long` | `interval` | `unstructured`. Optional sessions
  (`optional` column) never block week completion in the UI.

## Nutrition tracker
6th bottom-nav tab ("Food", `/nutrition`). Log exact food quantities in grams via the
**USDA FoodData Central** API (needs `FDC_API_KEY`). No recipes.

- **Snapshotting:** on log, all ~25 nutrients are computed per-100g, scaled to the gram
  quantity server-side, and stored as a JSONB snapshot on `food_log_entries.nutrients`.
  Daily totals = a simple sum; history never shifts if USDA data changes.
- **Registry:** `src/lib/nutrients.ts` is the single source of truth (label, unit, tier,
  group, USDA nutrient numbers, default target, floor/limit direction). Tier 1 = macros
  (calories, protein, fat, net carbs, fiber, refined carbs). Tier 2 = minerals, vitamins,
  functional (omega-3). No Tier 3.
- **Derived:** net carbs = carbs − fiber. Refined carbs = *measured* free/added sugars only
  (Frida "Free Sugars" param 418; USDA added sugars #539 or the Branded label's addedSugar;
  custom foods use the entered "of which sugars"). Never estimated — unmeasured is null
  ("no data"). A starch heuristic was removed 2026-07-04 for fabricating refined carbs in
  whole foods (oats, potatoes).
- **Net-carb hard limit:** toggle + value in `/nutrition/settings` (default 50g, on). Stored
  as a `nutrient_targets` row with `enabled`.
- **Supplements:** `/nutrition/settings`. Added to totals but always shown separately from
  food (NutrientBar renders a food + supplement split).
- **Data gaps:** Iodine, Vitamin K2, EPA/DHA are sparse in USDA → shown with a "no data"
  badge when null (no curated fallback table, by design).
- **Targets:** registry defaults merged with override rows by `/api/nutrition/targets`; a row
  is only written when a target is edited (empty table still yields sensible defaults).
- **Views:** Day (Tier 1 cards + collapsible Tier 2) and Week (7-day avg, days below/over,
  trend arrow, deficiencies highlighted). Aggregation in `src/lib/nutrition-client.ts`.
- Client helpers (`nutrients.ts`, `nutrition-client.ts`) are pure — safe to import in client
  components. `usda.ts` imports Supabase → server-only.
- **Caching:** `food_cache` table read-through caches USDA detail lookups.

## Known issues
- Program generator matches exercises by name string — brittle, should use stable IDs
- No commits yet — all changes are uncommitted local files
- Test data needs clearing before first real use (see below)

## Clearing test data (run in Supabase SQL editor)
```sql
DELETE FROM workout_sets;
DELETE FROM workout_sessions;
DELETE FROM stretching_sessions;
DELETE FROM planned_exercises;
DELETE FROM planned_workouts;
DELETE FROM running_sessions;
DELETE FROM user_settings;
```
Then reseed: `POST /api/seed` with `x-seed-secret: 1811`
