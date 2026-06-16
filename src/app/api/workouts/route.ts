import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("planned_workouts")
    .select(`
      *,
      planned_exercises (
        *,
        exercise:exercises (*)
      )
    `)
    .order("order_in_week");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort exercises within each workout
  const sorted = (data ?? []).map((w) => ({
    ...w,
    planned_exercises: [...(w.planned_exercises ?? [])].sort(
      (a, b) => a.order_index - b.order_index
    ),
  }));

  return NextResponse.json(sorted);
}

