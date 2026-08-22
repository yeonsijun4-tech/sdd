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
  forceExit: boolean;

  constructor(
    message: string,
    status: number,
    accountDeleted = false,
    forceExit = false
  ) {
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

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_PATH_PREFIXES = ["/api/game", "/api/user"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldRetryRequest(path: string, status: number, attempt: number): boolean {
  if (attempt >= 2) return false;
  if (!RETRYABLE_STATUSES.has(status)) return false;
  return RETRYABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function defaultErrorMessage(status: number): string {
  if (status === 503) {
    return "서버가 준비 중입니다. 잠시 후 같은 버튼을 다시 눌러 주세요.";
  }
  if (status >= 500) {
    return "일시적인 오류입니다. 잠시 후 같은 버튼을 다시 눌러 주세요.";
  }
  return "요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
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
    if (attempt < 2 && RETRYABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      await sleep(450 * (attempt + 1));
      return request(path, options, attempt + 1);
    }
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 같은 버튼을 다시 눌러 주세요.");
  }

  const text = await response.text();
  let data: { error?: string; accountDeleted?: boolean; forceExit?: boolean } = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (
        shouldRetryRequest(path, response.status, attempt) ||
        (attempt < 2 && !response.ok && RETRYABLE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)))
      ) {
        await sleep(450 * (attempt + 1));
        return request(path, options, attempt + 1);
      }
      throw new Error(
        response.ok
          ? "서버 응답을 처리할 수 없습니다."
          : defaultErrorMessage(response.status)
      );
    }
  }

  if (!response.ok) {
    if (shouldRetryRequest(path, response.status, attempt)) {
      await sleep(450 * (attempt + 1));
      return request(path, options, attempt + 1);
    }

    throw new ApiError(
      data.error ?? defaultErrorMessage(response.status),
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
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>("/api/user/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
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
  presenceHeartbeat(clientId: string) {
    return request<{ count: number }>("/api/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify({ clientId }),
    });
  },
  presenceCount() {
    return request<{ count: number }>("/api/presence/count");
  },
};
