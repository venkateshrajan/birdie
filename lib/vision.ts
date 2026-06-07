import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey, visionModel } from "./env";

// Reads a Playo booking screenshot and works out which roster members played.
//
// The Claude CLI used elsewhere (chat) cannot ingest images in headless mode,
// so screenshot reading goes straight to the Anthropic Messages API. The model
// does the fuzzy name → member matching (Playo display names are often informal
// or partial); we keep code in charge of the hard rules: only real member ids
// survive, and the host is always dropped.

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
  /** Player names read off the screenshot that no member matched. */
  unmatchedNames: string[];
}

const TOOL: Anthropic.Tool = {
  name: "report_players",
  description:
    "Report the badminton players found in the booking screenshot, matched to the roster.",
  input_schema: {
    type: "object",
    properties: {
      matchedMemberIds: {
        type: "array",
        items: { type: "integer" },
        description:
          "Roster member ids for each player you confidently matched. Use only ids from the roster.",
      },
      unmatchedNames: {
        type: "array",
        items: { type: "string" },
        description:
          "Player names you read in the screenshot but could not confidently match to a roster member.",
      },
    },
    required: ["matchedMemberIds", "unmatchedNames"],
  },
};

function buildPrompt(roster: RosterEntry[], hostId: number): string {
  const lines = roster.map((m) => {
    const parts = [`id=${m.id}`, `name="${m.fullName}"`];
    if (m.nickname) parts.push(`nickname="${m.nickname}"`);
    return `- ${parts.join(" ")}`;
  });
  return [
    "This is a screenshot from the Playo app for a badminton session.",
    "Identify the individual people who played (the participants/players list).",
    "Ignore non-player text: court names, prices, dates, times, sport names, and UI labels/buttons.",
    "",
    "Match each player to a member in this roster. Names may be informal,",
    "partial, abbreviated, or differently cased/spelled — match on best effort",
    "against the name and nickname.",
    "",
    "ROSTER:",
    ...lines,
    "",
    `IMPORTANT: member id=${hostId} is the host. NEVER include the host in`,
    "matchedMemberIds, even if their name appears in the screenshot.",
    "",
    "Call report_players with the member ids you matched (excluding the host)",
    "and any player names you could not match.",
  ].join("\n");
}

export async function extractPlayersFromScreenshot(
  base64Data: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif",
  roster: RosterEntry[],
  hostId: number,
): Promise<ScreenshotPlayers> {
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: visionModel(),
    max_tokens: 1024,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "report_players" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          { type: "text", text: buildPrompt(roster, hostId) },
        ],
      },
    ],
  });

  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Could not read the screenshot. Try a clearer image.");
  }
  const input = block.input as {
    matchedMemberIds?: unknown;
    unmatchedNames?: unknown;
  };

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

  const rawNames = Array.isArray(input.unmatchedNames) ? input.unmatchedNames : [];
  const unmatchedNames = rawNames
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0)
    .slice(0, 20);

  return { matchedMemberIds, unmatchedNames };
}
