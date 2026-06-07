import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "./env";
import { todayStr } from "./dates";

// Single shared connection for the process. better-sqlite3 is synchronous and
// safe to reuse; we memoize on globalThis so Next's dev hot-reload doesn't open
// a new handle on every module reload.
const globalForDb = globalThis as unknown as { __birdieDb?: Database.Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_name_nocase ON people (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS game_days (
  date        TEXT PRIMARY KEY,           -- 'YYYY-MM-DD'
  amount      INTEGER NOT NULL,           -- amount per person in rupees
  skipped     INTEGER NOT NULL DEFAULT 0, -- 0 = played, 1 = skipped
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  game_date   TEXT NOT NULL REFERENCES game_days(date) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  PRIMARY KEY (game_date, person_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Ordered, idempotent migrations. The array index + 1 is the resulting
// PRAGMA user_version, so adding a new entry = a new migration step.
const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // v0 -> v1: Splitwise sync tracking + chat history
  (db) => {
    db.exec("ALTER TABLE game_days ADD COLUMN splitwise_expense_id INTEGER");
    db.exec("ALTER TABLE game_days ADD COLUMN synced_at TEXT");
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
