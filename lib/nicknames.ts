import "server-only";
import { getDb } from "./db";

// Local display nicknames for Splitwise members, keyed by Splitwise user id.
// The roster itself (who is a member) lives in Splitwise; this only overrides
// how names are shown in Birdie.

export function getNicknameMap(): Map<number, string> {
  const rows = getDb()
    .prepare("SELECT member_id, nickname FROM member_nicknames")
    .all() as { member_id: number; nickname: string }[];
  return new Map(rows.map((r) => [r.member_id, r.nickname]));
}

export function setNickname(memberId: number, nickname: string | null): void {
  const db = getDb();
  const value = (nickname ?? "").trim();
  if (!value) {
    db.prepare("DELETE FROM member_nicknames WHERE member_id = ?").run(memberId);
    return;
  }
  db.prepare(
    `INSERT INTO member_nicknames (member_id, nickname) VALUES (?, ?)
     ON CONFLICT(member_id) DO UPDATE SET nickname = excluded.nickname`,
  ).run(memberId, value);
}
