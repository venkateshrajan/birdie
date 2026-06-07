import "server-only";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { splitwiseApiKey, splitwiseGroupName } from "./env";
import { getLedger } from "./ledger";
import { dayTypeLabel } from "./dates";

// MCP tool names follow `mcp__<server>__<tool>`. Our server key is "splitwise".
const READ_TOOLS = [
  "mcp__splitwise__get_current_user",
  "mcp__splitwise__list_currencies",
  "mcp__splitwise__list_groups",
  "mcp__splitwise__get_group",
  "mcp__splitwise__list_expenses",
  "mcp__splitwise__get_expense",
];
const WRITE_TOOLS = [
  "mcp__splitwise__create_expense",
  "mcp__splitwise__update_expense",
];
// Note: delete_expense and create_payment are intentionally never allowed.

const PROJECT_ROOT = process.cwd();
const VENV_PYTHON = join(PROJECT_ROOT, "vendor", "splitwise-mcp", "venv", "bin", "python");
const MCP_SERVER = join(PROJECT_ROOT, "vendor", "splitwise-mcp", "splitwise_server.py");
// Neutral cwd so the CLI doesn't pick up Birdie's CLAUDE.md / project MCP config.
const RUN_DIR = join(PROJECT_ROOT, ".claude-run");

function mcpConfig(): string {
  return JSON.stringify({
    mcpServers: {
      splitwise: { command: VENV_PYTHON, args: [MCP_SERVER] },
    },
  });
}

export const SYNC_TAG = "Birdie";

/** Builds the rules + live ledger snapshot injected into every chat turn. */
export async function buildLedgerContext(): Promise<string> {
  const group = splitwiseGroupName();
  const { summary, log } = await getLedger();

  // The Splitwise group itself is now the source of truth, so the ledger here
  // mirrors live Splitwise data. Show recent sessions and net balances.
  const recent = log.slice(0, 40).map((d) => {
    const tag = `${SYNC_TAG}:${d.date}`;
    return `- date=${d.date} (${dayTypeLabel(d.date)}) tag="${tag}" total=₹${d.dayTotal} per_person=₹${d.amount} attendees=[${d.names.join(", ")}] expense_id=${d.splitwiseExpenseId ?? "?"}`;
  });

  const balances = summary.map((s) => {
    const state = s.owed > 0 ? `owes ₹${s.owed}` : s.owed < 0 ? `is owed ₹${-s.owed}` : "settled";
    return `- ${s.name}: ${state} (${s.days} session${s.days === 1 ? "" : "s"})`;
  });

  return [
    `## CONTEXT`,
    `- The Splitwise group "${group}" is the single source of truth. Every game session is already a Splitwise expense; there is nothing to "sync" or "push" separately.`,
    `- Your job is to answer questions about the ledger and, when explicitly asked, create/adjust expenses in this group.`,
    ``,
    `## RULES (follow exactly when writing)`,
    `- The only Splitwise group you may touch is "${group}". Find its group_id via list_groups/get_group.`,
    `- Currency is always INR, whole rupees.`,
    `- Use split_type="exact" with a "shares" array listing ONLY that session's attendees, each owing the per-person amount; shares must sum to the total. NEVER split_type="equal".`,
    `- Match attendee names to Splitwise members BY NAME. If a name is ambiguous, STOP and ask rather than guessing.`,
    `- You have NO file, shell, or web tools — rely only on the data below and the Splitwise tools.`,
    ``,
    `## NET BALANCES (positive = owes the group)`,
    balances.join("\n") || "(nobody owes anything)",
    ``,
    `## RECENT SESSIONS (latest 40)`,
    recent.join("\n") || "(none)",
  ].join("\n");
}

export interface ClaudeEvent {
  kind: "session" | "text" | "tool_use" | "tool_result" | "synced" | "done" | "error";
  sessionId?: string;
  text?: string;
  toolName?: string;
  toolUseId?: string;
  // for synced:
  date?: string;
  expenseId?: number;
  isError?: boolean;
}

interface RunOpts {
  message: string;
  write: boolean;
  sessionId?: string | null;
}

/**
 * Spawns the Claude CLI headless and yields a stream of events.
 * Read-only turns get only READ_TOOLS; `write:true` turns also get WRITE_TOOLS.
 */
