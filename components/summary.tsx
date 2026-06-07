import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LogRow, Stats, SummaryRow } from "@/lib/queries";
import { formatINR, formatNum } from "@/lib/format";
import { prettyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function StatStrip({ stats }: { stats: Stats }) {
  const items = [
    { label: "Game days", value: formatNum(stats.gameDays) },
    { label: "Head-count", value: formatNum(stats.headCount) },
    { label: "Collectable", value: formatINR(stats.total) },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.label} className="nb-sm bg-paper-2 px-3 py-3 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {it.label}
          </div>
          <div className="money mt-1 text-xl font-bold sm:text-2xl">{it.value}</div>
        </div>
      ))}
    </div>
  );
}

export function PeopleTable({ summary }: { summary: SummaryRow[] }) {
  if (summary.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No one owes anything yet.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-b-[3px] border-ink hover:bg-transparent">
          <TableHead className="font-bold uppercase tracking-wide text-ink">
            Player
          </TableHead>
          <TableHead className="text-center font-bold uppercase tracking-wide text-ink">
            Days
          </TableHead>
          <TableHead className="text-right font-bold uppercase tracking-wide text-ink">
            Owes
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.map((row) => (
          <TableRow key={row.id} className="border-ink/15">
            <TableCell className="font-semibold">{row.name}</TableCell>
            <TableCell className="money text-center">{row.days}</TableCell>
            <TableCell className="money text-right text-base font-bold">
              {formatINR(row.owed)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DayLog({
  log,
  onDayClick,
  activeDate,
}: {
  log: LogRow[];
  onDayClick?: (date: string) => void;
  activeDate?: string;
}) {
  if (log.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No days recorded yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {log.map((d) => {
        const clickable = !!onDayClick;
        return (
          <li key={d.date}>
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onDayClick!(d.date) : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2 text-left",
                clickable && "nb-press cursor-pointer hover:border-ink hover:bg-lime/30",
                activeDate === d.date && "border-ink bg-lime/40",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="money text-sm font-bold">{prettyDate(d.date)}</span>
                  {d.synced && (
                    <span className="rounded-full border-2 border-court bg-court/10 px-2 py-px text-[9px] font-bold uppercase tracking-wider text-court-2">
                      ✓ Splitwise
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.skipped ? (
                    <span className="font-semibold text-red">Skipped</span>
                  ) : (
                    <>
                      {d.count} played · {formatINR(d.amount)} each
                      {d.names.length > 0 && <> · {d.names.join(", ")}</>}
                    </>
                  )}
                </div>
              </div>
              <div className="money shrink-0 text-base font-bold">
                {d.skipped ? "—" : formatINR(d.dayTotal)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Panel({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("nb bg-card p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="display text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
