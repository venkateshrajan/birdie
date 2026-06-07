import "server-only";
import { splitwiseApiKey, splitwiseGroupName } from "./env";

// Direct Splitwise REST client. Birdie reads the configured group as its
// source of truth for game sessions and balances; this replaces deriving
// dues from a local SQLite copy. Writes (create/update/delete expense) go
// straight to Splitwise too, so there is no second editable copy to drift.
//
// All Splitwise access used to go through the Python MCP server spawned via
// the claude CLI — far too heavy for per-request reads. This talks to the
// v3 API over HTTPS with the same Bearer key.

const BASE = "https://secure.splitwise.com/api/v3.0";

export class SplitwiseError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SplitwiseError";
  }
}

export interface SplitwiseMember {
  id: number;
  /** Splitwise profile name (first + last, trimmed). Birdie may show a nickname instead. */
  name: string;
  firstName: string;
  /** Net INR balance: > 0 = creditor (is owed), < 0 = debtor (owes), 0 = even. */
  balance: number;
}

export interface SessionAttendee {
  id: number;
  name: string;
  /** Per-head amount this attendee owes for the session (INR). */
  share: number;
}

/** One Splitwise expense = one game session. Multiple per date are allowed. */
export interface Session {
  expenseId: number;
  date: string; // YYYY-MM-DD
  description: string;
  total: number; // expense cost (INR)
  currency: string;
  payerId: number | null; // member who fronted the money
  attendees: SessionAttendee[]; // members with owed_share > 0
  createdAt: string | null;
  updatedAt: string | null;
}

// ---- raw API shapes (only the fields we read) ----
interface RawBalance {
  currency_code: string;
  amount: string;
}
interface RawMember {
  id: number;
  first_name: string | null;
  last_name: string | null;
  balance?: RawBalance[];
}
interface RawExpenseUser {
  user: { id: number; first_name: string | null; last_name: string | null };
  paid_share: string;
  owed_share: string;
}
interface RawExpense {
  id: number;
  date: string;
  description: string | null;
  cost: string;
  currency_code: string;
  deleted_at: string | null;
  payment: boolean;
  created_at: string | null;
  updated_at: string | null;
  users: RawExpenseUser[];
}

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const key = splitwiseApiKey();
  if (!key) throw new SplitwiseError("SPLITWISE_API_KEY is not configured");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    // Reads are cached at the Birdie ledger layer, not here.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SplitwiseError(`GET ${path} failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(
  path: string,
  form: Record<string, string | number>,
): Promise<T> {
  const key = splitwiseApiKey();
  if (!key) throw new SplitwiseError("SPLITWISE_API_KEY is not configured");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) body.set(k, String(v));
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SplitwiseError(`POST ${path} failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

// The configured group's id rarely changes; resolve it once per process.
let cachedGroupId: number | null = null;

export async function resolveGroupId(): Promise<number> {
  if (cachedGroupId !== null) return cachedGroupId;
  const want = splitwiseGroupName().trim().toLowerCase();
  const data = await apiGet<{ groups: { id: number; name: string }[] }>(
    "/get_groups",
  );
  const match = data.groups.find(
    (g) => (g.name ?? "").trim().toLowerCase() === want,
  );
  if (!match) {
    throw new SplitwiseError(
      `Splitwise group "${splitwiseGroupName()}" not found`,
    );
  }
  cachedGroupId = match.id;
  return match.id;
}

export async function getCurrentUserId(): Promise<number> {
  const data = await apiGet<{ user: { id: number } }>("/get_current_user");
  return data.user.id;
}

export async function getMembers(): Promise<SplitwiseMember[]> {
  const groupId = await resolveGroupId();
  const data = await apiGet<{ group: { members: RawMember[] } }>(
    `/get_group/${groupId}`,
  );
  return data.group.members.map((m) => {
    const inr = (m.balance ?? []).find((b) => b.currency_code === "INR");
    return {
      id: m.id,
      name: fullName(m.first_name, m.last_name),
      firstName: m.first_name ?? "",
      balance: inr ? parseFloat(inr.amount) : 0,
    };
  });
}

/**
 * Every live (non-deleted, non-payment) expense in the group, newest first.
 * `limit: 0` asks Splitwise for all of them.
 */
export async function listSessions(limit = 0): Promise<Session[]> {
  const groupId = await resolveGroupId();
  const data = await apiGet<{ expenses: RawExpense[] }>("/get_expenses", {
    group_id: groupId,
    limit,
  });
  return data.expenses
    .filter((e) => !e.deleted_at && !e.payment)
    .map((e) => ({
      expenseId: e.id,
      date: (e.date ?? "").slice(0, 10),
      description: e.description ?? "",
      total: parseFloat(e.cost),
      currency: e.currency_code,
      payerId: e.users.find((u) => parseFloat(u.paid_share) > 0)?.user.id ?? null,
      attendees: e.users
        .filter((u) => parseFloat(u.owed_share) > 0)
        .map((u) => ({
          id: u.user.id,
          name: fullName(u.user.first_name, u.user.last_name),
          share: parseFloat(u.owed_share),
        })),
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    }));
}

export interface SessionInput {
  date: string; // YYYY-MM-DD
  description: string;
  /** member id -> amount that member owes (INR). The payer fronts the sum. */
  shares: { userId: number; owed: number }[];
  payerId: number; // member who paid the full cost
}

function expenseForm(input: SessionInput): Record<string, string | number> {
  const total = input.shares.reduce((s, x) => s + x.owed, 0);
  const form: Record<string, string | number> = {
    cost: total.toFixed(2),
    description: input.description,
    currency_code: "INR",
    date: input.date,
  };
  input.shares.forEach((s, i) => {
    const paid = s.userId === input.payerId ? total : 0;
    form[`users__${i}__user_id`] = s.userId;
    form[`users__${i}__paid_share`] = paid.toFixed(2);
    form[`users__${i}__owed_share`] = s.owed.toFixed(2);
  });
  // If the payer isn't among the attendees, add them as a 0-owed participant
  // so paid_share is recorded against someone.
  if (!input.shares.some((s) => s.userId === input.payerId)) {
    const i = input.shares.length;
    form[`users__${i}__user_id`] = input.payerId;
    form[`users__${i}__paid_share`] = total.toFixed(2);
    form[`users__${i}__owed_share`] = "0.00";
  }
  return form;
}

export async function createSession(input: SessionInput): Promise<number> {
  const groupId = await resolveGroupId();
  const data = await apiPost<{ expenses: { id: number }[]; errors?: unknown }>(
    "/create_expense",
    { ...expenseForm(input), group_id: groupId },
  );
  const id = data.expenses?.[0]?.id;
  if (!id) {
    throw new SplitwiseError(
      `create_expense returned no id: ${JSON.stringify(data.errors ?? data)}`,
    );
  }
  return id;
}

export async function updateSession(
  expenseId: number,
  input: SessionInput,
): Promise<void> {
  const data = await apiPost<{ expenses: { id: number }[]; errors?: unknown }>(
    `/update_expense/${expenseId}`,
    expenseForm(input),
  );
  if (!data.expenses?.length) {
    throw new SplitwiseError(
      `update_expense failed: ${JSON.stringify(data.errors ?? data)}`,
    );
  }
}

export async function deleteSession(expenseId: number): Promise<void> {
  const data = await apiPost<{ success: boolean; errors?: unknown }>(
    `/delete_expense/${expenseId}`,
    {},
  );
  if (!data.success) {
    throw new SplitwiseError(
      `delete_expense failed: ${JSON.stringify(data.errors ?? data)}`,
    );
  }
}
