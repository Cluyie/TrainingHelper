import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const exerciseId = searchParams.get("exercise_id");
  const recentSessions = searchParams.get("recent_sessions"); // get last N sessions for an exercise

  if (recentSessions && exerciseId) {
    // Fetch recent sets for an exercise across multiple sessions (for progression)
    const { data, error } = await getSupabaseAdmin()
      .from("workout_sets")
      .select("*")
      .eq("user_id", auth.userId)
      .eq("exercise_id", exerciseId)
      .order("completed_at", { ascending: false })
      .limit(parseInt(recentSessions) * 5); // rough upper bound

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  if (!sessionId) return NextResponse.json([]);

  let query = getSupabaseAdmin()
    .from("workout_sets")
    .select("*")
    .eq("user_id", auth.userId)
    .eq("session_id", sessionId)
    .order("set_number");

  if (exerciseId) {
    query = query.eq("exercise_id", exerciseId);
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
    .from("workout_sets")
    .insert({
      user_id: auth.userId,
      session_id: body.session_id,
      exercise_id: body.exercise_id,
      set_number: body.set_number,
      weight_kg: body.weight_kg,
      reps: body.reps,
      rpe: body.rpe ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("workout_sets")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

