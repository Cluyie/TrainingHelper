import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";
import { EXERCISES, STRETCHING_EXERCISES, STRETCHING_ROUTINES } from "@/lib/seed-data";
import { RUNNING_PROGRAM } from "@/lib/running-program";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-seed-secret");
  if (secret !== process.env.AUTH_PIN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // â”€â”€ 1. Seed exercises â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { error: exErr } = await getSupabaseAdmin()
      .from("exercises")
      .upsert(EXERCISES.map((e) => ({ ...e, animation_url: null })), { onConflict: "name" });
    if (exErr) throw new Error(`exercises: ${exErr.message}`);

    // â”€â”€ 2. Seed stretching exercises â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { error: sxErr } = await getSupabaseAdmin()
      .from("stretching_exercises")
      .upsert(STRETCHING_EXERCISES.map((e) => ({ ...e, animation_url: null })), { onConflict: "name" });
    if (sxErr) throw new Error(`stretching_exercises: ${sxErr.message}`);

    // â”€â”€ 3. Seed stretching routines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const { data: sxRows } = await getSupabaseAdmin().from("stretching_exercises").select("id, name");
    const sxMap = new Map(sxRows?.map((r) => [r.name, r.id]) ?? []);

    for (const routine of STRETCHING_ROUTINES) {
      const { data: routineRow, error: rErr } = await getSupabaseAdmin()
        .from("stretching_routines")
        .upsert(
          { name: routine.name, focus: routine.focus, routine_number: routine.routine_number },
          { onConflict: "routine_number" }
        )
        .select()
        .single();
      if (rErr) throw new Error(`routine ${routine.name}: ${rErr.message}`);

      // Delete existing exercises for this routine and re-insert
      await getSupabaseAdmin()
        .from("stretching_routine_exercises")
        .delete()
        .eq("routine_id", routineRow.id);

      const routineExercises = routine.exercises
        .map((exName, idx) => {
          const exId = sxMap.get(exName);
          if (!exId) return null;
          return { routine_id: routineRow.id, exercise_id: exId, order_index: idx };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (routineExercises.length > 0) {
        const { error: reErr } = await getSupabaseAdmin()
          .from("stretching_routine_exercises")
          .insert(routineExercises);
        if (reErr) throw new Error(`routine_exercises for ${routine.name}: ${reErr.message}`);
      }
    }

    // â”€â”€ 4. Seed running program â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Only seed if not already seeded
    const { count } = await getSupabaseAdmin()
      .from("running_sessions")
      .select("*", { count: "exact", head: true });

    if (!count || count === 0) {
      const runningSessions = RUNNING_PROGRAM.flatMap((week) =>
        week.sessions.map((s) => ({
          program_week: week.week,
          session_in_week: s.session_in_week,
          type: s.type,
          target_duration_min: s.target_duration_min,
          target_description: s.target_description,
          optional: s.optional ?? false,
          completed: false,
        }))
      );

      const { error: runErr } = await getSupabaseAdmin()
        .from("running_sessions")
        .insert(runningSessions);
      if (runErr) throw new Error(`running_sessions: ${runErr.message}`);
    }

    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      counts: {
        exercises: EXERCISES.length,
        stretching_exercises: STRETCHING_EXERCISES.length,
        stretching_routines: STRETCHING_ROUTINES.length,
        running_weeks: RUNNING_PROGRAM.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

