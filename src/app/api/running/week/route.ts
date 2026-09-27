import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth";
import { computeBlockState, BLOCK_WEEKS } from "@/lib/deload";
export const dynamic = "force-dynamic";

// Where the strength block is this week. Running is a log now, not a plan, but it
// still sits inside the same week: in the week-6 deload the running page reminds you
// to keep runs easy too.
export async function GET() {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("user_settings")
    .select("strength_block_start")
    .eq("user_id", auth.userId)
    .maybeSingle();

  // A failed read used to be indistinguishable from "no anchor yet": data came back
  // null, the write below fired, and the stored anchor was replaced with this week's
  // Monday — resetting the block clock to week 1 with no error anywhere. One flaky
  // select was enough to lose the whole training calendar, so the read must fail loudly.
  if (error) {
    return NextResponse.json(
      { error: `failed to read the block anchor: ${error.message}` },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "no settings for this user" }, { status: 404 });
  }

  const stored = data.strength_block_start ?? null;
  const block = computeBlockState(stored);

  // The anchor is immutable, so it is written exactly once — on first read, when the
  // settings row exists and the column is genuinely null.
  if (!stored) {
    const { error: writeErr } = await db
      .from("user_settings")
      .update({ strength_block_start: block.blockStart })
      .eq("user_id", auth.userId);
    if (writeErr) {
      return NextResponse.json(
        { error: `failed to store the block anchor: ${writeErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ...block, blockWeeks: BLOCK_WEEKS });
}
