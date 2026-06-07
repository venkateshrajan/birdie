import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { adminPassword, sessionSecret } from "./env";

export interface SessionData {
  admin?: boolean;
}

function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: "birdie_admin",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  // cookies() is async in Next.js 16.
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session.admin === true;
}

/** Guard for admin pages / server actions. Redirects to login when not admin. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** Constant-time password check against ADMIN_PASSWORD. */
export function passwordMatches(submitted: string): boolean {
  const expected = adminPassword();
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still do a comparison to keep timing roughly constant.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function loginAdmin(): Promise<void> {
  const session = await getSession();
  session.admin = true;
  await session.save();
}

export async function logoutAdmin(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

// ---------- Simple in-memory login rate limiter ----------
// 5 attempts / 15 min per IP. Resets on server restart (acceptable for one admin).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; first: number }>();

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) return true;
  return rec.count < MAX_ATTEMPTS;
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
  } else {
    rec.count += 1;
  }
}

export function clearLoginAttempts(ip: string): void {
  attempts.delete(ip);
}
