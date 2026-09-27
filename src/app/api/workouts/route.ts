import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState } from "@/lib/deload";
import { VERTICAL_PULL_LADDER, scheduledExercise, slotFor } from "@/lib/program-generator";
import type { DayOfWeek, Exercise, PlannedExercise } from "@/types";
export const dynamic = "force-dynamic";

// The stored program is the fixed week. Two things about it are decided at READ time
// rather than stored, so nothing has to be rewritten week to week (which would unlink
// logged sessions from their template):
//
//   • the medicine-ball rotation — picked from the block week,
//   • the vertical-pull ladder — the rung you logged most recently.
//
// Both replace exercise/exercise_id on the returned row, so sets are logged against
// the exercise actually performed and progression reads the right history.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("planned_workouts")
    .select(`
      *,
      planned_exercises (
        *,
        exercise:exercises (*)
      )
    `)
    .eq("user_id", auth.userId)
    .order("order_in_week");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Block week. A failed read must not silently become "week 1" — that would show the
  // wrong rotation and the wrong RIR — so it fails the request.
  const { data: settings, error: setErr } = await db
    .from("user_settings")
    .select("strength_block_start")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (setErr) return NextResponse.json({ error: `failed to read the block: ${setErr.message}` }, { status: 500 });
  const block = computeBlockState(settings?.strength_block_start ?? null);

  // Catalogue rows for every exercise a rotation or ladder can switch to.
  const { data: catalogue, error: catErr } = await db.from("exercises").select("*");
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
  const byName = new Map((catalogue as Exercise[]).map((e) => [e.name, e]));

  // Most recently logged ladder rung.
  const ladderIds = VERTICAL_PULL_LADDER.map((r) => byName.get(r.exercise)?.id).filter(
    (id): id is string => !!id
  );
  let lastRung: string | null = null;
  if (ladderIds.length > 0) {
    const { data: latest, error: lErr } = await db
      .from("workout_sets")
      .select("exercise_id, completed_at")
      .eq("user_id", auth.userId)
      .in("exercise_id", ladderIds)
      .order("completed_at", { ascending: false })
      .limit(1);
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
    const id = latest?.[0]?.exercise_id;
    lastRung = (catalogue as Exercise[]).find((e) => e.id === id)?.name ?? null;
  }

  const result = (data ?? []).map((w) => {
    const pes = [...(w.planned_exercises ?? [])].sort(
      (a: PlannedExercise, b: PlannedExercise) => a.order_index - b.order_index
    );

    return {
      ...w,
      planned_exercises: pes.map((pe: PlannedExercise) => {
        const slot = slotFor(w.day_of_week as DayOfWeek, pe.order_index, pe.exercise?.name);
        if (!slot) return { ...pe, slot: null };

        const choice = scheduledExercise(slot, block.weekInBlock, lastRung);
        const scheduled = byName.get(choice.exercise);
        const override = !!scheduled && scheduled.id !== pe.exercise_id;

        return {
          ...pe,
          exercise_id: scheduled?.id ?? pe.exercise_id,
          exercise: scheduled ?? pe.exercise,
          progression_increment_kg: choice.incrementKg,
          slot: {
            role: slot.role,
            unit: slot.unit,
            per_side: choice.perSide,
            purpose: slot.purpose,
            next_rung: choice.nextRung,
            scheduled_override: override,
          },
        };
      }),
    };
  });

  return NextResponse.json(result);
}
