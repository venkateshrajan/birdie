"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  generateAdvanceAction,
  logoutAction,
  readScreenshotAction,
  saveAdvanceConfigAction,
  setNicknameAction,
  setRatesAction,
  updateSessionAction,
} from "./actions";
import {
  DEFAULT_ADVANCE_MEMBER_CFG,
  type AdvanceConfig,
  type AdvanceMemberCfg,
  type AdminMember,
} from "@/lib/admin-types";

/** Downscale an image file to a small JPEG (keeps Server Action payloads well
 *  under the 1MB limit and trims vision tokens). Returns base64 (no data URL
 *  prefix). */
async function downscaleToBase64(
  file: File,
  maxEdge = 1280,
  quality = 0.85,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
}

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
  screenshotEnabled,
}: {
  initialData: AdminData;
  today: string;
  screenshotEnabled: boolean;
}) {
  const [data, setData] = useState<AdminData>(initialData);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function onScreenshot(file: File | undefined | null) {
    if (!file) return;
    setReading(true);
    try {
      const base64 = await downscaleToBase64(file);
      if (!base64) throw new Error("Could not read that image.");
      const res = await readScreenshotAction(base64, "image/jpeg");
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't read the screenshot.");
        return;
      }
      // Merge into the current selection (host already excluded server-side),
      // so multiple screenshots for the same day accumulate. Review, then Add.
      setForm((f) => ({
        ...f,
        attendees: [...new Set([...f.attendees, ...res.matchedMemberIds])],
      }));
      const n = res.matchedMemberIds.length;
      if (n === 0 && res.unmatchedNames.length === 0) {
        toast.error("No players found in that screenshot.");
      } else {
        let msg = `Selected ${n} player${n === 1 ? "" : "s"} — review and add.`;
        if (res.unmatchedNames.length) {
          msg += ` Couldn't match: ${res.unmatchedNames.join(", ")}.`;
        }
        toast.success(msg);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read the screenshot.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

            {/* Date + amount (stacked so they never overlap on narrow screens) */}
            <div className="flex flex-col gap-3">
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
                <div className="flex items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onScreenshot(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={!screenshotEnabled || busy || reading}
                    title={
                      screenshotEnabled
                        ? "Read players from a Playo screenshot (you are excluded)"
                        : "Coming soon — reads players from a Playo screenshot. Needs ANTHROPIC_API_KEY set on the server."
                    }
                    className="rounded-[4px] border-2 border-ink bg-lime px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reading ? "📷 reading…" : "📷 screenshot"}
                  </button>
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

          <AdvancePanel today={today} />

          <AdvanceSettings
            members={data.members}
            meId={data.meId}
            config={data.advanceConfig}
            busy={busy}
            onSave={(c) => run(saveAdvanceConfigAction(c))}
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

function AdvancePanel({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await generateAdvanceAction(month);
      if (res.ok && res.message) setMessage(res.message);
      else toast.error(res.error ?? "Could not generate the advance.");
    } catch {
      toast.error("Action failed. Are you still logged in?");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  }

  return (
    <Panel title="Monthly advance">
      <p className="mb-3 text-xs text-muted-foreground">
        Computes balances up to the end of the previous month and the month’s
        charge, then drafts the group message.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
            Month
          </Label>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold"
          />
        </div>
        <Button
          type="button"
          onClick={generate}
          disabled={busy}
          className="nb-press h-11 border-[3px] border-ink bg-lime font-bold text-ink hover:bg-lime-d"
        >
          Generate
        </Button>
      </div>
      {message && (
        <div className="mt-3">
          <textarea
            readOnly
            value={message}
            rows={message.split("\n").length + 1}
            className="money nb-sm w-full resize-y border-[3px] bg-paper-2 p-3 text-sm"
          />
          <Button
            type="button"
            onClick={copy}
            className="nb-press mt-2 w-full border-[3px] border-ink bg-court font-bold text-paper hover:bg-court-2"
          >
            Copy message
          </Button>
        </div>
      )}
    </Panel>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"]; // index 0..4

function AdvanceSettings({
  members,
  meId,
  config,
  busy,
  onSave,
}: {
  members: AdminMember[];
  meId: number;
  config: AdvanceConfig;
  busy: boolean;
  onSave: (c: AdvanceConfig) => Promise<boolean>;
}) {
  const [cfg, setCfg] = useState<AdvanceConfig>(config);

  const memberCfg = (id: number): AdvanceMemberCfg =>
    cfg.members[String(id)] ?? DEFAULT_ADVANCE_MEMBER_CFG;

  function update(id: number, patch: Partial<AdvanceMemberCfg>) {
    setCfg((c) => ({
      members: { ...c.members, [String(id)]: { ...memberCfg(id), ...patch } },
    }));
  }

  function toggleSkip(id: number, dow: number) {
    const cur = memberCfg(id);
    update(id, {
      skipDows: cur.skipDows.includes(dow)
        ? cur.skipDows.filter((d) => d !== dow)
        : [...cur.skipDows, dow],
    });
  }

  async function save() {
    if (await onSave(cfg)) toast.success("Advance settings saved.");
  }

  const list = members.filter((m) => m.id !== meId); // host doesn't pay an advance

  return (
    <Panel
      title="Advance settings"
      action={
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={busy}
          className="nb-press border-2 border-ink bg-lime text-xs font-bold text-ink hover:bg-lime-d"
        >
          Save
        </Button>
      }
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Who pays a monthly advance, who’s a Saturday regular, and any weekdays
        they skip. Weekday/Saturday rates come from “Default rates”.
      </p>
      <ul className="flex flex-col gap-2">
        {list.map((m) => {
          const c = memberCfg(m.id);
          return (
            <li
              key={m.id}
              className="rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={c.include}
                    onChange={(e) => update(m.id, { include: e.target.checked })}
                  />
                  {m.name}
                </label>
                <label
                  className={cn(
                    "flex items-center gap-1 text-xs font-bold uppercase tracking-wide",
                    !c.include && "opacity-40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={c.saturdayRegular}
                    disabled={!c.include}
                    onChange={(e) =>
                      update(m.id, { saturdayRegular: e.target.checked })
                    }
                  />
                  Saturdays
                </label>
              </div>
              {c.include && (
                <div className="mt-2 flex items-center gap-1">
                  <span className="mr-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    skips
                  </span>
                  {WEEKDAY_LABELS.map((lbl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleSkip(m.id, i)}
                      className={cn(
                        "rounded-[3px] border-2 border-ink px-2 py-0.5 text-xs font-bold",
                        c.skipDows.includes(i)
                          ? "bg-red text-paper"
                          : "bg-paper text-ink/60",
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
