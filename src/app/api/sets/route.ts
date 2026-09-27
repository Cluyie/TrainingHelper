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
    // Fetch recent sets for an exercise across multiple sessions (for progression).
    //
    // `day` restricts history to sessions on that weekday. The same lift can sit on two
    // days with different rep ranges (calf raise 8-12 Monday, 12-20 Friday); judging
    // Friday against Monday's weight would suggest the wrong load. Filtered on the
    // session's local date, not completed_at, which is UTC.
    const day = searchParams.get("day");
    const n = parseInt(recentSessions);

    const { data, error } = await getSupabaseAdmin()
      .from("workout_sets")
      .select("*, session:workout_sessions!inner(date)")
      .eq("user_id", auth.userId)
      .eq("exercise_id", exerciseId)
      .order("completed_at", { ascending: false })
      .limit(day ? n * 5 * 5 : n * 5); // rough upper bound; wider when filtering by day

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Array<Record<string, unknown> & { session?: { date?: string } }>;
    const filtered = day
      ? rows.filter((r) => r.session?.date && weekdayOf(r.session.date) === day)
      : rows;
    return NextResponse.json(
      filtered.slice(0, n * 5).map((r) => {
        const set = { ...r };
        delete set.session;
        return set;
      })
    );
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
  const row: Record<string, unknown> = {
    user_id: auth.userId,
    session_id: body.session_id,
    exercise_id: body.exercise_id,
    set_number: body.set_number,
    weight_kg: body.weight_kg,
    reps: body.reps,
    rpe: body.rpe ?? null,
  };
  // Only sent when flagged, so an unflagged set never depends on the column existing.
  if (body.form_breakdown === true) row.form_breakdown = true;

  const { data, error } = await getSupabaseAdmin()
    .from("workout_sets")
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "the set was not stored" }, { status: 500 });
  return NextResponse.json(data);
}

// Update a logged set in place — used to apply a form/speed flag or RIR to sets
// already logged for an exercise.
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const ids: unknown = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if ("rpe" in body) updates.rpe = body.rpe ?? null;
  if ("form_breakdown" in body) updates.form_breakdown = !!body.form_breakdown;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("workout_sets")
    .update(updates)
    .in("id", ids as string[])
    .eq("user_id", auth.userId)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Matching nothing is its own outcome, not a success.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "no matching sets were updated" }, { status: 404 });
  }
  return NextResponse.json({ updated: data.length });
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// A plain YYYY-MM-DD date's weekday, independent of the server's timezone.
function weekdayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
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

