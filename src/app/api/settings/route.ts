import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
import type { UserSettings } from "@/types";
import { regenerateProgram } from "@/lib/persist-week";

export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .select("*")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw: Partial<UserSettings> = await request.json();

  // The block clock is owned by api/strength/cycle, not by whatever the settings form
  // happened to be holding. The settings page round-trips the whole row, so a tab left
  // open across a deload would post back the old anchor and silently rewind the block.
  // Same for the phase marker, which api/running maintains.
  const body = { ...raw };
  delete body.strength_block_start;
  delete body.running_phase_block;

  const { data: existing } = await getSupabaseAdmin()
    .from("user_settings")
    .select("id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  let settings: UserSettings;

  if (existing) {
    const { data, error } = await getSupabaseAdmin()
      .from("user_settings")
      .update({ ...body, onboarding_complete: true })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = data;
  } else {
    const { data, error } = await getSupabaseAdmin()
      .from("user_settings")
      .insert({ ...body, user_id: auth.userId, onboarding_complete: true })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    settings = data;
  }

  try {
    await regenerateProgram(settings, auth.userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "program regeneration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(settings);
}

// PATCH → update profile/goal fields only (no program regeneration).
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["sex", "birth_year", "height_cm", "activity_level", "goal"] as const;
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("user_settings")
    .update(updates)
    .eq("user_id", auth.userId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
