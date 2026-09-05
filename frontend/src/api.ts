import { sanitizeUserMessage } from "./userMessage";
import type { BlastState } from "./blockBlast";

export interface PublicUser {
  id: string;
  nickname: string;
  points: string;
  maxStreak: number;
  maxSessionGain: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  bonusClaimed: boolean;
  createdAt: string;
  rank: number | null;
}

export interface ActiveSession {
  id: string;
  score: number;
  combo: number;
  isActive: boolean;
  blast: BlastState | null;
}

export interface RankingEntry {
  rank: number;
  nickname: string;
  points: string;
  maxStreak: number;
  maxSessionGain: string;
}

export interface CaptchaChallenge {
  captchaId: string;
  question: string;
}

export interface GamePayload {
  activeSession: ActiveSession | null;
  blast: BlastState | null;
  user?: PublicUser | null;
  gameOver?: boolean;
  message?: string;
}

const TOKEN_KEY = "1zuxm_token";
const REMEMBER_KEY = "1zuxm_remember";

export class ApiError extends Error {
  status: number;
  accountDeleted: boolean;
  forceExit: boolean;

  constructor(message: string, status: number, accountDeleted = false, forceExit = false) {
    super(message);
    this.status = status;
    this.accountDeleted = accountDeleted;
    this.forceExit = forceExit;
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

const MAX_REQUEST_ATTEMPTS = 8;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function request<T>(path: string, options: RequestInit = {}, attempt = 0): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    if (attempt < MAX_REQUEST_ATTEMPTS - 1 && path.startsWith("/api/")) {
      await sleep(500 * (attempt + 1));
      return request(path, options, attempt + 1);
    }
    throw new Error("서버에 연결할 수 없습니다. 같은 버튼을 다시 눌러 주세요.");
  }

  const text = await response.text();
  let data: { error?: string; accountDeleted?: boolean; forceExit?: boolean } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (attempt < MAX_REQUEST_ATTEMPTS - 1 && RETRYABLE_STATUSES.has(response.status)) {
        await sleep(500 * (attempt + 1));
        return request(path, options, attempt + 1);
      }
      throw new Error("서버 응답을 처리할 수 없습니다.");
    }
  }

  if (!response.ok) {
    if (attempt < MAX_REQUEST_ATTEMPTS - 1 && RETRYABLE_STATUSES.has(response.status)) {
      await sleep(500 * (attempt + 1));
      return request(path, options, attempt + 1);
    }
    throw new ApiError(
      sanitizeUserMessage(data.error ?? "", response.status) || data.error || "같은 버튼을 다시 눌러 주세요.",
      response.status,
      data.accountDeleted === true,
      data.forceExit === true
    );
  }

  return data as T;
}

export const api = {
  captcha() {
    return request<CaptchaChallenge>("/api/auth/captcha");
  },
  register(nickname: string, password: string, captchaId: string, captchaAnswer: string) {
    return request<{ token: string; user: PublicUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ nickname, password, captchaId, captchaAnswer }),
    });
  },
  login(nickname: string, password: string, rememberMe: boolean) {
    return request<{ token: string; user: PublicUser; rememberMe?: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ nickname, password, rememberMe }),
    });
  },
  me() {
    return request<{ user: PublicUser; activeSession: ActiveSession | null }>("/api/user/me");
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>("/api/user/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  gameState() {
    return request<GamePayload>("/api/game/state");
  },
  startGame() {
    return request<GamePayload>("/api/game/start", { method: "POST", body: JSON.stringify({}) });
  },
  placePiece(pieceIndex: number, row: number, col: number) {
    return request<GamePayload>("/api/game/place", {
      method: "POST",
      body: JSON.stringify({ pieceIndex, row, col }),
    });
  },
  restartGame() {
    return request<GamePayload>("/api/game/restart", { method: "POST", body: JSON.stringify({}) });
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
  presenceHeartbeat(clientId: string) {
    return request<{ count: number }>("/api/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify({ clientId }),
    });
  },
};
