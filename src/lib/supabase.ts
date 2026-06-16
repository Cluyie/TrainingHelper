import { createClient } from "@supabase/supabase-js";

// All Supabase access is server-side only (API routes).
// Uses the Secret key — no publishable/anon key needed for this app.
export function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}
