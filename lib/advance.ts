import "server-only";
import {
  getBalancesAsOf,
  getCurrentUserId,
  getMembers,
  listSessions,
} from "./splitwise";
import { getNicknameMap } from "./nicknames";
import { getAdvanceConfig, getSettings } from "./queries";
import { shortDay } from "./dates";
import { DEFAULT_ADVANCE_MEMBER_CFG } from "./admin-types";

// Monthly advance generator. Everyone included is charged every weekday
// (Mon–Fri) at the weekday rate; Saturday regulars additionally pay every
// Saturday at the Saturday rate (Sunday is off). A member can skip specific
// weekdays (e.g. Anand on Tuesdays). Each person's prepaid carry-over — their
// net Splitwise balance up to the last day of the previous month — is then
// subtracted (credit) or added (if they owe). The math is fully deterministic;
// the chat/admin only present the result.

const MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // 0=Mon

export function monthAbbr(month: number): string {
  return MON_ABBR[month - 1];
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** 0 = Mon … 6 = Sun, built from local parts (no UTC drift). */
function dow(year: number, month: number, day: number): number {
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export interface AdvanceLine {
  id: number;
  name: string;
  balance: number;
  expr: string;
  total: number; // <= 0 means "already covered"
}

export interface AdvanceResult {
  year: number;
  month: number; // 1-12
  message: string;
  lines: AdvanceLine[];
}

/**
 * Compute the advance for the given month (1-12). Reads members + balances from
 * Splitwise, rates from settings, and per-member rules from the advance config.
 */
export async function computeAdvance(
  year: number,
  month: number,
): Promise<AdvanceResult> {
  const cutoff = `${year}-${pad(month)}-01`; // balances strictly before this
  const [members, balances, sessions, hostId] = await Promise.all([
    getMembers(),
    getBalancesAsOf(cutoff),
    listSessions(),
    getCurrentUserId(),
  ]);
  const nicknames = getNicknameMap();
  const cfg = getAdvanceConfig();
  const { rates } = getSettings();
  const wrate = rates.weekday;
  const satrate = rates.saturday;

  // Count weekdays, Saturdays, and per-weekday occurrences in the month.
  const daysInMonth = new Date(year, month, 0).getDate();
  let weekdayCount = 0;
  let saturdayCount = 0;
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = dow(year, month, d);
    dowCount[wd]++;
    if (wd === 5) saturdayCount++;
    else if (wd !== 6) weekdayCount++; // Mon–Fri
  }
  const base = weekdayCount * wrate;
  const satTotal = saturdayCount * satrate;

  const display = (id: number, first: string, full: string) =>
    nicknames.get(id) || first || full;

  const included = members
    .map((m) => ({
      m,
      cfg: cfg.members[String(m.id)] ?? DEFAULT_ADVANCE_MEMBER_CFG,
    }))
    .filter((x) => x.cfg.include)
    .map((x) => ({ ...x, name: display(x.m.id, x.m.firstName, x.m.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines: AdvanceLine[] = included.map(({ m, cfg: mc, name }) => {
    const parts: string[] = [String(base)];
    let total = base;
    if (mc.saturdayRegular) {
      parts.push(`+ ${satTotal}`);
      total += satTotal;
    }
    for (const sd of [...mc.skipDows].sort((a, b) => a - b)) {
      if (sd < 0 || sd > 4) continue; // only weekday skips affect the charge
      const deduct = dowCount[sd] * wrate;
      parts.push(`- ${deduct}`);
      total -= deduct;
    }
    const bal = Math.round(balances.get(m.id) ?? 0);
    if (bal >= 0) {
      parts.push(`- ${bal}`);
      total -= bal;
    } else {
      parts.push(`+ ${-bal}`);
      total += -bal;
    }
    return { id: m.id, name, balance: bal, expr: parts.join(" "), total };
  });

  // Header skip lines: one per distinct weekday any included member skips.
  const skipDows = [
    ...new Set(included.flatMap((x) => x.cfg.skipDows.filter((d) => d >= 0 && d <= 4))),
  ].sort((a, b) => a - b);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const tillLabel = `${ordinal(prevLastDay)} ${MON_ABBR[prevMonth - 1]}`;
  const mon = MON_ABBR[month - 1];

  // Days each included member played in the previous month (game sessions only;
  // money-in entries — host owes the whole cost while a member paid — excluded).
  const prevYM = `${prevYear}-${pad(prevMonth)}`;
  const playedDates = new Map<number, string[]>();
  for (const s of sessions) {
    if (!s.date.startsWith(prevYM)) continue;
    if (
      s.attendees.length === 1 &&
      s.attendees[0].id === hostId &&
      s.payerId !== hostId
    ) {
      continue;
    }
    for (const a of s.attendees) {
      const arr = playedDates.get(a.id) ?? [];
      arr.push(s.date);
      playedDates.set(a.id, arr);
    }
  }
  const daysBlock = [
    `Days played in ${MON_ABBR[prevMonth - 1]}:`,
    ...included.map(({ m, name }) => {
      const dates = [...new Set(playedDates.get(m.id) ?? [])].sort();
      return dates.length
        ? `${name} (${dates.length}): ${dates.map(shortDay).join(", ")}`
        : `${name}: 0`;
    }),
  ];

  const header = [
    `*${mon} month’s advance details:*`,
    `${weekdayCount} Weekdays (${base})`,
    `${saturdayCount} Saturdays (${satTotal})`,
    ...skipDows.map((d) => `${dowCount[d]} ${DOW_NAME[d]}s (${dowCount[d] * wrate})`),
  ];

  const balanceBlock = [
    `Balance amount till ${tillLabel}:`,
    ...lines.map((l) => `${l.name}: ${l.balance}`),
  ];

  const advanceBlock = [
    `Advance for ${mon}:`,
    ...lines.map((l) =>
      l.total <= 0
        ? `${l.name}: Already have enough for this month`
        : `${l.name}: ${l.expr} = ${l.total}`,
    ),
  ];

  const message = [
    header.join("\n"),
    balanceBlock.join("\n"),
    advanceBlock.join("\n"),
    daysBlock.join("\n"),
  ].join("\n\n");

  return { year, month, message, lines };
}

/**
 * Parse a month reference from free text for the chat, e.g. "July",
 * "Jul 2026", "2026-07", "next month", "this month". `now` is 'YYYY-MM-DD'
 * (passed in so this stays deterministic / testable). Returns {year, month}
 * or null if no month is found.
 */
export function parseMonthRef(
  text: string,
  now: string,
): { year: number; month: number } | null {
  const [ny, nm] = now.split("-").map(Number);
  const t = text.toLowerCase();

  if (/\bnext month\b/.test(t)) {
    return nm === 12 ? { year: ny + 1, month: 1 } : { year: ny, month: nm + 1 };
  }
  if (/\bthis month\b|\bcurrent month\b/.test(t)) {
    return { year: ny, month: nm };
  }

  const iso = t.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  if (iso) {
    const m = Number(iso[2]);
    if (m >= 1 && m <= 12) return { year: Number(iso[1]), month: m };
  }

  const MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  for (let i = 0; i < 12; i++) {
    const full = MONTHS[i];
    const abbr = full.slice(0, 3);
    const re = new RegExp(`\\b${full}\\b|\\b${abbr}\\b`);
    if (re.test(t)) {
      const yearMatch = t.match(/\b(20\d{2})\b/);
      return { year: yearMatch ? Number(yearMatch[1]) : ny, month: i + 1 };
    }
  }
  return null;
}
