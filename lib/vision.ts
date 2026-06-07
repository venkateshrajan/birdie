import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey, visionModel } from "./env";

// Reads a Playo booking screenshot and works out which roster members played
// and (when shown) the session date.
//
// The Claude CLI used elsewhere (chat) cannot ingest images in headless mode,
// so screenshot reading goes straight to the Anthropic Messages API. The model
// does the fuzzy name → member matching (Playo display names are often informal
// or partial); we keep code in charge of the hard rules: only real member ids
// survive, the host is always dropped, and anyone not in the roster is ignored.

export interface RosterEntry {
  id: number;
  /** Display name shown in Birdie (nickname if set, else first name). */
  name: string;
  /** Full Splitwise profile name. */
  fullName: string;
  nickname: string | null;
}

export interface ScreenshotPlayers {
  /** Roster member ids found in the screenshot, host already removed. */
  matchedMemberIds: number[];
  /** Session date as YYYY-MM-DD if the screenshot showed one, else null. */
  date: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const TOOL: Anthropic.Tool = {
  name: "report_session",
  description:
    "Report the badminton players (matched to the roster) and the session date found in the screenshot.",
  input_schema: {
    type: "object",
    properties: {
      matchedMemberIds: {
        type: "array",
        items: { type: "integer" },
        description:
          "Roster member ids for each player you matched. Use only ids from the roster; omit anyone not in the roster.",
      },
      date: {
        type: "string",
        description:
          'Session date as YYYY-MM-DD if the screenshot shows one, otherwise an empty string "".',
      },
    },
    required: ["matchedMemberIds", "date"],
  },
};

function buildPrompt(
  roster: RosterEntry[],
  hostId: number,
  today: string,
): string {
  const lines = roster.map((m) => {
    const parts = [`id=${m.id}`, `name="${m.fullName}"`];
    if (m.nickname) parts.push(`nickname="${m.nickname}"`);
    return `- ${parts.join(" ")}`;
  });
  return [
    "This is a screenshot from the Playo app for a badminton session.",
    "",
    "Two things to extract:",
    "",
    "1) DATE: the date of the session shown in the screenshot, as YYYY-MM-DD.",
    `   Today is ${today}. If the screenshot shows a date without a year,`,
    "   choose the year that makes the date closest to today. If no date is",
    '   visible at all, return an empty string "".',
    "",
    "2) PLAYERS: the individual people who played (the participants list).",
    "   Match each to a member in the roster below — names may be informal,",
    "   partial, abbreviated, or differently cased/spelled; match on best",
    "   effort against the name and nickname.",
    "   - If a name in the screenshot does NOT correspond to any roster member,",
    "     IGNORE it (do not include it anywhere).",
    `   - member id=${hostId} is the host: NEVER include the host, even if`,
    "     their name appears.",
    "",
    "Ignore non-player UI text: court names, prices, times, sport names, buttons.",
    "",
    "ROSTER:",
    ...lines,
    "",
    "Call report_session with the matched member ids (host excluded, non-roster",
    "names omitted) and the date.",
  ].join("\n");
}

export async function extractPlayersFromScreenshot(
  base64Data: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
  roster: RosterEntry[],
  hostId: number,
  today: string,
): Promise<ScreenshotPlayers> {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: visionModel(),
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_session" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          { type: "text", text: buildPrompt(roster, hostId, today) },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Could not read the screenshot. Try a clearer image.");
  }
  const input = block.input as { matchedMemberIds?: unknown; date?: unknown };

  // Trust nothing from the model: keep only real member ids, drop the host,
  // and dedupe. The model's matching is a suggestion; these rules are not.
  const valid = new Set(roster.map((m) => m.id));
  const ids = Array.isArray(input.matchedMemberIds) ? input.matchedMemberIds : [];
  const matchedMemberIds = [
    ...new Set(
      ids
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && valid.has(n) && n !== hostId),
    ),
  ];

  const rawDate = typeof input.date === "string" ? input.date.trim() : "";
  const date = ISO_DATE.test(rawDate) ? rawDate : null;

  return { matchedMemberIds, date };
}
