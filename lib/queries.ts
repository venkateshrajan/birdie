import { getDb } from "./db";
import type { Rates } from "./dates";

export interface Person {
  id: number;
  name: string;
}

export interface DayRecord {
  amount: number;
  skipped: boolean;
  attendeeIds: number[];
  splitwiseExpenseId: number | null;
  syncedAt: string | null;
}

export interface SummaryRow {
  id: number;
  name: string;
  days: number;
  owed: number;
}

export interface LogRow {
  date: string;
  amount: number;
  skipped: boolean;
  count: number;
  dayTotal: number;
  names: string[];
  synced: boolean;
  splitwiseExpenseId: number | null;
}

export interface Stats {
  gameDays: number;
  headCount: number;
  total: number;
}

export interface AppSettings {
  rates: Rates;
  startDate: string;
}

// ---------- Reads ----------

export function getPeople(): Person[] {
  return getDb()
    .prepare("SELECT id, name FROM people ORDER BY name COLLATE NOCASE")
    .all() as Person[];
}

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    rates: {
      weekday: Number(map.get("rate_weekday") ?? 105),
      saturday: Number(map.get("rate_saturday") ?? 185),
      sunday: Number(map.get("rate_sunday") ?? 0),
    },
    startDate: map.get("start_date") ?? "",
  };
}

/** Map of date -> { amount, skipped, attendeeIds } for every recorded day. */
export function getDaysMap(): Record<string, DayRecord> {
  const db = getDb();
  const days = db
    .prepare(
      "SELECT date, amount, skipped, splitwise_expense_id, synced_at FROM game_days",
    )
    .all() as {
    date: string;
    amount: number;
    skipped: number;
    splitwise_expense_id: number | null;
    synced_at: string | null;
  }[];
  const att = db
    .prepare("SELECT game_date, person_id FROM attendance")
    .all() as { game_date: string; person_id: number }[];

  const map: Record<string, DayRecord> = {};
  for (const d of days) {
    map[d.date] = {
      amount: d.amount,
      skipped: d.skipped === 1,
      attendeeIds: [],
      splitwiseExpenseId: d.splitwise_expense_id,
      syncedAt: d.synced_at,
    };
  }
  for (const a of att) {
    map[a.game_date]?.attendeeIds.push(a.person_id);
  }
  return map;
}

/** Per-person owed, days played > 0, sorted by owed desc. */
export function getSummary(): SummaryRow[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name,
              COUNT(CASE WHEN g.skipped = 0 THEN 1 END) AS days,
              COALESCE(SUM(CASE WHEN g.skipped = 0 THEN g.amount ELSE 0 END), 0) AS owed
       FROM people p
       LEFT JOIN attendance a ON a.person_id = p.id
       LEFT JOIN game_days g  ON g.date = a.game_date
       GROUP BY p.id
       HAVING days > 0
       ORDER BY owed DESC, p.name COLLATE NOCASE ASC`,
    )
    .all() as SummaryRow[];
  return rows;
}

export function getStats(): Stats {
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT g.date) AS gameDays,
              COUNT(a.person_id)     AS headCount,
              COALESCE(SUM(g.amount), 0) AS total
       FROM game_days g
       LEFT JOIN attendance a ON a.game_date = g.date
       WHERE g.skipped = 0`,
    )
    .get() as Stats;
  return row;
}

