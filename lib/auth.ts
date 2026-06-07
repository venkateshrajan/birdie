import "server-only";
import {
  splitwiseOAuthClientId,
  splitwiseOAuthClientSecret,
} from "./env";
import { getCurrentUserId, getMembers } from "./splitwise";

// "Log in with Splitwise" (OAuth 2.0, authorization-code flow). The member's
// token is used only to identify them; all ledger data still comes from the
// app's own API key. Role: the API-key owner is the admin; other group members
// get the member view; everyone else is denied.

const AUTHORIZE_URL = "https://secure.splitwise.com/oauth/authorize";
const TOKEN_URL = "https://secure.splitwise.com/oauth/token";
const CURRENT_USER_URL =
  "https://secure.splitwise.com/api/v3.0/get_current_user";

export type Role = "admin" | "member";

export interface ResolvedUser {
  id: number;
  name: string;
  role: Role;
}

export class AuthError extends Error {}

export function buildAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = splitwiseOAuthClientId();
  if (!clientId) throw new AuthError("SPLITWISE_OAUTH_CLIENT_ID is not configured");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const clientId = splitwiseOAuthClientId();
  const clientSecret = splitwiseOAuthClientSecret();
  if (!clientId || !clientSecret) {
    throw new AuthError("Splitwise OAuth client credentials are not configured");
  }
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AuthError(`Token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new AuthError("No access token returned");
  return data.access_token;
}

async function fetchOAuthUser(
  token: string,
): Promise<{ id: number; name: string }> {
  const res = await fetch(CURRENT_USER_URL, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new AuthError(`get_current_user failed: ${res.status}`);
  const data = (await res.json()) as {
    user: { id: number; first_name: string | null; last_name: string | null };
  };
  const u = data.user;
  return {
    id: u.id,
    name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim(),
  };
}

/**
 * Identify the OAuth user and resolve their role against the configured group.
 * Returns null if they are not a member of the group (and not the owner).
 */
export async function resolveUserFromToken(
  token: string,
): Promise<ResolvedUser | null> {
  const [user, ownerId, members] = await Promise.all([
    fetchOAuthUser(token),
    getCurrentUserId(), // the API-key owner = the admin
    getMembers(),
  ]);

  if (user.id === ownerId) {
    return { id: user.id, name: user.name, role: "admin" };
  }
  if (members.some((m) => m.id === user.id)) {
    return { id: user.id, name: user.name, role: "member" };
  }
  return null;
}
