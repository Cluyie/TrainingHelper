import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workoutId = searchParams.get("workout_id");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  let query = getSupabaseAdmin()
    .from("workout_sessions")
    .select(`*, planned_workout:planned_workouts(label, day_of_week)`)
    .eq("user_id", auth.userId)
    .order("date", { ascending: false })
    .limit(limit);

  if (workoutId) {
    query = query.eq("planned_workout_id", workoutId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const { data, error } = await getSupabaseAdmin()
    .from("workout_sessions")
    .insert({
      user_id: auth.userId,
      planned_workout_id: body.planned_workout_id,
      date: body.date ?? new Date().toISOString().split("T")[0],
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (updates.complete) {
    updates.completed_at = new Date().toISOString();
    delete updates.complete;
  }

  const { data, error } = await getSupabaseAdmin()
    .from("workout_sessions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

