import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createAuthToken } from "@/lib/auth";
export const dynamic = "force-dynamic";

const AUTH_COOKIE = "training_auth";
const LOCKOUT_COOKIE = "training_lockout";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000;
const SESSION_DAYS = 30;

interface LockoutState {
  attempts: number;
  lockedUntil: number | null;
}

function parseLockout(value: string | undefined): LockoutState {
  if (!value) return { attempts: 0, lockedUntil: null };
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

export async function POST(request: NextRequest) {
  const { pin } = await request.json();
  const lockoutValue = request.cookies.get(LOCKOUT_COOKIE)?.value;
  const lockout = parseLockout(lockoutValue);

  if (lockout.lockedUntil && Date.now() < lockout.lockedUntil) {
    const remainingMs = lockout.lockedUntil - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return NextResponse.json(
      { error: "locked", remainingMin },
      { status: 429 }
    );
  }

  // The PIN identifies the user — look them up.
  const { data: user } = await getSupabaseAdmin()
    .from("users")
    .select("id, name")
    .eq("pin", String(pin))
    .maybeSingle();

  if (!user) {
    const newAttempts = lockout.attempts + 1;
    const newLockout: LockoutState =
      newAttempts >= MAX_ATTEMPTS
        ? { attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_MS }
        : { attempts: newAttempts, lockedUntil: null };

    const response = NextResponse.json(
      {
        error: "wrong_pin",
        attemptsLeft: MAX_ATTEMPTS - newAttempts,
        locked: newAttempts >= MAX_ATTEMPTS,
      },
      { status: 401 }
    );

    response.cookies.set(LOCKOUT_COOKIE, encodeURIComponent(JSON.stringify(newLockout)), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    return response;
  }

  // Correct PIN — issue auth token (carrying the user id), clear lockout
  const token = await createAuthToken({ userId: user.id, name: user.name });

  const response = NextResponse.json({ success: true });

  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });

  response.cookies.delete(LOCKOUT_COOKIE);

  return response;
}
