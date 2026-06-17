import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const AUTH_COOKIE = "training_auth";
const LOCKOUT_COOKIE = "training_lockout";
const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export interface AuthUser {
  userId: string;
  name: string;
}

export async function createAuthToken(user: AuthUser): Promise<string> {
  return new SignJWT({ authenticated: true, user_id: user.userId, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyAuthToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  return verifyAuthToken(token);
}

/** Read + verify the session cookie, returning the logged-in user or null.
 * API routes call this to scope every query to the user's id. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.user_id as string | undefined;
    if (!userId) return null;
    return { userId, name: (payload.name as string) ?? "" };
  } catch {
    return null;
  }
}

export interface LockoutState {
  attempts: number;
  lockedUntil: number | null;
}

export function parseLockoutCookie(value: string | undefined): LockoutState {
  if (!value) return { attempts: 0, lockedUntil: null };
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return { attempts: 0, lockedUntil: null };
  }
}

export function isLockedOut(state: LockoutState): boolean {
  if (state.lockedUntil && Date.now() < state.lockedUntil) return true;
  return false;
}

export function getRemainingLockoutMs(state: LockoutState): number {
  if (!state.lockedUntil) return 0;
  return Math.max(0, state.lockedUntil - Date.now());
}

export {
  AUTH_COOKIE,
  LOCKOUT_COOKIE,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
  SESSION_DAYS,
};
