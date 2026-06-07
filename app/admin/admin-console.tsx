"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { DayLog, PeopleTable, Panel, StatStrip } from "@/components/summary";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  addDays,
  dayTypeLabel,
  defaultRate,
  prettyDate,
  type Rates,
} from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { ActionResult, AdminData } from "@/lib/admin-types";
import {
  addPersonAction,
  logoutAction,
  removePersonAction,
  renamePersonAction,
  saveDayAction,
  setRatesAction,
  setStartDateAction,
} from "./actions";

interface Draft {
  amount: number;
  skipped: boolean;
  attendees: number[];
}

export function AdminConsole({
  initialData,
  today,
}: {
  initialData: AdminData;
  today: string;
}) {
  const [data, setData] = useState<AdminData>(initialData);
  const [cursor, setCursor] = useState<string>(today);
  const [busy, setBusy] = useState(false);

  const buildDraft = (date: string, d: AdminData): Draft => {
    const rec = d.days[date];
    if (rec) {
      return { amount: rec.amount, skipped: rec.skipped, attendees: [...rec.attendeeIds] };
    }
    return {
      amount: defaultRate(date, d.settings.rates),
      skipped: date.length > 0 && new Date(date + "T00:00").getDay() === 0,
      attendees: [],
    };
  };

  const [draft, setDraft] = useState<Draft>(() => buildDraft(today, initialData));

  // Reset the working draft whenever the cursor lands on a new day.
  useEffect(() => {
    setDraft(buildDraft(cursor, data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  async function run(p: Promise<ActionResult>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await p;
      setData(res.data);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return false;
      }
      return true;
    } catch {
      toast.error("Action failed. Are you still logged in?");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ----- day entry -----
  function toggleAttendee(id: number) {
    setDraft((d) => ({
      ...d,
      attendees: d.attendees.includes(id)
        ? d.attendees.filter((x) => x !== id)
        : [...d.attendees, id],
    }));
  }

  async function onDone() {
    if (!draft.skipped && draft.attendees.length === 0) {
      toast.error("Pick who played, or mark the day skipped.");
      return;
    }
    const ok = await run(
      saveDayAction({
        date: cursor,
        amount: draft.amount,
        attendeeIds: draft.skipped ? [] : draft.attendees,
        skipped: draft.skipped,
      }),
    );
    if (ok) {
      toast.success(draft.skipped ? "Day skipped." : "Day saved.");
      setCursor(addDays(cursor, 1));
    }
  }

  // ----- roster -----
  async function addPersonHandler() {
    const name = window.prompt("New player name:");
    if (name == null) return;
    if (await run(addPersonAction(name))) toast.success(`Added ${name.trim()}.`);
  }

  async function renameHandler(id: number, current: string) {
    const name = window.prompt("Rename player:", current);
    if (name == null || name.trim() === current) return;
    if (await run(renamePersonAction(id, name))) toast.success("Renamed.");
  }

  async function removeHandler(id: number, name: string) {
    if (!window.confirm(`Remove ${name}? This strips them from all past days.`)) return;
    if (await run(removePersonAction(id))) {
      setDraft((d) => ({ ...d, attendees: d.attendees.filter((x) => x !== id) }));
      toast.success(`Removed ${name}.`);
    }
  }

  const rec = data.days[cursor];
  const defAmount = defaultRate(cursor, data.settings.rates);

  return (
    <>
      <SiteHeader
        total={data.stats.total}
        right={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/chat"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "nb-press h-9 border-[3px] bg-lime font-bold text-ink hover:bg-lime-d",
              )}
            >
              💬 Chat
            </Link>
            <form action={logoutAction}>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="nb-press border-[3px] bg-paper-2 font-bold"
              >
                Log out
              </Button>
            </form>
          </div>
        }
      />

      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-5 px-4 py-6 sm:px-6 lg:grid-cols-2">
        {/* LEFT: day entry + roster + settings */}
        <div className="flex flex-col gap-5">
          {/* Day entry */}
          <Panel title="Day entry">
            <div className="flex items-center justify-between gap-2">
              <Button
                onClick={() => setCursor(addDays(cursor, -1))}
                variant="outline"
                className="nb-press border-[3px] bg-paper-2 px-3 font-bold"
                aria-label="Previous day"
              >
                ‹
              </Button>
              <div className="flex-1 text-center">
                <div className="money text-lg font-bold leading-tight">
                  {prettyDate(cursor)}
                </div>
                <span className="mt-1 inline-block rounded-full border-2 border-ink bg-court px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-paper">
                  {dayTypeLabel(cursor)}
                </span>
              </div>
              <Button
                onClick={() => setCursor(addDays(cursor, 1))}
                variant="outline"
                className="nb-press border-[3px] bg-paper-2 px-3 font-bold"
                aria-label="Next day"
              >
                ›
              </Button>
            </div>

            {rec && (
              <p className="mt-3 text-center text-xs font-bold uppercase tracking-widest text-court-2">
                {rec.skipped ? "Recorded · skipped" : "Recorded · editing"}
              </p>
            )}

            {/* Amount */}
            <div className="mt-4 flex items-end gap-3">
              <div className="flex-1">
                <Label
                  htmlFor="amount"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                >
                  Amount / person (₹)
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={Number.isFinite(draft.amount) ? draft.amount : 0}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, amount: Math.max(0, Math.floor(+e.target.value || 0)) }))
                  }
                  disabled={draft.skipped}
                  className="money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold disabled:opacity-50"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft((d) => ({ ...d, amount: defAmount }))}
                disabled={draft.skipped || draft.amount === defAmount}
                className="nb-press h-11 border-[3px] bg-paper-2 px-3 font-bold"
                title={`Reset to default (${formatINR(defAmount)})`}
              >
                ↺
              </Button>
            </div>

            {/* Roster chips */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wide">
                  Who played
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={draft.skipped}
                    onClick={() =>
                      setDraft((d) => ({ ...d, attendees: data.people.map((p) => p.id) }))
                    }
                    className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    disabled={draft.skipped}
                    onClick={() => setDraft((d) => ({ ...d, attendees: [] }))}
                    className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline disabled:opacity-40"
                  >
                    none
                  </button>
                </div>
              </div>

              {data.people.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No players yet — add some below.
                </p>
              ) : (
                <div className={cn("flex flex-wrap gap-2", draft.skipped && "opacity-40")}>
                  {data.people.map((p) => {
                    const on = draft.attendees.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={draft.skipped}
                        onClick={() => toggleAttendee(p.id)}
                        className={cn(
                          "nb-press rounded-[4px] border-[3px] border-ink px-3 py-1.5 text-sm font-bold",
                          on ? "bg-lime text-ink" : "bg-paper-2 text-ink/70",
                        )}
                      >
                        {on ? "✓ " : ""}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDraft((d) => ({ ...d, skipped: !d.skipped }))}
                className={cn(
                  "nb-press border-[3px] font-bold",
                  draft.skipped ? "bg-red text-paper" : "bg-paper-2",
                )}
              >
                ⏭ {draft.skipped ? "Skipped" : "Skip day"}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={onDone}
                className="nb-press flex-1 border-[3px] border-ink bg-lime font-bold text-ink hover:bg-lime-d"
              >
                ✓ Done — next day ›
              </Button>
            </div>
          </Panel>

          {/* Roster management */}
          <Panel
            title="Roster"
            action={
              <Button
                type="button"
                size="sm"
                onClick={addPersonHandler}
                disabled={busy}
                className="nb-press border-2 border-ink bg-lime text-xs font-bold text-ink hover:bg-lime-d"
              >
                + Add player
              </Button>
            }
          >
            {data.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No players on the roster.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.people.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2"
                  >
                    <span className="font-semibold">{p.name}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => renameHandler(p.id, p.name)}
                        disabled={busy}
                        className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline"
                      >
                        rename
                      </button>
                      <button
                        type="button"
                        onClick={() => removeHandler(p.id, p.name)}
                        disabled={busy}
                        className="text-xs font-bold uppercase tracking-wide text-red underline-offset-2 hover:underline"
                      >
                        remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <SettingsForm
            settings={data.settings}
            busy={busy}
            onSaveRates={(r) => run(setRatesAction(r))}
            onSaveStart={(d) => run(setStartDateAction(d))}
          />
        </div>

        {/* RIGHT: live summary */}
        <div className="flex flex-col gap-5">
          <StatStrip stats={data.stats} />
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
            <PeopleTable summary={data.summary} />
          </Panel>
          <Panel title="Recorded days">
            <DayLog log={data.log} onDayClick={setCursor} activeDate={cursor} />
          </Panel>
        </div>
      </main>
    </>
  );
}

function SettingsForm({
  settings,
  busy,
  onSaveRates,
  onSaveStart,
}: {
  settings: AdminData["settings"];
  busy: boolean;
  onSaveRates: (r: Rates) => Promise<boolean>;
  onSaveStart: (d: string) => Promise<boolean>;
}) {
  const [weekday, setWeekday] = useState(String(settings.rates.weekday));
  const [saturday, setSaturday] = useState(String(settings.rates.saturday));
  const [sunday, setSunday] = useState(String(settings.rates.sunday));
  const [start, setStart] = useState(settings.startDate);

  async function save() {
    const okR = await onSaveRates({
      weekday: Math.max(0, Math.floor(+weekday || 0)),
      saturday: Math.max(0, Math.floor(+saturday || 0)),
      sunday: Math.max(0, Math.floor(+sunday || 0)),
    });
    const okS = await onSaveStart(start);
    if (okR && okS) toast.success("Settings saved.");
  }

  const field =
    "money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold";

  return (
    <Panel title="Rates & settings">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Weekday", v: weekday, set: setWeekday },
          { label: "Saturday", v: saturday, set: setSaturday },
          { label: "Sunday", v: sunday, set: setSunday },
        ].map((f) => (
          <div key={f.label}>
            <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
              {f.label} ₹
            </Label>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={f.v}
              onChange={(e) => f.set(e.target.value)}
              className={field}
            />
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
          Start date
        </Label>
        <Input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={field}
        />
      </div>

      <Button
        type="button"
        onClick={save}
        disabled={busy}
        className="nb-press mt-4 w-full border-[3px] border-ink bg-court font-bold text-paper hover:bg-court-2"
      >
        Save settings
      </Button>
    </Panel>
  );
}
