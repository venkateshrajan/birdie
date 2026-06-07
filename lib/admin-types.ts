import type { Rates } from "./dates";
import type { Stats, SummaryRow } from "./queries";

export interface AdminMember {
  id: number;
  /** Display name (nickname if set, else first name). */
  name: string;
  /** Full Splitwise profile name. */
  fullName: string;
  nickname: string | null;
  /** Net INR balance: > 0 = is owed, < 0 = owes. */
  balance: number;
}

/** One Splitwise expense = one game session. */
export interface AdminSession {
  expenseId: number;
  date: string;
  perHead: number;
  total: number;
  attendeeIds: number[];
  payerId: number | null;
  names: string[];
}

/** The most recent advance a member paid (from the advance-tagged money-in expenses). */
export interface LastAdvance {
  date: string; // YYYY-MM-DD
  amount: number;
}

export interface AdminData {
  /** Current Splitwise user (the API-key owner) — default payer. */
  meId: number;
  members: AdminMember[];
  sessions: AdminSession[]; // newest first
  rates: Rates;
  stats: Stats;
  summary: SummaryRow[];
  advanceConfig: AdvanceConfig;
  /** memberId -> their latest advance payment (absent if never recorded). */
  lastAdvances: Record<string, LastAdvance>;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  data: AdminData;
}

export interface LoginState {
  error?: string;
}

/** Result of reading a Playo screenshot into a draft attendee selection. */
export interface ScreenshotResult {
  ok: boolean;
  error?: string;
  /** Matched roster member ids (host excluded, non-roster names ignored). */
  matchedMemberIds: number[];
  /** Session date (YYYY-MM-DD) read from the screenshot, or null. */
  date: string | null;
}

// ---------- Monthly advance ----------

/** Per-member advance settings (keyed by Splitwise member id). */
export interface AdvanceMemberCfg {
  /** Charge this member a monthly advance at all. */
  include: boolean;
  /** Also charged for Saturdays (weekday charge applies to everyone included). */
  saturdayRegular: boolean;
  /** Weekday indices (0 = Mon … 6 = Sun) this member is NOT charged for. */
  skipDows: number[];
}

export interface AdvanceConfig {
  members: Record<string, AdvanceMemberCfg>;
}

export const DEFAULT_ADVANCE_MEMBER_CFG: AdvanceMemberCfg = {
  include: false,
  saturdayRegular: false,
  skipDows: [],
};
