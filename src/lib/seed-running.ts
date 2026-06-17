// ============================================================
// Per-user running program seeding (server-only).
//
// The 16-week running program (RUNNING_PROGRAM) is fixed content but the
// session rows are per-user (each person logs their own actuals). Seeded
// lazily the first time a user opens the running page.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabase";
import { RUNNING_PROGRAM } from "@/lib/running-program";

/** Insert the 16-week program for a user if they have none yet. */
export async function seedRunningForUser(userId: string): Promise<void> {
  const rows = RUNNING_PROGRAM.flatMap((week) =>
    week.sessions.map((s) => ({
      user_id: userId,
      program_week: week.week,
      session_in_week: s.session_in_week,
      type: s.type,
      target_duration_min: s.target_duration_min,
      target_description: s.target_description,
      optional: s.optional ?? false,
      completed: false,
    }))
  );
  await getSupabaseAdmin().from("running_sessions").insert(rows);
}
