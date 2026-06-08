"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/summary";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { shortDay } from "@/lib/dates";

const MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_ABBR[m - 1] ?? ym} ${y}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
  } catch {
    toast.error("Couldn't copy — select and copy manually.");
  }
}

function CopyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nb-press h-8 rounded-[4px] border-2 border-ink bg-paper-2 px-2 text-xs font-bold text-ink hover:bg-lime/40"
    >
      Copy
    </button>
  );
}

export interface PlaySession {
  date: string; // YYYY-MM-DD
  attendeeIds: number[];
}
export interface PlayMember {
  id: number;
  name: string;
}

/**
 * "Play days" view. In member mode (allowPickPlayer = false) it shows the
 * logged-in member's own days for a chosen month. In admin mode it adds a
 * player dropdown. Either way it also shows the short-form per-player breakdown
 * (count + dates) for the month. All filtering is client-side.
 */
export function PlayDays({
  sessions,
  members,
  currentMonth,
  meId,
  allowPickPlayer = false,
  showCopy = false,
}: {
  sessions: PlaySession[];
  members: PlayMember[];
  currentMonth: string; // YYYY-MM
  meId?: number;
  allowPickPlayer?: boolean;
  showCopy?: boolean;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [picked, setPicked] = useState<number | "">(allowPickPlayer ? "" : (meId ?? ""));

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  const monthSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.date.startsWith(month))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [sessions, month],
  );

  const selectedId = allowPickPlayer ? picked : meId;
  const myDates = useMemo(() => {
    if (selectedId === "" || selectedId == null) return [];
    return monthSessions
      .filter((s) => s.attendeeIds.includes(selectedId))
      .map((s) => s.date);
  }, [monthSessions, selectedId]);

  const breakdown = useMemo(() => {
    const byId = new Map<number, string[]>();
    for (const s of monthSessions) {
      for (const id of s.attendeeIds) {
        const arr = byId.get(id) ?? [];
        arr.push(s.date);
        byId.set(id, arr);
      }
    }
    return [...byId.entries()]
      .map(([id, dates]) => ({ id, name: nameById.get(id) ?? `#${id}`, dates }))
      .sort((a, b) => b.dates.length - a.dates.length || a.name.localeCompare(b.name));
  }, [monthSessions, nameById]);

  const selectedName =
    allowPickPlayer && picked !== "" ? nameById.get(picked) : undefined;

  function copyOnePlayer() {
    const who = selectedName ?? "You";
    const body = myDates.length
      ? myDates.map(shortDay).join(", ")
      : "no games this month";
    copyText(`${who} — ${monthLabel(month)} (${myDates.length})\n${body}`);
  }

  function copyEveryone() {
    const body = breakdown.length
      ? breakdown
          .map((p) => `${p.name} (${p.dates.length}): ${p.dates.map(shortDay).join(", ")}`)
          .join("\n")
      : "no games this month";
    copyText(`Days played — ${monthLabel(month)}\n${body}`);
  }

  const canCopyOne = showCopy && (allowPickPlayer ? picked !== "" : true);

  return (
    <>
      <Panel
        title="Play days"
        action={canCopyOne ? <CopyButton onClick={copyOnePlayer} /> : undefined}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
              Month
            </Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonth)}
              className="money nb-sm h-11 border-[3px] bg-paper-2 text-base font-bold"
            />
          </div>
          {allowPickPlayer && (
            <div className="flex-1">
              <Label className="mb-1 block text-xs font-bold uppercase tracking-wide">
                Player
              </Label>
              <select
                value={picked}
                onChange={(e) =>
                  setPicked(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="money nb-sm h-11 w-full border-[3px] border-ink bg-paper-2 px-2 text-base font-bold"
              >
                <option value="">— select —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {allowPickPlayer && picked === "" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Pick a player to see their days.
          </p>
        ) : (
          <div className="mt-4">
            <p className="text-sm font-bold">
              {selectedName ? `${selectedName}’s` : "Your"} days ·{" "}
              <span className="text-court-2">{myDates.length}</span>
            </p>
            {myDates.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                No games this month.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {myDates.map((d) => (
                  <span
                    key={d}
                    className="money rounded-[3px] border-2 border-ink bg-lime px-2 py-0.5 text-xs font-bold text-ink"
                  >
                    {shortDay(d)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title="Days played · everyone"
        action={showCopy ? <CopyButton onClick={copyEveryone} /> : undefined}
      >
        {breakdown.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No games this month.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {breakdown.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "rounded-[3px] border-2 border-ink/20 bg-paper-2 px-3 py-2",
                  p.id === meId && "border-ink bg-lime/30",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {p.name}
                    {p.id === meId && (
                      <span className="ml-2 text-xs font-bold uppercase tracking-wide text-court-2">
                        you
                      </span>
                    )}
                  </span>
                  <span className="money text-sm font-bold">{p.dates.length}</span>
                </div>
                <div className="money mt-1 text-xs text-muted-foreground">
                  {p.dates.map(shortDay).join(", ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