export async function* runClaude({
  message,
  write,
  sessionId,
}: RunOpts): AsyncGenerator<ClaudeEvent> {
  mkdirSync(RUN_DIR, { recursive: true });

  const allowed = write ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
  const prompt = `${await buildLedgerContext()}\n\n## USER MESSAGE\n${message}`;

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    // Sonnet is plenty for this constrained, tool-driven task — cheaper & faster.
    // Override with CLAUDE_CHAT_MODEL if you want a different tier.
    "--model",
    process.env.CLAUDE_CHAT_MODEL || "sonnet",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfig(),
    "--allowedTools",
    allowed.join(","),
  ];
  if (sessionId) {
    args.push("--resume", sessionId);
  }

  const bin = process.env.CLAUDE_BIN || "claude";
  const child = spawn(bin, args, {
    cwd: RUN_DIR,
    env: {
      ...process.env,
      // The MCP server exits on boot if this is empty; pass a placeholder so
      // read-only Q&A still works. Real Splitwise calls would 401 without a key,
      // and the push button is disabled in the UI until a key is configured.
      SPLITWISE_API_KEY: splitwiseApiKey() || "unset",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Correlate tool_use ids -> the date tag in their input, to record sync-back.
  const pendingExpense = new Map<string, string>(); // toolUseId -> date

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  let buf = "";
  const queue: ClaudeEvent[] = [];
  let resolve: (() => void) | null = null;
  let ended = false;
  let exitCode: number | null = null;

  const push = (e: ClaudeEvent) => {
    queue.push(e);
    resolve?.();
    resolve = null;
  };

  function handleLine(line: string) {
    line = line.trim();
    if (!line) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const type = msg.type as string;

    if (type === "system" && (msg as { subtype?: string }).subtype === "init") {
      const sid = (msg as { session_id?: string }).session_id;
      if (sid) push({ kind: "session", sessionId: sid });
      return;
    }

    if (type === "assistant") {
      const content = ((msg as { message?: { content?: unknown[] } }).message?.content ??
        []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
          push({ kind: "text", text: block.text });
        } else if (block.type === "tool_use") {
          const name = String(block.name ?? "");
          const id = String(block.id ?? "");
          push({ kind: "tool_use", toolName: name, toolUseId: id });
          const input = (block.input ?? {}) as { description?: string };
          const m = /Birdie:(\d{4}-\d{2}-\d{2})/.exec(input.description ?? "");
          if (m && (name.endsWith("create_expense") || name.endsWith("update_expense"))) {
            pendingExpense.set(id, m[1]);
          }
        }
      }
      return;
    }

    if (type === "user") {
      const content = ((msg as { message?: { content?: unknown[] } }).message?.content ??
        []) as Array<Record<string, unknown>>;
      for (const block of content) {
        if (block.type !== "tool_result") continue;
        const id = String(block.tool_use_id ?? "");
        push({ kind: "tool_result", toolUseId: id });
        const date = pendingExpense.get(id);
        if (!date) continue;
        pendingExpense.delete(id);
        // tool_result content may be a string or array of {type:text,text}
        let text = "";
        const c = block.content;
        if (typeof c === "string") text = c;
        else if (Array.isArray(c))
          text = c.map((x) => (x as { text?: string }).text ?? "").join("");
        const idMatch = /"id"\s*:\s*(\d+)/.exec(text);
        if (idMatch) {
          push({ kind: "synced", date, expenseId: Number(idMatch[1]) });
        }
      }
      return;
    }

    if (type === "result") {
      const sid = (msg as { session_id?: string }).session_id;
      const isError = Boolean((msg as { is_error?: boolean }).is_error);
      push({ kind: "done", sessionId: sid, isError });
      return;
    }
  }

  child.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      handleLine(line);
    }
  });

  child.on("error", (err) => {
    push({ kind: "error", text: `Failed to launch Claude CLI: ${err.message}` });
    ended = true;
    resolve?.();
    resolve = null;
  });

  child.on("close", (code) => {
    if (buf.trim()) handleLine(buf);
    exitCode = code;
    ended = true;
    resolve?.();
    resolve = null;
  });

  while (true) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (ended) break;
    await new Promise<void>((r) => {
      resolve = r;
    });
  }
  // drain anything pushed during close
  while (queue.length > 0) yield queue.shift()!;

  if (exitCode && exitCode !== 0) {
    yield {
      kind: "error",
      text:
        stderr.trim().slice(0, 500) ||
        `Claude CLI exited with code ${exitCode}.`,
      isError: true,
    };
  }
}
