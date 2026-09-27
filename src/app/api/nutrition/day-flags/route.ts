import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

// "Didn't track properly" marks, one per day. See supabase/nutrition-day-flags.sql
// for what a mark does to the calorie estimate and the weekly averages.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?start=&end= → marks in the range (ascending); GET ?date= → that day's mark or [].
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const start = searchParams.get("start") ?? date;
  const end = searchParams.get("end") ?? date;
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: "date, or start and end (YYYY-MM-DD), required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("nutrition_day_flags")
    .select("date, estimated_kcal")
    .eq("user_id", auth.userId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PUT { date, estimated_kcal? } → mark the day (or update its estimate).
export async function PUT(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }
  let estimate: number | null = null;
  if (body.estimated_kcal != null && body.estimated_kcal !== "") {
    estimate = Number(body.estimated_kcal);
    if (!Number.isInteger(estimate) || estimate < 0 || estimate > 20000) {
      return NextResponse.json({ error: "estimated_kcal must be a whole number between 0 and 20000" }, { status: 400 });
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("nutrition_day_flags")
    .upsert(
      { user_id: auth.userId, date: body.date, estimated_kcal: estimate },
      { onConflict: "user_id,date" }
    )
    .select("date, estimated_kcal")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "the mark was not stored" }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE ?date= → unmark the day.
export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const date = new URL(request.url).searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("nutrition_day_flags")
    .delete()
    .eq("user_id", auth.userId)
    .eq("date", date)
    .select("date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Nothing matched: the day wasn't marked. Say so rather than report success.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "that day was not marked" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
