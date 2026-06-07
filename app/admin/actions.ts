"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearLoginAttempts,
  loginAdmin,
  loginAllowed,
  logoutAdmin,
  passwordMatches,
  recordFailedLogin,
  requireAdmin,
} from "@/lib/session";
import { clearChat, setRates } from "@/lib/queries";
import {
  createSession,
  deleteSession,
  updateSession,
  type SessionInput,
} from "@/lib/splitwise";
import { setNickname } from "@/lib/nicknames";
import { getAdminData } from "@/lib/ledger";
import type { Rates } from "@/lib/dates";
import type { ActionResult, LoginState } from "@/lib/admin-types";

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Run a guarded mutation, then return fresh admin data (or the error). */
async function mutate(fn: () => Promise<void> | void): Promise<ActionResult> {
  await requireAdmin();
  try {
    await fn();
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Something went wrong.";
    return { ok: false, error, data: await getAdminData() };
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, data: await getAdminData() };
}

// ---------- Auth ----------

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const ip = await clientIp();
  if (!loginAllowed(ip)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) {
    recordFailedLogin(ip);
    return { error: "Wrong password." };
  }
  clearLoginAttempts(ip);
  await loginAdmin();
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await requireAdmin();
  await logoutAdmin();
  redirect("/");
}

// ---------- Session entry (writes to Splitwise) ----------

export interface SessionFormInput {
  date: string;
  attendeeIds: number[];
  perHead: number;
  payerId: number;
  description: string;
}

function toSessionInput(input: SessionFormInput): SessionInput {
  if (!input.attendeeIds.length) throw new Error("Pick who played.");
  if (!(input.perHead > 0)) throw new Error("Amount per person must be above 0.");
  if (!input.payerId) throw new Error("Pick who paid.");
  return {
    date: input.date,
    description: input.description.trim() || `Birdie · ${input.date}`,
    payerId: input.payerId,
    shares: input.attendeeIds.map((userId) => ({
      userId,
      owed: input.perHead,
    })),
  };
}

export async function createSessionAction(
  input: SessionFormInput,
): Promise<ActionResult> {
  return mutate(async () => {
    await createSession(toSessionInput(input));
  });
}

export async function updateSessionAction(
  expenseId: number,
  input: SessionFormInput,
): Promise<ActionResult> {
  return mutate(async () => {
    await updateSession(expenseId, toSessionInput(input));
  });
}

export async function deleteSessionAction(
  expenseId: number,
): Promise<ActionResult> {
  return mutate(async () => {
    await deleteSession(expenseId);
  });
}

// ---------- Roster nicknames & rates (local) ----------

export async function setNicknameAction(
  memberId: number,
  nickname: string | null,
): Promise<ActionResult> {
  return mutate(() => setNickname(memberId, nickname));
}

export async function setRatesAction(rates: Rates): Promise<ActionResult> {
  return mutate(() => setRates(rates));
}

export async function clearChatAction(): Promise<void> {
  await requireAdmin();
  clearChat();
}
