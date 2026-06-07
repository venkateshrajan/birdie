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

export interface AdminData {
  /** Current Splitwise user (the API-key owner) — default payer. */
  meId: number;
  members: AdminMember[];
  sessions: AdminSession[]; // newest first
  rates: Rates;
  stats: Stats;
  summary: SummaryRow[];
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
  /** Matched roster member ids (host already excluded). */
  matchedMemberIds: number[];
  /** Player names read but not matched to a member. */
  unmatchedNames: string[];
}
