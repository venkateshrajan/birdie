import "server-only";
import {
  getCurrentUserId,
  getMembers,
  listSessions,
  type Session,
  type SplitwiseMember,
} from "./splitwise";
import { getNicknameMap } from "./nicknames";
import { getSettings } from "./queries";
import type { LogRow, Stats, SummaryRow } from "./queries";
import type { AdminData, AdminMember, AdminSession } from "./admin-types";

// Derives Birdie's views directly from the Splitwise group (source of truth)
// instead of a local SQLite copy. One Splitwise expense = one game session
// (multiple per date allowed). "Owed" comes from Splitwise net balances:
// balance > 0 = creditor (is owed), < 0 = debtor (owes); we surface
// `owed = -balance` so debtors are positive and sort to the top.

export interface LedgerData {
  stats: Stats;
  summary: SummaryRow[];
  log: LogRow[];
}

/** memberId -> display name (nickname, else first name, else full name). */
function displayNames(
  members: SplitwiseMember[],
  nicknames: Map<number, string>,
): Map<number, string> {
  return new Map(
    members.map((m) => [m.id, nicknames.get(m.id) || m.firstName || m.name]),
  );
}

function sortNewestFirst(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.expenseId - a.expenseId,
  );
}

function perHead(s: Session): number {
  return s.attendees.length ? Math.round(s.total / s.attendees.length) : 0;
}

function computeStats(
  members: SplitwiseMember[],
  sessions: Session[],
): Stats {
  // "Collectable" = total currently outstanding (sum of what debtors owe).
  const outstanding = members.reduce(
    (n, m) => n + (m.balance < 0 ? -m.balance : 0),
    0,
  );
  return {
    gameDays: new Set(sessions.map((s) => s.date)).size,
    headCount: sessions.reduce((n, s) => n + s.attendees.length, 0),
    total: Math.round(outstanding),
  };
}

function computeSummary(
  members: SplitwiseMember[],
  sessions: Session[],
  names: Map<number, string>,
): SummaryRow[] {
  const attended = new Map<number, number>();
  for (const s of sessions) {
    for (const a of s.attendees) {
      attended.set(a.id, (attended.get(a.id) ?? 0) + 1);
    }
  }
  return members
    .filter((m) => m.balance !== 0 || attended.has(m.id))
    .map((m) => ({
      id: m.id,
      name: names.get(m.id) ?? m.name,
      days: attended.get(m.id) ?? 0,
      owed: Math.round(-m.balance),
    }))
    .sort((a, b) => b.owed - a.owed);
}

export async function getLedger(): Promise<LedgerData> {
  const [members, sessions] = await Promise.all([getMembers(), listSessions()]);
  const names = displayNames(members, getNicknameMap());

  const log: LogRow[] = sortNewestFirst(sessions).map((s) => ({
    date: s.date,
    amount: perHead(s),
    skipped: false,
    count: s.attendees.length,
    dayTotal: s.total,
    names: s.attendees.map((a) => names.get(a.id) ?? a.name),
    synced: true, // it lives in Splitwise by definition
    splitwiseExpenseId: s.expenseId,
  }));

  return {
    stats: computeStats(members, sessions),
    summary: computeSummary(members, sessions, names),
    log,
  };
}

export async function getAdminData(): Promise<AdminData> {
  const [meId, members, sessions] = await Promise.all([
    getCurrentUserId(),
    getMembers(),
    listSessions(),
  ]);
  const nicknames = getNicknameMap();
  const names = displayNames(members, nicknames);
  const settings = getSettings();

  const adminMembers: AdminMember[] = members
    .map((m) => ({
      id: m.id,
      name: names.get(m.id) ?? m.name,
      fullName: m.name,
      nickname: nicknames.get(m.id) ?? null,
      balance: m.balance,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const adminSessions: AdminSession[] = sortNewestFirst(sessions).map((s) => ({
    expenseId: s.expenseId,
    date: s.date,
    perHead: perHead(s),
    total: s.total,
    attendeeIds: s.attendees.map((a) => a.id),
    payerId: s.payerId,
    names: s.attendees.map((a) => names.get(a.id) ?? a.name),
  }));

  return {
    meId,
    members: adminMembers,
    sessions: adminSessions,
    rates: settings.rates,
    stats: computeStats(members, sessions),
    summary: computeSummary(members, sessions, names),
  };
}
