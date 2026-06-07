import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exchangeCodeForToken, resolveUserFromToken } from "@/lib/auth";
import { setSessionUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const saved = store.get("sw_oauth_state")?.value;
  store.delete("sw_oauth_state");

  // CSRF: the state we issued must round-trip back.
  if (!code || !state || !saved || state !== saved) {
    redirect("/login?error=state");
  }

  let dest = "/";
  try {
    const token = await exchangeCodeForToken(
      code,
      `${requestOrigin(req)}/api/auth/callback`,
    );
    const user = await resolveUserFromToken(token);
    if (!user) {
      dest = "/login?error=not_member";
    } else {
      await setSessionUser(user);
      dest = user.role === "admin" ? "/admin" : "/";
    }
  } catch {
    dest = "/login?error=oauth";
  }
  redirect(dest);
}
