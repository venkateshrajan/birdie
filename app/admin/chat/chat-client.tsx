"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clearChatAction } from "../actions";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const TOOL_LABEL: Record<string, string> = {
  list_groups: "looking up the group",
  get_group: "reading group members",
  list_expenses: "checking existing expenses",
  get_expense: "inspecting an expense",
  get_current_user: "checking the payer account",
  list_currencies: "checking currencies",
  create_expense: "creating an expense",
  update_expense: "updating an expense",
};

function prettyTool(name: string): string {
  const short = name.replace(/^mcp__splitwise__/, "");
  return TOOL_LABEL[short] ?? short;
}

export function ChatClient({
  initialMessages,
  group,
  keyConfigured,
}: {
  initialMessages: Msg[];
  group: string;
  keyConfigured: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, liveText, activity]);

  async function send(mode: "ask" | "push") {
    if (busy) return;
    const text =
      mode === "push"
        ? input.trim() ||
          `Confirm: create or update the Splitwise expenses for the game days that aren't synced yet, in the "${group}" group. Use exact splits among each day's attendees.`
        : input.trim();
    if (!text) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    setLiveText("");
    setActivity(mode === "push" ? ["Pushing to Splitwise…"] : []);

    let acc = "";
    const act: string[] = mode === "push" ? ["Pushing to Splitwise…"] : [];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, mode }),
      });
      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? "Session expired — log in again." : `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (!chunk.startsWith("data: ")) continue;
          const ev = JSON.parse(chunk.slice(6));
          if (ev.type === "text") {
            acc += ev.text;
            setLiveText(acc);
          } else if (ev.type === "tool") {
            act.push(`· ${prettyTool(ev.name)}`);
            setActivity([...act]);
          } else if (ev.type === "synced") {
            act.push(`✓ synced ${ev.date} → Splitwise #${ev.expenseId}`);
            setActivity([...act]);
            toast.success(`Synced ${ev.date} (expense #${ev.expenseId})`);
            router.refresh();
          } else if (ev.type === "error") {
            act.push(`⚠ ${ev.text}`);
            setActivity([...act]);
            toast.error(ev.text);
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed.");
      act.push(`⚠ ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      const finalText = acc.trim() || (act.length ? act.join("\n") : "(no response)");
      setMessages((m) => [...m, { role: "assistant", content: finalText }]);
      setLiveText("");
      setActivity([]);
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!window.confirm("Clear the whole conversation?")) return;
    await clearChatAction();
    setMessages([]);
    toast.success("Chat cleared.");
    router.refresh();
  }

  return (
    <div className="flex min-h-[70vh] flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="display text-2xl">Assistant</h1>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Splitwise group · {group}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-bold uppercase tracking-wide text-red underline-offset-2 hover:underline"
          >
            Clear chat
          </button>
        )}
      </div>

      {!keyConfigured && (
        <div className="nb-sm mb-3 bg-red px-3 py-2 text-sm font-bold text-paper">
          SPLITWISE_API_KEY isn’t set — you can ask questions, but pushing to Splitwise
          will fail until you add the key to the environment.
        </div>
      )}

      <div
        ref={scrollRef}
        className="nb mb-3 flex-1 space-y-3 overflow-y-auto bg-card p-4"
      >
        {messages.length === 0 && !busy && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Ask about who owes what, or have me draft the Splitwise expenses.
            <br />
            I only read until you press{" "}
            <span className="font-bold text-ink">Confirm &amp; push</span>.
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
        ))}

        {busy && (
          <div className="flex flex-col gap-2">
            {liveText && <Bubble role="assistant" content={liveText} />}
            {activity.length > 0 && (
              <ul className="ml-1 space-y-1">
                {activity.map((a, i) => (
                  <li
                    key={i}
                    className={cn(
                      "money text-xs",
                      a.startsWith("✓") && "text-court-2 font-bold",
                      a.startsWith("⚠") && "text-red font-bold",
                      !a.startsWith("✓") && !a.startsWith("⚠") && "text-muted-foreground",
                    )}
                  >
                    {a}
                  </li>
                ))}
              </ul>
            )}
            {!liveText && <span className="text-xs text-muted-foreground">thinking…</span>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send("ask");
              }
            }}
            placeholder="Ask a question…"
            className="nb-sm h-12 flex-1 border-[3px] bg-paper-2 text-base"
          />
          <Button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => send("ask")}
            className="nb-press h-12 border-[3px] border-ink bg-paper-2 px-5 font-bold text-ink hover:bg-muted"
          >
            Ask
          </Button>
        </div>
        <Button
          type="button"
          disabled={busy || !keyConfigured}
          onClick={() => send("push")}
          className="nb-press h-12 border-[3px] border-ink bg-lime font-bold text-ink hover:bg-lime-d"
          title={keyConfigured ? "" : "Set SPLITWISE_API_KEY first"}
        >
          ✓ Confirm &amp; push to Splitwise
        </Button>
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-[4px] border-[3px] border-ink px-3 py-2 text-sm",
          isUser ? "bg-court text-paper" : "bg-paper-2 text-ink",
        )}
      >
        {content}
      </div>
    </div>
  );
}
