import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const exerciseId = searchParams.get("exercise_id");

  if (type === "exercise" && exerciseId) {
    // All sets for a specific exercise with session date
    const { data, error } = await getSupabaseAdmin()
      .from("workout_sets")
      .select(`
        *,
        session:workout_sessions (date)
      `)
      .eq("exercise_id", exerciseId)
      .order("completed_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (type === "running") {
    const { data, error } = await getSupabaseAdmin()
      .from("running_sessions")
      .select("*")
      .eq("completed", true)
      .order("date", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (type === "consistency") {
    // Last 8 weeks of workout sessions
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const { data, error } = await getSupabaseAdmin()
      .from("workout_sessions")
      .select("date, completed_at")
      .gte("date", eightWeeksAgo.toISOString().split("T")[0])
      .not("completed_at", "is", null)
      .order("date");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (type === "exercises_list") {
    // Exercises that have at least one logged set
    const { data, error } = await getSupabaseAdmin()
      .from("workout_sets")
      .select("exercise_id, exercise:exercises(id, name, category)")
      .order("completed_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Deduplicate
    const seen = new Set<string>();
    const unique = (data ?? []).filter((row) => {
      if (!row.exercise_id || seen.has(row.exercise_id)) return false;
      seen.add(row.exercise_id);
      return true;
    });

    return NextResponse.json(unique.map((r) => r.exercise));
  }

  return NextResponse.json([]);
}

