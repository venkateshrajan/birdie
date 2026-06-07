import { getLedger } from "@/lib/ledger";
import { weekdayName } from "@/lib/dates";
import { getSessionUser } from "@/lib/session";

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
  // Members only — the ledger is no longer public.
  if (!(await getSessionUser())) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { log, summary } = await getLedger();

  const lines: string[] = [];

  // Per-session block (one row per Splitwise expense)
  lines.push(row(["Date", "Day", "Rate", "Players", "Session total", "Names"]));
  for (const d of log) {
    lines.push(
      row([
        d.date,
        weekdayName(d.date),
        d.amount,
        d.count,
        d.dayTotal,
        d.names.join(", "),
      ]),
    );
  }

  // Spacer + per-person net-balance block
  lines.push("");
  lines.push(row(["Player", "Sessions", "Net owed"]));
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
