import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "./env";
import { todayStr } from "./dates";

// Single shared connection for the process. better-sqlite3 is synchronous and
// safe to reuse; we memoize on globalThis so Next's dev hot-reload doesn't open
// a new handle on every module reload.
const globalForDb = globalThis as unknown as { __birdieDb?: Database.Database };

// Birdie's ledger lives in Splitwise now (see lib/splitwise.ts); SQLite only
// holds local state: rates (in settings), chat history, the Claude session id,
// and member nicknames. The legacy people/game_days/attendance tables were
// dropped in migration v3.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Ordered, idempotent migrations. The array index + 1 is the resulting
// PRAGMA user_version, so adding a new entry = a new migration step. Existing
// databases only run steps past their current version; fresh databases run all
// of them on top of SCHEMA above.
const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // v0 -> v1: chat history. (Originally also added Splitwise sync columns to
  // game_days, but that table was removed in v3, so only chat_messages remains.)
  (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      role        TEXT NOT NULL,            -- 'user' | 'assistant'
      content     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  },
  // v1 -> v2: local display nicknames for Splitwise members. member_id is the
  // Splitwise user id; roster identity itself lives in Splitwise (source of truth).
  (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS member_nicknames (
      member_id INTEGER PRIMARY KEY,
      nickname  TEXT NOT NULL
    )`);
  },
  // v2 -> v3: drop the legacy local ledger tables — Splitwise is the source of
  // truth, so these are unused. (Order matters: attendance references the others.)
  (db) => {
    db.exec("DROP TABLE IF EXISTS attendance");
    db.exec("DROP TABLE IF EXISTS game_days");
    db.exec("DROP TABLE IF EXISTS people");
  },
];

function migrate(db: Database.Database): void {
  let version = db.pragma("user_version", { simple: true }) as number;
  while (version < MIGRATIONS.length) {
    const step = MIGRATIONS[version];
    const next = version + 1;
    const tx = db.transaction(() => {
      step(db);
      db.pragma(`user_version = ${next}`);
    });
    tx();
    version = next;
  }
}

function seed(db: Database.Database): void {
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING",
  );
  const defaults: Record<string, string> = {
    rate_weekday: "105",
    rate_saturday: "185",
    rate_sunday: "0",
    start_date: todayStr(),
  };
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) upsert.run(k, v);
  });
  tx();
}

function init(): Database.Database {
  const path = databasePath();
  // Ensure the parent directory exists on first run.
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.__birdieDb) {
    globalForDb.__birdieDb = init();
  }
  return globalForDb.__birdieDb;
}
