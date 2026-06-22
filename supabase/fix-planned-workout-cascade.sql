-- Fix: changing training days stacked programs instead of replacing them.
--
-- Root cause: workout_sessions.planned_workout_id referenced planned_workouts(id)
-- with no ON DELETE rule. After any session was logged, "DELETE FROM
-- planned_workouts" failed with a foreign-key violation (silently swallowed in
-- the API), so a fresh program was inserted on top of the old one.
--
-- Fix: ON DELETE SET NULL — deleting a plan is allowed, and logged session
-- history is preserved (the session just loses its plan link).

alter table workout_sessions
  drop constraint if exists workout_sessions_planned_workout_id_fkey;

alter table workout_sessions
  add constraint workout_sessions_planned_workout_id_fkey
  foreign key (planned_workout_id)
  references planned_workouts(id)
  on delete set null;
