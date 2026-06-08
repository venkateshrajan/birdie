// All dates are handled as 'YYYY-MM-DD' strings built from LOCAL parts.
// We never use `new Date('YYYY-MM-DD')` (which parses as UTC and shifts the day
// in negative-offset timezones). Build Date objects from local components instead.

export type DayType = "sunday" | "saturday" | "weekday";

export interface Rates {
  weekday: number;
  saturday: number;
  sunday: number;
}

/** Today's date in the server's local timezone as 'YYYY-MM-DD'. */
export function todayStr(): string {
  return formatYMD(new Date());
}

/** Format a Date (using local parts) as 'YYYY-MM-DD'. */
export function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse 'YYYY-MM-DD' into a local-midnight Date. */
export function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Add (or subtract) calendar days, returning 'YYYY-MM-DD'. */
export function addDays(s: string, n: number): string {
  const d = parseLocal(s);
  d.setDate(d.getDate() + n);
  return formatYMD(d);
}

export function dayType(s: string): DayType {
  const dow = parseLocal(s).getDay(); // 0 = Sun, 6 = Sat
  if (dow === 0) return "sunday";
  if (dow === 6) return "saturday";
  return "weekday";
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayName(s: string): string {
  return WEEKDAY_NAMES[parseLocal(s).getDay()];
}

export function dayTypeLabel(s: string): string {
  const t = dayType(s);
  if (t === "sunday") return "Sunday";
  if (t === "saturday") return "Saturday";
  return "Weekday";
}

/** Default per-person amount for a date, given the configured rates. */
export function defaultRate(s: string, rates: Rates): number {
  const t = dayType(s);
  if (t === "sunday") return rates.sunday;
  if (t === "saturday") return rates.saturday;
  return rates.weekday;
}

/** Pretty 'Mon, 7 Jun 2026' style for display. */
export function prettyDate(s: string): string {
  const d = parseLocal(s);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][d.getMonth()];
  return `${wd}, ${d.getDate()} ${mon} ${d.getFullYear()}`;
}

/** Compact 'Tue 3' (weekday + day-of-month) for month-scoped lists. */
export function shortDay(s: string): string {
  const d = parseLocal(s);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${wd} ${d.getDate()}`;
}
