import type { QueryResultRow } from "pg";
import type { GameSessionRow, UserRow } from "../types.js";
import { STARTING_POINTS } from "../types.js";
import { query } from "./client.js";

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapUserRow(row: QueryResultRow): UserRow {
  return {
    id: String(row.id),
    nickname: String(row.nickname),
    password_hash: String(row.password_hash),
    points: Number(row.points),
    max_streak: Number(row.max_streak),
    max_session_gain: Number(row.max_session_gain),
    games_played: Number(row.games_played),
    wins: Number(row.wins),
    losses: Number(row.losses),
    bonus_claimed: row.bonus_claimed ? 1 : 0,
    created_at: toIsoString(row.created_at),
  };
}

function mapGameSessionRow(row: QueryResultRow): GameSessionRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    current_number: Number(row.current_number),
    session_points: Number(row.session_points),
    current_streak: Number(row.current_streak),
    is_active: row.is_active ? 1 : 0,
    started_at: toIsoString(row.started_at),
  };
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const result = await query("SELECT * FROM users WHERE id = $1", [userId]);
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
}

export async function findUserByNickname(nickname: string): Promise<UserRow | null> {
  const result = await query("SELECT * FROM users WHERE LOWER(nickname) = LOWER($1)", [
    nickname,
  ]);
  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
}

export async function createUser(
  user: Pick<UserRow, "id" | "nickname" | "password_hash">
): Promise<void> {
  await query(
    `INSERT INTO users (id, nickname, password_hash, points)
     VALUES ($1, $2, $3, $4)`,
    [user.id, user.nickname, user.password_hash, STARTING_POINTS]
  );
}

export async function getActiveGameSession(userId: string): Promise<GameSessionRow | null> {
  const result = await query(
    `SELECT * FROM game_sessions
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  return row ? mapGameSessionRow(row) : null;
}

export async function createGameSession(
  session: Pick<GameSessionRow, "id" | "user_id" | "current_number"> & {
    session_points?: number;
  }
): Promise<void> {
  await query(
    `INSERT INTO game_sessions (id, user_id, current_number, session_points, current_streak, is_active)
     VALUES ($1, $2, $3, $4, 0, TRUE)`,
    [
      session.id,
      session.user_id,
      session.current_number,
      session.session_points ?? 0,
    ]
  );
}

export async function updateGameSession(
  sessionId: string,
  values: Partial<
    Pick<GameSessionRow, "current_number" | "session_points" | "current_streak" | "is_active">
  >
): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (values.current_number !== undefined) {
    fields.push(`current_number = $${index++}`);
    params.push(values.current_number);
  }
  if (values.session_points !== undefined) {
    fields.push(`session_points = $${index++}`);
    params.push(values.session_points);
  }
  if (values.current_streak !== undefined) {
    fields.push(`current_streak = $${index++}`);
    params.push(values.current_streak);
  }
  if (values.is_active !== undefined) {
    fields.push(`is_active = $${index++}`);
    params.push(values.is_active === 1);
  }

  if (fields.length === 0) return;

  params.push(sessionId);
  await query(`UPDATE game_sessions SET ${fields.join(", ")} WHERE id = $${index}`, params);
}

export async function getUserRank(userId: string): Promise<number | null> {
  const result = await query<{ rank: string }>(
    `SELECT ranked.rank
     FROM (
       SELECT id, ROW_NUMBER() OVER (ORDER BY points DESC, max_streak DESC, created_at ASC) AS rank
       FROM users
     ) ranked
     WHERE ranked.id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return row ? Number(row.rank) : null;
}

export interface RankingRow {
  rank: number;
  nickname: string;
  points: number;
  max_streak: number;
  max_session_gain: number;
}

export async function getRankings(limit = 20): Promise<RankingRow[]> {
  const result = await query<{
    rank: string;
    nickname: string;
    points: number;
    max_streak: number;
    max_session_gain: number;
  }>(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY points DESC, max_streak DESC, created_at ASC) AS rank,
       nickname,
       points,
       max_streak,
       max_session_gain
     FROM users
     ORDER BY points DESC, max_streak DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    rank: Number(row.rank),
    nickname: row.nickname,
    points: Number(row.points),
    max_streak: Number(row.max_streak),
    max_session_gain: Number(row.max_session_gain),
  }));
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
  const params: unknown[] = [];
  let index = 1;

  if (updates.pointsDelta !== undefined) {
    sets.push(`points = GREATEST(0, points + $${index++})`);
    params.push(updates.pointsDelta);
  }
  if (updates.maxStreak !== undefined) {
    sets.push(`max_streak = GREATEST(max_streak, $${index++})`);
    params.push(updates.maxStreak);
  }
  if (updates.maxSessionGain !== undefined) {
    sets.push(`max_session_gain = GREATEST(max_session_gain, $${index++})`);
    params.push(updates.maxSessionGain);
  }
  if (updates.gamesPlayed !== undefined) {
    sets.push(`games_played = games_played + $${index++}`);
    params.push(updates.gamesPlayed);
  }
  if (updates.wins !== undefined) {
    sets.push(`wins = wins + $${index++}`);
    params.push(updates.wins);
  }
  if (updates.losses !== undefined) {
    sets.push(`losses = losses + $${index++}`);
    params.push(updates.losses);
  }
  if (updates.bonusClaimed !== undefined) {
    sets.push(`bonus_claimed = $${index++}`);
    params.push(updates.bonusClaimed === 1);
  }

  if (sets.length === 0) return;

  params.push(userId);
  await query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${index}`, params);
}

export async function deleteUser(userId: string): Promise<void> {
  await query("DELETE FROM game_sessions WHERE user_id = $1", [userId]);
  await query("DELETE FROM users WHERE id = $1", [userId]);
}

export async function deleteUserIfZeroBalance(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user || user.points > 0) return false;

  const activeSession = await getActiveGameSession(userId);
  if (activeSession) return false;

  await deleteUser(userId);
  return true;
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
