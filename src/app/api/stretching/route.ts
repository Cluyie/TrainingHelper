import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const routines = searchParams.get("routines");
  const sessions = searchParams.get("sessions");

  if (routines) {
    const { data, error } = await getSupabaseAdmin()
      .from("stretching_routines")
      .select(`
        *,
        stretching_routine_exercises (
          *,
          stretching_exercise:stretching_exercises (*)
        )
      `)
      .order("routine_number");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const sorted = (data ?? []).map((r) => ({
      ...r,
      stretching_routine_exercises: [...(r.stretching_routine_exercises ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      ),
    }));

    return NextResponse.json(sorted);
  }

  if (sessions) {
    const { data, error } = await getSupabaseAdmin()
      .from("stretching_sessions")
      .select("*, stretching_routine:stretching_routines(name, focus)")
      .order("date", { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  return NextResponse.json([]);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { data, error } = await getSupabaseAdmin()
    .from("stretching_sessions")
    .insert({
      routine_id: body.routine_id,
      date: body.date ?? new Date().toISOString().split("T")[0],
      completed: body.completed ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  const { data, error } = await getSupabaseAdmin()
    .from("stretching_sessions")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

