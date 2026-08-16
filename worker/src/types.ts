export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  JWT_SECRET: string;
}

export interface UserRow {
  id: string;
  nickname: string;
  password_hash: string;
  points: number;
  max_streak: number;
  max_session_gain: number;
  games_played: number;
  wins: number;
  losses: number;
  bonus_claimed: number;
  created_at: string;
}

export interface GameSessionRow {
  id: string;
  user_id: string;
  current_number: number;
  session_points: number;
  current_streak: number;
  is_active: number;
  started_at: string;
}

export type GuessChoice = "UP" | "DOWN";

export const MIN_NUMBER = 1;
export const MAX_NUMBER = 100;
export const BASE_REWARD = 10;
export const HOUSE_EDGE = 0.03;
export const STARTING_POINTS = 1000;
export const BONUS_POINTS = 100;
