-- ============================================================
-- Training Helper — Reset ONE user's data (start from scratch)
-- Run in the Supabase SQL editor.
--
-- Wipes all of a user's personal data (settings, program, workouts, runs,
-- stretching, nutrition, recipes) so the app starts fresh (onboarding again,
-- running program re-seeds lazily on next visit).
--
-- KEEPS: the user's login account (users row) and all shared catalogs
--   (exercises, stretching_exercises/routines, food_cache, frida_foods).
--
-- Set `uid` below to the user to reset. Default = the seeded owner (Steffen).
-- Find ids with:  select id, name, pin from users;
-- ============================================================
do $$
declare
  uid uuid := '00000000-0000-0000-0000-000000000001';  -- <-- change to reset a different user
begin
  -- children first (also covered by ON DELETE CASCADE, but explicit is safe)
  delete from workout_sets        where user_id = uid;
  delete from workout_sessions    where user_id = uid;
  delete from planned_exercises   where user_id = uid;
  delete from planned_workouts    where user_id = uid;
  delete from recipe_ingredients  where user_id = uid;
  delete from recipes             where user_id = uid;
  delete from custom_foods        where user_id = uid;

  delete from stretching_sessions where user_id = uid;
  delete from running_sessions    where user_id = uid;  -- re-seeds on next /api/running visit
  delete from food_log_entries    where user_id = uid;
  delete from supplements         where user_id = uid;
  delete from nutrient_targets    where user_id = uid;  -- resets targets to registry defaults
  delete from user_settings       where user_id = uid;  -- triggers onboarding again

  raise notice 'Reset complete for user %', uid;
end $$;

-- ------------------------------------------------------------
-- OPTIONAL extras (uncomment as needed):
--
-- Keep your recipes through the reset? Comment out the two recipe DELETEs above.
--
-- Delete a throwaway TEST user entirely (account + their data). Replace the id;
-- their owned rows go first, then the account:
--   do $$
--   declare uid uuid := '<TEST-USER-ID>';
--   begin
--     delete from workout_sets where user_id = uid;
--     delete from workout_sessions where user_id = uid;
--     delete from planned_exercises where user_id = uid;
--     delete from planned_workouts where user_id = uid;
--     delete from recipe_ingredients where user_id = uid;
--     delete from recipes where user_id = uid;
--     delete from stretching_sessions where user_id = uid;
--     delete from running_sessions where user_id = uid;
--     delete from food_log_entries where user_id = uid;
--     delete from supplements where user_id = uid;
--     delete from nutrient_targets where user_id = uid;
--     delete from user_settings where user_id = uid;
--     delete from users where id = uid;
--   end $$;
-- ============================================================
