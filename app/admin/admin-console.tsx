"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { PeopleTable, Panel, StatStrip } from "@/components/summary";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { dayTypeLabel, defaultRate, prettyDate, type Rates } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { ActionResult, AdminData } from "@/lib/admin-types";
import {
  createSessionAction,
  deleteSessionAction,
  logoutAction,
  setNicknameAction,
  setRatesAction,
  updateSessionAction,
} from "./actions";

const MAX_SESSIONS_SHOWN = 60;

interface Form {
  date: string;
  perHead: number;
  payerId: number;
  attendees: number[];
  editingExpenseId: number | null;
}

export function AdminConsole({
  initialData,
  today,
}: {
  initialData: AdminData;
  today: string;
}) {
  const [data, setData] = useState<AdminData>(initialData);
  const [busy, setBusy] = useState(false);

  const freshForm = (date: string): Form => ({
    date,
    perHead: defaultRate(date, data.rates),
    payerId: data.meId,
    attendees: [],
    editingExpenseId: null,
  });

  const [form, setForm] = useState<Form>(() => ({
    date: today,
    perHead: defaultRate(today, initialData.rates),
    payerId: initialData.meId,
    attendees: [],
    editingExpenseId: null,
  }));

  // When the date changes during fresh entry, follow the rate for that day.
  useEffect(() => {
    if (form.editingExpenseId === null) {
      setForm((f) => ({ ...f, perHead: defaultRate(f.date, data.rates) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date]);

  const memberName = useMemo(
    () => new Map(data.members.map((m) => [m.id, m.name])),
    [data.members],
  );
  const editing = form.editingExpenseId !== null;
  const defAmount = defaultRate(form.date, data.rates);

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

  function toggleAttendee(id: number) {
    setForm((f) => ({
      ...f,
      attendees: f.attendees.includes(id)
        ? f.attendees.filter((x) => x !== id)
        : [...f.attendees, id],
    }));
  }

  function describe(attendeeIds: number[]): string {
    return attendeeIds.map((id) => memberName.get(id) ?? `#${id}`).join(", ");
  }

  async function onSubmit() {
    if (form.attendees.length === 0) {
      toast.error("Pick who played.");
      return;
    }
    const payload = {
      date: form.date,
      attendeeIds: form.attendees,
      perHead: form.perHead,
      payerId: form.payerId,
      description: describe(form.attendees),
    };
    const ok = await run(
      editing
        ? updateSessionAction(form.editingExpenseId!, payload)
        : createSessionAction(payload),
    );
    if (ok) {
      toast.success(editing ? "Session updated." : "Session added.");
      setForm(freshForm(form.date));
    }
  }

  function editSession(expenseId: number) {
    const s = data.sessions.find((x) => x.expenseId === expenseId);
    if (!s) return;
    setForm({
      date: s.date,
      perHead: s.perHead,
      payerId: s.payerId ?? data.meId,
      attendees: [...s.attendeeIds],
      editingExpenseId: s.expenseId,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteSession(expenseId: number, label: string) {
    if (!window.confirm(`Delete the session on ${label}? This removes the Splitwise expense.`))
      return;
    if (await run(deleteSessionAction(expenseId))) {
      if (form.editingExpenseId === expenseId) setForm(freshForm(today));
      toast.success("Session deleted.");
    }
  }

  async function editNickname(memberId: number, fullName: string, current: string | null) {
    const next = window.prompt(`Nickname for ${fullName} (blank to clear):`, current ?? "");
    if (next === null) return;
    if (await run(setNicknameAction(memberId, next))) toast.success("Nickname saved.");
  }

  const shown = data.sessions.slice(0, MAX_SESSIONS_SHOWN);

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
        {/* LEFT: session entry + roster + rates */}
        <div className="flex flex-col gap-5">
          <Panel title={editing ? "Edit session" : "New session"}>
            {editing && (
              <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-court-2">
                Editing expense #{form.editingExpenseId}
              </p>
            )}

            {/* Date + amount */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
                  Date
                </Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value || today }))
                  }
                  className="money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold"
                />
                <span className="mt-1 inline-block rounded-full border-2 border-ink bg-court px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-paper">
                  {dayTypeLabel(form.date)}
                </span>
              </div>
              <div>
                <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
                  ₹ / person
                </Label>
                <div className="flex items-end gap-2">
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={Number.isFinite(form.perHead) ? form.perHead : 0}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        perHead: Math.max(0, Math.floor(+e.target.value || 0)),
                      }))
                    }
                    className="money nb-sm h-11 w-28 border-[3px] bg-paper-2 text-base font-bold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForm((f) => ({ ...f, perHead: defAmount }))}
                    disabled={form.perHead === defAmount}
                    className="nb-press h-11 border-[3px] bg-paper-2 px-3 font-bold"
                    title={`Reset to ${formatINR(defAmount)}`}
                  >
                    ↺
                  </Button>
                </div>
              </div>
            </div>

            {/* Payer */}
            <div className="mt-4">
              <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
                Paid by
              </Label>
              <select
                value={form.payerId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payerId: Number(e.target.value) }))
                }
                className="money nb-sm h-11 w-full border-[3px] border-ink bg-paper-2 px-2 text-base font-bold"
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === data.meId ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Attendees */}
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wide">
                  Who played
                </Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, attendees: data.members.map((m) => m.id) }))
                    }
                    className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline"
                  >
                    all
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, attendees: [] }))}
                    className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline"
                  >
                    none
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.members.map((m) => {
                  const on = form.attendees.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleAttendee(m.id)}
                      className={cn(
                        "nb-press rounded-[4px] border-[3px] border-ink px-3 py-1.5 text-sm font-bold",
                        on ? "bg-lime text-ink" : "bg-paper-2 text-ink/70",
                      )}
                    >
                      {on ? "✓ " : ""}
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Total preview */}
            <p className="mt-4 text-sm font-bold text-muted-foreground">
              {form.attendees.length} playing ·{" "}
              {formatINR(form.perHead * form.attendees.length)} total
            </p>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-3">
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setForm(freshForm(today))}
                  className="nb-press border-[3px] bg-paper-2 font-bold"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                disabled={busy}
                onClick={onSubmit}
                className="nb-press flex-1 border-[3px] border-ink bg-lime font-bold text-ink hover:bg-lime-d"
              >
                {editing ? "✓ Update session" : "✓ Add session"}
              </Button>
            </div>
          </Panel>

          {/* Roster & nicknames */}
          <Panel title="Roster & nicknames">
            <p className="mb-3 text-xs text-muted-foreground">
              Members come from the Splitwise group. Nicknames only change how
              names show in Birdie.
            </p>
            <ul className="flex flex-col gap-2">
              {data.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-semibold">{m.name}</span>
                    {m.nickname && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({m.fullName})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => editNickname(m.id, m.fullName, m.nickname)}
                    disabled={busy}
                    className="shrink-0 text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline"
                  >
                    nickname
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <RatesForm
            rates={data.rates}
            busy={busy}
            onSave={(r) => run(setRatesAction(r))}
          />
        </div>

        {/* RIGHT: live summary + sessions */}
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

          <Panel
            title="Sessions"
            action={
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {data.sessions.length > MAX_SESSIONS_SHOWN
                  ? `${MAX_SESSIONS_SHOWN} of ${data.sessions.length}`
                  : `${data.sessions.length}`}
              </span>
            }
          >
            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sessions yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shown.map((s) => {
                  const active = form.editingExpenseId === s.expenseId;
                  return (
                    <li
                      key={s.expenseId}
                      className={cn(
                        "rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2",
                        active && "border-ink bg-lime/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="money text-sm font-bold">
                          {prettyDate(s.date)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="money text-sm font-bold">
                            {formatINR(s.total)}
                          </span>
                          <button
                            type="button"
                            onClick={() => editSession(s.expenseId)}
                            disabled={busy}
                            className="text-xs font-bold uppercase tracking-wide underline-offset-2 hover:underline"
                          >
                            edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSession(s.expenseId, prettyDate(s.date))}
                            disabled={busy}
                            className="text-xs font-bold uppercase tracking-wide text-red underline-offset-2 hover:underline"
                          >
                            delete
                          </button>
                        </div>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {s.attendeeIds.length} played · {formatINR(s.perHead)} each
                        {s.names.length > 0 && <> · {s.names.join(", ")}</>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </main>
    </>
  );
}

function RatesForm({
  rates,
  busy,
  onSave,
}: {
  rates: Rates;
  busy: boolean;
  onSave: (r: Rates) => Promise<boolean>;
}) {
  const [weekday, setWeekday] = useState(String(rates.weekday));
  const [saturday, setSaturday] = useState(String(rates.saturday));
  const [sunday, setSunday] = useState(String(rates.sunday));

  async function save() {
    const ok = await onSave({
      weekday: Math.max(0, Math.floor(+weekday || 0)),
      saturday: Math.max(0, Math.floor(+saturday || 0)),
      sunday: Math.max(0, Math.floor(+sunday || 0)),
    });
    if (ok) toast.success("Rates saved.");
  }

  const field = "money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold";

  return (
    <Panel title="Default rates">
      <p className="mb-3 text-xs text-muted-foreground">
        Used to pre-fill ₹/person when adding a session. Stored locally.
      </p>
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
      <Button
        type="button"
        onClick={save}
        disabled={busy}
        className="nb-press mt-4 w-full border-[3px] border-ink bg-court font-bold text-paper hover:bg-court-2"
      >
        Save rates
      </Button>
    </Panel>
  );
}