/** Recorded-days log, newest first, with attendee names. */
export function getLog(): LogRow[] {
  const db = getDb();
  const days = db
    .prepare(
      "SELECT date, amount, skipped, splitwise_expense_id, synced_at FROM game_days ORDER BY date DESC",
    )
    .all() as {
    date: string;
    amount: number;
    skipped: number;
    splitwise_expense_id: number | null;
    synced_at: string | null;
  }[];
  const att = db
    .prepare(
      `SELECT a.game_date AS date, p.name AS name
       FROM attendance a JOIN people p ON p.id = a.person_id
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all() as { date: string; name: string }[];

  const namesByDate = new Map<string, string[]>();
  for (const a of att) {
    const arr = namesByDate.get(a.date) ?? [];
    arr.push(a.name);
    namesByDate.set(a.date, arr);
  }

  return days.map((d) => {
    const names = namesByDate.get(d.date) ?? [];
    const skipped = d.skipped === 1;
    const count = skipped ? 0 : names.length;
    return {
      date: d.date,
      amount: d.amount,
      skipped,
      count,
      dayTotal: skipped ? 0 : d.amount * count,
      names: skipped ? [] : names,
      synced: d.synced_at != null,
      splitwiseExpenseId: d.splitwise_expense_id,
    };
  });
}

// ---------- Mutations ----------

export class AppError extends Error {}

export function addPerson(rawName: string): void {
  const name = rawName.trim();
  if (!name) throw new AppError("Name can't be empty.");
  try {
    getDb().prepare("INSERT INTO people (name) VALUES (?)").run(name);
  } catch (e: unknown) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      throw new AppError(`"${name}" is already on the roster.`);
    }
    throw e;
  }
}

export function renamePerson(id: number, rawName: string): void {
  const name = rawName.trim();
  if (!name) throw new AppError("Name can't be empty.");
  try {
    const res = getDb().prepare("UPDATE people SET name = ? WHERE id = ?").run(name, id);
    if (res.changes === 0) throw new AppError("Player not found.");
  } catch (e: unknown) {
    if (e instanceof Error && /UNIQUE/i.test(e.message)) {
      throw new AppError(`"${name}" is already on the roster.`);
    }
    throw e;
  }
}

/** Delete a person; cascades attendance, then prune any now-empty days. */
export function removePerson(id: number): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM people WHERE id = ?").run(id);
    pruneEmptyDays(db);
  });
  tx();
}

export interface SaveDayInput {
  date: string;
  amount: number;
  attendeeIds: number[];
  skipped: boolean;
}

export function saveDay({ date, amount, attendeeIds, skipped }: SaveDayInput): void {
  const db = getDb();
  const amt = Math.max(0, Math.round(amount || 0));
  const ids = Array.from(new Set(attendeeIds.map((n) => Number(n)).filter(Number.isInteger)));

  const tx = db.transaction(() => {
    // A non-skipped day with no attendees is meaningless — prune it.
    if (!skipped && ids.length === 0) {
      db.prepare("DELETE FROM game_days WHERE date = ?").run(date); // cascades attendance
      return;
    }

    db.prepare(
      `INSERT INTO game_days (date, amount, skipped, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         amount = excluded.amount,
         skipped = excluded.skipped,
         updated_at = excluded.updated_at,
         -- editing a day invalidates its prior sync; keep the expense id so a
         -- re-push updates the existing Splitwise expense instead of duplicating.
         synced_at = NULL`,
    ).run(date, amt, skipped ? 1 : 0);

    // Replace attendance for the day.
    db.prepare("DELETE FROM attendance WHERE game_date = ?").run(date);
    if (!skipped) {
      const ins = db.prepare(
        "INSERT INTO attendance (game_date, person_id) VALUES (?, ?)",
      );
      for (const pid of ids) ins.run(date, pid);
    }
  });
  tx();
}

export function setRates(rates: Rates): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const norm = (n: number) => String(Math.max(0, Math.round(n || 0)));
  const tx = db.transaction(() => {
    upsert.run("rate_weekday", norm(rates.weekday));
    upsert.run("rate_saturday", norm(rates.saturday));
    upsert.run("rate_sunday", norm(rates.sunday));
  });
  tx();
}

export function setStartDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("Invalid start date.");
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('start_date', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(date);
}

// ---------- Splitwise sync ----------

/** Record that a game day has been pushed to Splitwise as `expenseId`. */
export function markDaySynced(date: string, expenseId: number): void {
  getDb()
    .prepare(
      `UPDATE game_days
       SET splitwise_expense_id = ?, synced_at = datetime('now')
       WHERE date = ?`,
    )
    .run(expenseId, date);
}

// ---------- Chat history ----------

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export function appendChatMessage(role: "user" | "assistant", content: string): void {
  getDb()
    .prepare("INSERT INTO chat_messages (role, content) VALUES (?, ?)")
    .run(role, content);
}

export function getChatMessages(limit = 200): ChatMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT id, role, content, created_at FROM chat_messages ORDER BY id DESC LIMIT ?",
    )
    .all(limit) as ChatMessage[];
  return rows.reverse();
}

export function clearChat(): void {
  const db = getDb();
  db.prepare("DELETE FROM chat_messages").run();
  setSetting("claude_session_id", "");
}

// ---------- Settings helpers ----------

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function getClaudeSessionId(): string | null {
  const v = getSetting("claude_session_id");
  return v && v.length > 0 ? v : null;
}

export function setClaudeSessionId(id: string): void {
  setSetting("claude_session_id", id);
}

function pruneEmptyDays(db: ReturnType<typeof getDb>): void {
  db.prepare(
    `DELETE FROM game_days
     WHERE skipped = 0
       AND date NOT IN (SELECT DISTINCT game_date FROM attendance)`,
  ).run();
}
