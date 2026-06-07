import "server-only";
import { getMembers, listSessions } from "./splitwise";
import type { LogRow, Stats, SummaryRow } from "./queries";

// Derives Birdie's dashboard shapes (Stats / SummaryRow / LogRow) directly
// from the Splitwise group — the source of truth — instead of a local SQLite
// copy. One Splitwise expense = one game session (multiple per date allowed).
// "Owed" comes from Splitwise net balances: a member's balance > 0 means they
// are owed money (creditor), < 0 means they owe (debtor). We surface `owed`
// as -balance so debtors are positive and sort to the top.

export interface LedgerData {
  stats: Stats;
  summary: SummaryRow[];
  log: LogRow[];
}

export async function getLedger(): Promise<LedgerData> {
  const [members, sessions] = await Promise.all([getMembers(), listSessions()]);

  // memberId -> display name. First name is friendlier than the full Splitwise
  // profile name; nicknames will override this map in a later phase.
  const displayName = new Map(members.map((m) => [m.id, m.firstName || m.name]));

  const sorted = [...sessions].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.expenseId - a.expenseId,
  );

  const log: LogRow[] = sorted.map((s) => ({
    date: s.date,
    amount: s.attendees.length ? Math.round(s.total / s.attendees.length) : 0,
    skipped: false,
    count: s.attendees.length,
    dayTotal: s.total,
    names: s.attendees.map((a) => displayName.get(a.id) ?? a.name),
    synced: true, // it lives in Splitwise by definition
    splitwiseExpenseId: s.expenseId,
  }));

  const attendedCount = new Map<number, number>();
  for (const s of sessions) {
    for (const a of s.attendees) {
      attendedCount.set(a.id, (attendedCount.get(a.id) ?? 0) + 1);
    }
  }

  const summary: SummaryRow[] = members
    .filter((m) => m.balance !== 0 || attendedCount.has(m.id))
    .map((m) => ({
      id: m.id,
      name: displayName.get(m.id) ?? m.name,
      days: attendedCount.get(m.id) ?? 0,
      owed: Math.round(-m.balance),
    }))
    .sort((a, b) => b.owed - a.owed);

  // "Collectable" = total currently outstanding (sum of what debtors owe).
  const outstanding = members.reduce(
    (n, m) => n + (m.balance < 0 ? -m.balance : 0),
    0,
  );
  const stats: Stats = {
    gameDays: new Set(sessions.map((s) => s.date)).size,
    headCount: sessions.reduce((n, s) => n + s.attendees.length, 0),
    total: Math.round(outstanding),
  };

  return { stats, summary, log };
}
