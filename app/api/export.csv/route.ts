import { getLog, getSummary } from "@/lib/queries";
import { weekdayName } from "@/lib/dates";

export const dynamic = "force-dynamic";

function esc(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number)[]): string {
  return cells.map(esc).join(",");
}

export async function GET() {
  const log = getLog();
  const summary = getSummary();

  const lines: string[] = [];

  // Per-day block
  lines.push(row(["Date", "Day", "Status", "Rate", "Players", "Day total", "Names"]));
  for (const d of log) {
    lines.push(
      row([
        d.date,
        weekdayName(d.date),
        d.skipped ? "Skipped" : "Played",
        d.skipped ? 0 : d.amount,
        d.count,
        d.dayTotal,
        d.names.join(", "),
      ]),
    );
  }

  // Spacer + per-person summary block
  lines.push("");
  lines.push(row(["Player", "Days played", "Amount owed"]));
  for (const p of summary) {
    lines.push(row([p.name, p.days, p.owed]));
  }

  const csv = lines.join("\n") + "\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="birdie-ledger.csv"',
    },
  });
}
