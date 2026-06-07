"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { clearSession, requireAdmin } from "@/lib/session";
import { clearChat, setAdvanceConfig, setRates } from "@/lib/queries";
import {
  createSession,
  deleteSession,
  updateSession,
  type SessionInput,
} from "@/lib/splitwise";
import { setNickname } from "@/lib/nicknames";
import { getAdminData } from "@/lib/ledger";
import { computeAdvance } from "@/lib/advance";
import { extractPlayersFromScreenshot } from "@/lib/vision";
import { anthropicApiKey } from "@/lib/env";
import type { Rates } from "@/lib/dates";
import type { ActionResult, AdvanceConfig, ScreenshotResult } from "@/lib/admin-types";

/** Run a guarded mutation, then return fresh admin data (or the error). */
async function mutate(fn: () => Promise<void> | void): Promise<ActionResult> {
  await requireAdmin();
  try {
    await fn();
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Something went wrong.";
    return { ok: false, error, data: await getAdminData() };
  }
  // Our own write changed Splitwise — mark the cached ledger stale so the next
  // public visit refreshes (the TTL is the hard timer for direct Splitwise edits).
  revalidateTag("ledger", "max");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, data: await getAdminData() };
}

// ---------- Auth ----------

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
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

// ---------- Monthly advance ----------

export interface AdvanceMessageResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export async function generateAdvanceAction(
  yearMonth: string,
): Promise<AdvanceMessageResult> {
  await requireAdmin();
  const [y, m] = (yearMonth ?? "").split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return { ok: false, error: "Pick a month." };
  try {
    const { message } = await computeAdvance(y, m);
    return { ok: true, message };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not compute the advance.",
    };
  }
}

export async function saveAdvanceConfigAction(
  config: AdvanceConfig,
): Promise<ActionResult> {
  return mutate(() => setAdvanceConfig(config));
}

export async function clearChatAction(): Promise<void> {
  await requireAdmin();
  clearChat();
}

// ---------- Read a Playo screenshot into a draft attendee selection ----------

export async function readScreenshotAction(
  base64Data: string,
  mediaType: string,
): Promise<ScreenshotResult> {
  await requireAdmin();
  const empty = { matchedMemberIds: [], unmatchedNames: [] };
  if (!anthropicApiKey()) {
    return { ok: false, error: "Screenshot reading is not configured.", ...empty };
  }
  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
  if (!allowed.includes(mediaType as (typeof allowed)[number])) {
    return { ok: false, error: "Unsupported image type.", ...empty };
  }
  try {
    const { members, meId } = await getAdminData();
    const roster = members.map((m) => ({
      id: m.id,
      name: m.name,
      fullName: m.fullName,
      nickname: m.nickname,
    }));
    const { matchedMemberIds, unmatchedNames } = await extractPlayersFromScreenshot(
      base64Data,
      mediaType as (typeof allowed)[number],
      roster,
      meId,
    );
    return { ok: true, matchedMemberIds, unmatchedNames };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Could not read the screenshot.";
    return { ok: false, error, ...empty };
  }
}
