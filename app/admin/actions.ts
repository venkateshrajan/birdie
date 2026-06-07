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
import {
  AppError,
  addPerson,
  clearChat,
  getDaysMap,
  getLog,
  getPeople,
  getSettings,
  getStats,
  getSummary,
  removePerson,
  renamePerson,
  saveDay,
  setRates,
  setStartDate,
  type SaveDayInput,
} from "@/lib/queries";
import type { Rates } from "@/lib/dates";
import type { ActionResult, AdminData, LoginState } from "@/lib/admin-types";

async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function adminData(): AdminData {
  return {
    people: getPeople(),
    settings: getSettings(),
    days: getDaysMap(),
    summary: getSummary(),
    stats: getStats(),
    log: getLog(),
  };
}

async function mutate(fn: () => void): Promise<ActionResult> {
  await requireAdmin();
  try {
    fn();
  } catch (e: unknown) {
    if (e instanceof AppError) {
      return { ok: false, error: e.message, data: adminData() };
    }
    throw e;
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, data: adminData() };
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

// ---------- Mutations ----------

export async function addPersonAction(name: string): Promise<ActionResult> {
  return mutate(() => addPerson(name));
}

export async function renamePersonAction(id: number, name: string): Promise<ActionResult> {
  return mutate(() => renamePerson(id, name));
}

export async function removePersonAction(id: number): Promise<ActionResult> {
  return mutate(() => removePerson(id));
}

export async function saveDayAction(input: SaveDayInput): Promise<ActionResult> {
  return mutate(() => saveDay(input));
}

export async function setRatesAction(rates: Rates): Promise<ActionResult> {
  return mutate(() => setRates(rates));
}

export async function setStartDateAction(date: string): Promise<ActionResult> {
  return mutate(() => setStartDate(date));
}

export async function clearChatAction(): Promise<void> {
  await requireAdmin();
  clearChat();
}
