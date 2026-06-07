import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { buildAuthorizeUrl } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Origin of the public request (behind Caddy, honour the forwarded headers). */
function requestOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("sw_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(
    buildAuthorizeUrl(`${requestOrigin(req)}/api/auth/callback`, state),
  );
}
