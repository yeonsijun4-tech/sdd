export interface UserRow {
  id: string;
  nickname: string;
  password_hash: string;
  points: string;
  max_streak: number;
  max_session_gain: string;
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
  session_points: string;
  current_streak: number;
  is_active: number;
  started_at: string;
  board_json: string | null;
}

export const STARTING_POINTS = 0;

export type AppVariables = {
  userId: string;
};

export type OptionalAuthVariables = {
  userId?: string;
};
