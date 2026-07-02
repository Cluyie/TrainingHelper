import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

// GET ?start=&end=  → step entries in a range (ascending); else the most recent ~60.
export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let query = getSupabaseAdmin()
    .from("daily_steps")
    .select("*")
    .eq("user_id", auth.userId)
    .order("date", { ascending: true });

  if (start && end) {
    query = query.gte("date", start).lte("date", end);
  } else {
    query = query.limit(60);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST { steps, date? } → upsert today's (or the given day's) step count.
// 0 is valid — a genuinely sedentary day is real data, not a missing entry.
export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const steps = Number(body.steps);
  if (!Number.isInteger(steps) || steps < 0) {
    return NextResponse.json({ error: "steps must be a non-negative integer" }, { status: 400 });
  }
  const date = body.date || new Date().toISOString().split("T")[0];

  const { data, error } = await getSupabaseAdmin()
    .from("daily_steps")
    .upsert({ user_id: auth.userId, date, steps }, { onConflict: "user_id,date" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await getSupabaseAdmin()
    .from("daily_steps")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
