import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workoutId = searchParams.get("workout_id");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  let query = getSupabaseAdmin()
    .from("workout_sessions")
    .select(`*, planned_workout:planned_workouts(label, day_of_week)`)
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
  const body = await request.json();
  const { data, error } = await getSupabaseAdmin()
    .from("workout_sessions")
    .insert({
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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

