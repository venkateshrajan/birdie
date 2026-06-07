# 🏸 Birdie

A badminton court-dues ledger. The admin records who played each game day; everyone
else gets a read-only public view of who owes what.

Built from `handoff.md` (the "Shuttle Ledger" spec), renamed **Birdie**.

## Stack

- **Next.js 16** (App Router, Turbopack) + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Base UI) — athletic neo-brutalist scoreboard theme
- **SQLite** via `better-sqlite3` (single file, WAL)
- **iron-session** for the single-admin cookie (no user table, no OAuth)
- Server Components for reads, Server Actions for all mutations

## Access model

- **One admin**, authenticated with a single shared password (`ADMIN_PASSWORD`).
- **Everyone else** is an unauthenticated read-only viewer at `/`.
- `/admin/*` and every Server Action are guarded by `requireAdmin()`.

## Routes

| Route              | Auth   | Purpose                                        |
| ------------------ | ------ | ---------------------------------------------- |
| `/`                | public | Read-only dashboard (totals, per-person, log)  |
| `/admin/login`     | public | Password form                                  |
| `/admin`           | admin  | Day-entry console + roster + rates             |
| `/api/export.csv`  | public | CSV download (per-day + per-person blocks)     |

## Local development

```bash
npm install
cp .env.example .env.local   # then edit the secrets
npm run dev                  # http://localhost:3000
```

`.env.local` needs at minimum:

```bash
ADMIN_PASSWORD=something-strong          # >= 8 chars
SESSION_SECRET=<openssl rand -base64 36> # >= 32 chars
DATABASE_PATH=./data/birdie.db
```

The DB file + parent dir are created and seeded on first boot (default rates:
weekday ₹105, Saturday ₹185, Sunday ₹0). The app **fails fast** on boot if the
secrets are missing or weak (see `instrumentation.ts`).

## Money rules (see `lib/queries.ts`)

- Per-person owed = Σ (over non-skipped days they attended) of that day's amount.
- Grand total = Σ (over non-skipped days) of amount × attendee count.
- Non-skipped days with no attendees are pruned automatically.

## Chat + Splitwise (admin only)

`/admin/chat` is an assistant that reads the ledger and pushes dues to **Splitwise**.
It works by spawning the `claude` CLI headless in the background, wired to a vendored
**Splitwise MCP server** (`vendor/splitwise-mcp`, from `bhvkmuni/splitwise-mcp`).

- **One expense per non-skipped game day** in the fixed group (`SPLITWISE_GROUP_NAME`,
  default *Fireboys Badminton*): `split_type="exact"`, you (the API-key owner) pay the
  full amount, split equally among that day's attendees only. Players are matched to
  Splitwise members **by name**.
- **Propose-then-confirm**: normal messages run with read-only Splitwise tools, so the
  assistant can draft but not write. The **Confirm & push** button re-runs the same
  session with write tools enabled. `delete_expense`/`create_payment` are never allowed.
- **Idempotent**: each expense description is tagged `Birdie:YYYY-MM-DD`; the created
  expense id is stored on the day (`game_days.splitwise_expense_id`). Editing a day clears
  its synced flag so a re-push *updates* rather than duplicates.
- Responses **stream** to the browser over SSE; chat history + the Claude session id are
  persisted so follow-ups keep context.

### Setup

```bash
# 1. Python deps for the MCP server (needs `uv`)
./scripts/setup-splitwise-mcp.sh

# 2. Splitwise API key — from https://secure.splitwise.com/apps
#    Put it in Birdie's env (SPLITWISE_API_KEY) OR vendor/splitwise-mcp/.env
```

**Requirements / caveats**
- The `claude` CLI must be installed and **logged in** for the user/service account that
  runs Birdie (we use subscription login, not an API key). On the VPS, the service user
  needs its own `claude` login. Override the binary path with `CLAUDE_BIN` and the model
  with `CLAUDE_CHAT_MODEL` (default `sonnet`).
- The MCP venv must use a **copied** interpreter, not a symlink (the setup script handles
  this) — otherwise the Turbopack build fails on the out-of-root symlink.

## Deployment

See `../handoff.md` §10. Install native-module build deps (`build-essential`,
`python3`), then:

```bash
npm ci && npm run build && npm run start   # serves on $PORT (default 3000)
```

Run behind a reverse proxy (this VPS uses Caddy) and point `DATABASE_PATH` at a
persistent volume. Back up the single `.db` file via `sqlite3 … ".backup"`.
