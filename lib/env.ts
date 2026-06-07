// Fail-fast environment validation. Called from instrumentation.ts on boot,
// and lazily by consumers so a missing secret never silently degrades to "no auth".

let validated = false;

export function validateEnv(): void {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short. It must be at least 32 random characters.",
    );
  }
  validated = true;
}

export function ensureEnv(): void {
  if (!validated) validateEnv();
}

export function sessionSecret(): string {
  ensureEnv();
  return process.env.SESSION_SECRET as string;
}

export function databasePath(): string {
  return process.env.DATABASE_PATH || "./data/birdie.db";
}

// ---------- Splitwise / chat (optional feature) ----------

export function splitwiseApiKey(): string {
  return process.env.SPLITWISE_API_KEY || "";
}

export function splitwiseGroupName(): string {
  return process.env.SPLITWISE_GROUP_NAME || "Fireboys Badminton";
}

// ---------- Splitwise OAuth ("Log in with Splitwise") ----------

export function splitwiseOAuthClientId(): string {
  return process.env.SPLITWISE_OAUTH_CLIENT_ID || "";
}

export function splitwiseOAuthClientSecret(): string {
  return process.env.SPLITWISE_OAUTH_CLIENT_SECRET || "";
}
