import { getDb } from "./db";
import type { Rates } from "./dates";
import type { AdvanceConfig } from "./admin-types";

// NOTE: Birdie's ledger (sessions, attendees, balances, roster) now comes from
// Splitwise — see lib/splitwise.ts and lib/ledger.ts. This module only holds
// the local-only state Splitwise can't: rates, chat history, and the Claude
// session id. The people/game_days/attendance tables remain in the schema but
// are no longer read (kept to preserve the migration chain; safe to drop in a
// follow-up that also collapses the migrations).

// These shapes describe the derived dashboard data produced by lib/ledger.ts.
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
  attendeeIds: number[];
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

// ---------- Rates (local config, used to pre-fill entry) ----------

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

// ---------- Monthly advance config ----------

export function getAdvanceConfig(): AdvanceConfig {
  const raw = getSetting("advance_config");
  if (!raw) return { members: {} };
  try {
    const parsed = JSON.parse(raw) as AdvanceConfig;
    return parsed && parsed.members ? parsed : { members: {} };
  } catch {
    return { members: {} };
  }
}

export function setAdvanceConfig(config: AdvanceConfig): void {
  setSetting("advance_config", JSON.stringify(config));
}
