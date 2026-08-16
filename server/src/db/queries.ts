import type { GameSessionRow, UserRow } from "../types.js";
import { getDb } from "./client.js";

export async function findUserById(userId: string): Promise<UserRow | null> {
  const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId) as
    | UserRow
    | undefined;
  return row ?? null;
}

export async function findUserByNickname(nickname: string): Promise<UserRow | null> {
  const row = getDb()
    .prepare("SELECT * FROM users WHERE nickname = ? COLLATE NOCASE")
    .get(nickname) as UserRow | undefined;
  return row ?? null;
}

export async function createUser(
  user: Pick<UserRow, "id" | "nickname" | "password_hash">
): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO users (id, nickname, password_hash, points)
       VALUES (?, ?, ?, 1000)`
    )
    .run(user.id, user.nickname, user.password_hash);
}

export async function getActiveGameSession(userId: string): Promise<GameSessionRow | null> {
  const row = getDb()
    .prepare(
      `SELECT * FROM game_sessions
       WHERE user_id = ? AND is_active = 1
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(userId) as GameSessionRow | undefined;
  return row ?? null;
}

export async function createGameSession(
  session: Pick<GameSessionRow, "id" | "user_id" | "current_number">
): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO game_sessions (id, user_id, current_number, session_points, current_streak, is_active)
       VALUES (?, ?, ?, 0, 0, 1)`
    )
    .run(session.id, session.user_id, session.current_number);
}

export async function updateGameSession(
  sessionId: string,
  values: Partial<
    Pick<GameSessionRow, "current_number" | "session_points" | "current_streak" | "is_active">
  >
): Promise<void> {
  const fields: string[] = [];
  const params: Array<string | number> = [];

  if (values.current_number !== undefined) {
    fields.push("current_number = ?");
    params.push(values.current_number);
  }
  if (values.session_points !== undefined) {
    fields.push("session_points = ?");
    params.push(values.session_points);
  }
  if (values.current_streak !== undefined) {
    fields.push("current_streak = ?");
    params.push(values.current_streak);
  }
  if (values.is_active !== undefined) {
    fields.push("is_active = ?");
    params.push(values.is_active);
  }

  if (fields.length === 0) return;

  params.push(sessionId);
  getDb()
    .prepare(`UPDATE game_sessions SET ${fields.join(", ")} WHERE id = ?`)
    .run(...params);
}

export async function getUserRank(userId: string): Promise<number | null> {
  const row = getDb()
    .prepare(
      `SELECT rank FROM (
         SELECT id, RANK() OVER (ORDER BY points DESC, max_streak DESC, created_at ASC) AS rank
         FROM users
       ) ranked
       WHERE id = ?`
    )
    .get(userId) as { rank: number } | undefined;

  return row?.rank ?? null;
}

export interface RankingRow {
  rank: number;
  nickname: string;
  points: number;
  max_streak: number;
  max_session_gain: number;
}

export async function getRankings(limit = 20): Promise<RankingRow[]> {
  const rows = getDb()
    .prepare(
      `SELECT
         RANK() OVER (ORDER BY points DESC, max_streak DESC, created_at ASC) AS rank,
         nickname,
         points,
         max_streak,
         max_session_gain
       FROM users
       ORDER BY points DESC, max_streak DESC, created_at ASC
       LIMIT ?`
    )
    .all(limit);

  return rows as unknown as RankingRow[];
}

export async function incrementUserStats(
  userId: string,
  updates: {
    pointsDelta?: number;
    maxStreak?: number;
    maxSessionGain?: number;
    gamesPlayed?: number;
    wins?: number;
    losses?: number;
    bonusClaimed?: number;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: Array<string | number> = [];

  if (updates.pointsDelta !== undefined) {
    sets.push("points = MAX(0, points + ?)");
    params.push(updates.pointsDelta);
  }
  if (updates.maxStreak !== undefined) {
    sets.push("max_streak = MAX(max_streak, ?)");
    params.push(updates.maxStreak);
  }
  if (updates.maxSessionGain !== undefined) {
    sets.push("max_session_gain = MAX(max_session_gain, ?)");
    params.push(updates.maxSessionGain);
  }
  if (updates.gamesPlayed !== undefined) {
    sets.push("games_played = games_played + ?");
    params.push(updates.gamesPlayed);
  }
  if (updates.wins !== undefined) {
    sets.push("wins = wins + ?");
    params.push(updates.wins);
  }
  if (updates.losses !== undefined) {
    sets.push("losses = losses + ?");
    params.push(updates.losses);
  }
  if (updates.bonusClaimed !== undefined) {
    sets.push("bonus_claimed = ?");
    params.push(updates.bonusClaimed);
  }

  if (sets.length === 0) return;

  params.push(userId);
  getDb()
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}

export function publicUser(user: UserRow, rank: number | null) {
  return {
    id: user.id,
    nickname: user.nickname,
    points: user.points,
    maxStreak: user.max_streak,
    maxSessionGain: user.max_session_gain,
    gamesPlayed: user.games_played,
    wins: user.wins,
    losses: user.losses,
    bonusClaimed: user.bonus_claimed === 1,
    createdAt: user.created_at,
    rank,
  };
}

export function serializeActiveSession(session: GameSessionRow | null) {
  if (!session) return null;
  return {
    id: session.id,
    currentNumber: session.current_number,
    sessionPoints: session.session_points,
    currentStreak: session.current_streak,
    isActive: session.is_active === 1,
  };
}
