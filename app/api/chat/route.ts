import { isAdmin } from "@/lib/session";
import { runClaude } from "@/lib/claude";
import {
  appendChatMessage,
  getClaudeSessionId,
  markDaySynced,
  setClaudeSessionId,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { message?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const message = (body.message ?? "").trim();
  const write = body.mode === "push";
  if (!message) return new Response("Empty message", { status: 400 });

  appendChatMessage("user", message);
  const sessionId = getClaudeSessionId();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let assistantText = "";
      try {
        for await (const ev of runClaude({ message, write, sessionId })) {
          switch (ev.kind) {
            case "session":
              if (ev.sessionId) setClaudeSessionId(ev.sessionId);
              break;
            case "text":
              if (ev.text) {
                assistantText += ev.text;
                send({ type: "text", text: ev.text });
              }
              break;
            case "tool_use":
              send({ type: "tool", name: ev.toolName });
              break;
            case "tool_result":
              send({ type: "tool_done" });
              break;
            case "synced":
              if (ev.date && ev.expenseId) {
                markDaySynced(ev.date, ev.expenseId);
                send({ type: "synced", date: ev.date, expenseId: ev.expenseId });
              }
              break;
            case "done":
              if (ev.sessionId) setClaudeSessionId(ev.sessionId);
              break;
            case "error":
              send({ type: "error", text: ev.text ?? "Unknown error" });
              break;
          }
        }
        if (assistantText.trim()) appendChatMessage("assistant", assistantText.trim());
        send({ type: "done" });
      } catch (e) {
        send({
          type: "error",
          text: e instanceof Error ? e.message : "Chat failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
