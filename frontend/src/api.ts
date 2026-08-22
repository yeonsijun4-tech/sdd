export interface PublicUser {
  id: string;
  nickname: string;
  points: number;
  maxStreak: number;
  maxSessionGain: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  bonusClaimed: boolean;
  createdAt: string;
  rank: number | null;
}

export interface ActiveSession {
  id: string;
  currentNumber: number;
  sessionPoints: number;
  currentStreak: number;
  isActive: boolean;
}

export interface BoardState {
  currentNumber: number;
  minNumber: number;
  maxNumber: number;
  probabilities: {
    up: number;
    down: number;
  };
  multipliers: {
    up: number;
    down: number;
  };
  rules: {
    probabilityRule: string;
    multiplierRule: string;
    rewardRule: string;
  };
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  points: number;
  maxStreak: number;
  maxSessionGain: number;
}

export interface CaptchaChallenge {
  captchaId: string;
  question: string;
}

const TOKEN_KEY = "1zuxm_token";
const REMEMBER_KEY = "1zuxm_remember";

export class ApiError extends Error {
  status: number;
  accountDeleted: boolean;

  constructor(message: string, status: number, accountDeleted = false) {
    super(message);
    this.status = status;
    this.accountDeleted = accountDeleted;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRememberLogin(): boolean {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function setRememberLogin(remember: boolean): void {
  localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  const text = await response.text();
  let data: { error?: string; accountDeleted?: boolean } = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        response.ok
          ? "서버 응답을 처리할 수 없습니다."
          : `서버 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`
      );
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data.error ?? "요청 처리 중 오류가 발생했습니다.",
      response.status,
      data.accountDeleted === true
    );
  }

  return data as T;
}

export const api = {
  captcha() {
    return request<CaptchaChallenge>("/api/auth/captcha");
  },
  register(
    nickname: string,
    password: string,
    captchaId: string,
    captchaAnswer: string
  ) {
    return request<{ token: string; user: PublicUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ nickname, password, captchaId, captchaAnswer }),
    });
  },
  login(nickname: string, password: string, rememberMe = true) {
    return request<{ token: string; user: PublicUser; rememberMe?: boolean }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ nickname, password, rememberMe }),
      }
    );
  },
  me() {
    return request<{ user: PublicUser; activeSession: ActiveSession | null }>(
      "/api/user/me"
    );
  },
  claimBonus() {
    return request<{ message: string; user: PublicUser }>("/api/user/bonus", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  gameState() {
    return request<{ activeSession: ActiveSession | null; board?: BoardState }>(
      "/api/game/state"
    );
  },
  startGame(betAmount: number) {
    return request<{
      activeSession: ActiveSession | null;
      board: BoardState;
      message?: string;
      user?: PublicUser | null;
      accountDeleted?: boolean;
    }>("/api/game/start", {
      method: "POST",
      body: JSON.stringify({ betAmount }),
    });
  },
  guess(choice: "UP" | "DOWN") {
    return request<{
      result: "WIN" | "LOSE";
      previousNumber: number;
      nextNumber: number;
      choice: string;
      gain?: number;
      lostPoints?: number;
      message?: string;
      activeSession: ActiveSession | null;
      board?: BoardState;
      user?: PublicUser | null;
      accountDeleted?: boolean;
    }>("/api/game/guess", {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
  },
  cashout() {
    return request<{
      message: string;
      earned: number;
      user: PublicUser;
      activeSession: null;
    }>("/api/game/cashout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  rankings() {
    return request<{
      rankings: RankingEntry[];
      myRank: PublicUser | null;
      updatedAt: string;
    }>("/api/ranking");
  },
  sessionInfo() {
    return request<{ ip: string; time: string }>("/api/session/info");
  },
};
