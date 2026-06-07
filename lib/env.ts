// Fail-fast environment validation. Called from instrumentation.ts on boot,
// and lazily by consumers so a missing secret never silently degrades to "no auth".

let validated = false;

export function validateEnv(): void {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!password || password.length < 8 || password === "change-me-to-something-long") {
    throw new Error(
      "ADMIN_PASSWORD is missing or too weak. Set a strong value (>= 8 chars) in the environment.",
    );
  }
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

export function adminPassword(): string {
  ensureEnv();
  return process.env.ADMIN_PASSWORD as string;
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
