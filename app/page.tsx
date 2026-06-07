import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { DayLog, PeopleTable, Panel, StatStrip } from "@/components/summary";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getLog, getStats, getSummary } from "@/lib/queries";

// Always reflect the latest data — this is a tiny single-node app.
export const dynamic = "force-dynamic";

export default function PublicDashboard() {
  const stats = getStats();
  const summary = getSummary();
  const log = getLog();

  return (
    <>
      <SiteHeader
        total={stats.total}
        right={
          <Link
            href="/admin/login"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "nb-press h-9 border-[3px] bg-paper-2 font-bold text-ink",
            )}
          >
            Admin
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="nb-sm mb-5 flex items-center gap-2 bg-court-2 px-4 py-2 text-paper">
          <span className="inline-block h-2 w-2 rounded-full bg-lime" />
          <span className="text-xs font-bold uppercase tracking-widest">
            Viewing as guest · read-only
          </span>
        </div>

        <div className="mb-5">
          <StatStrip stats={stats} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel
            title="Who owes what"
            action={
              <a
                href="/api/export.csv"
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "nb-press h-8 border-2 bg-paper-2 text-xs font-bold text-ink",
                )}
              >
                Export CSV
              </a>
            }
          >
            <PeopleTable summary={summary} />
          </Panel>

          <Panel title="Recorded days">
            <DayLog log={log} />
          </Panel>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 pt-2 text-center text-xs text-muted-foreground sm:px-6">
        Birdie · badminton court-dues ledger
      </footer>
    </>
  );
}
