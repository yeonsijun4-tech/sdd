import {
  api,
  ApiError,
  getRememberLogin,
  getToken,
  setRememberLogin,
  setToken,
  type ActiveSession,
  type BoardState,
  type CaptchaChallenge,
  type PublicUser,
  type RankingEntry,
} from "./api";
import "./styles.css";

interface AppState {
  user: PublicUser | null;
  activeSession: ActiveSession | null;
  board: BoardState | null;
  rankings: RankingEntry[];
  rankingUpdatedAt: string;
  isBusy: boolean;
  authMode: "login" | "register";
  captcha: CaptchaChallenge | null;
  showCaptchaHelp: boolean;
  lastResult: {
    type: "WIN" | "LOSE" | "TIE";
    previousNumber: number;
    nextNumber: number;
    message?: string;
  } | null;
  toast: string | null;
  toastType: "info" | "error";
  activeModal: "profile" | "notice" | "patch" | null;
  activeGame: "updown" | "oddeven";
  rememberLogin: boolean;
  sessionIp: string;
  betInput: string;
}

const state: AppState = {
  user: null,
  activeSession: null,
  board: null,
  rankings: [],
  rankingUpdatedAt: "",
  isBusy: false,
  authMode: "login",
  captcha: null,
  showCaptchaHelp: false,
  lastResult: null,
  toast: null,
  toastType: "info",
  activeModal: null,
  activeGame: "updown",
  rememberLogin: getRememberLogin(),
  sessionIp: "확인 중",
  betInput: "",
};

let rankingTimer: number | null = null;
let sessionClockTimer: number | null = null;
let eventsBound = false;

function formatSessionTime(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /Mobile|Android|iPhone|iPad/i.test(ua) ? "Mobile" : "PC";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad/i.test(ua)
          ? "iOS"
          : "OS";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "Browser";
  return `${device} · ${os} · ${browser}`;
}

function updateSessionClock() {
  const element = document.querySelector<HTMLElement>("#session-time");
  if (element) element.textContent = formatSessionTime();
}

function startSessionClock() {
  updateSessionClock();
  if (sessionClockTimer) return;
  sessionClockTimer = window.setInterval(updateSessionClock, 1000);
}

async function loadSessionInfo() {
  try {
    const info = await api.sessionInfo();
    state.sessionIp = info.ip;
    const ipElement = document.querySelector<HTMLElement>("#session-ip");
    if (ipElement) ipElement.textContent = info.ip;
    updateSessionClock();
  } catch {
    state.sessionIp = "확인 불가";
    const ipElement = document.querySelector<HTMLElement>("#session-ip");
    if (ipElement) ipElement.textContent = state.sessionIp;
  }
}

function formatMoney(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

const POKER_SUITS = [
  { symbol: "♠", color: "black" },
  { symbol: "♥", color: "red" },
  { symbol: "♦", color: "red" },
  { symbol: "♣", color: "black" },
] as const;

function getPokerSuit(number: number) {
  return POKER_SUITS[Math.abs(number - 1) % 4];
}

function renderPokerFace(
  value: number | string,
  options: { main?: boolean; cardId?: string; valueId?: string } = {}
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return renderPokerBack(String(value));
  }

  const suit = getPokerSuit(parsed);
  const rank = String(parsed);
  const mainClass = options.main ? " poker-card-main" : "";
  const cardId = options.cardId ? ` id="${options.cardId}"` : "";
  const valueId = options.valueId ? ` id="${options.valueId}"` : "";

  return `
    <div class="playing-card poker-card poker-card-${suit.color}${mainClass}"${cardId} data-value="${parsed}">
      <div class="poker-corner poker-corner-tl">
        <span class="poker-rank">${rank}</span>
        <span class="poker-suit">${suit.symbol}</span>
      </div>
      <div class="poker-center">
        <span class="poker-center-value pop-target"${valueId}>${rank}</span>
        <span class="poker-center-suit">${suit.symbol}</span>
      </div>
      <div class="poker-corner poker-corner-br">
        <span class="poker-rank">${rank}</span>
        <span class="poker-suit">${suit.symbol}</span>
      </div>
    </div>
  `;
}

function renderPokerBack(label = "") {
  return `
    <div class="playing-card poker-card poker-card-back">
      <div class="poker-back-frame">
        <div class="poker-back-inner">${label ? `<span>${label}</span>` : ""}</div>
      </div>
    </div>
  `;
}

function renderPokerRangeCard() {
  return `
    <div class="playing-card poker-card poker-card-range poker-card-black">
      <div class="poker-corner poker-corner-tl">
        <span class="poker-rank">1</span>
        <span class="poker-suit">♠</span>
      </div>
      <div class="poker-center">
        <span class="poker-center-value poker-range-label">1-100</span>
        <span class="poker-center-suit">♣</span>
      </div>
      <div class="poker-corner poker-corner-br">
        <span class="poker-rank">100</span>
        <span class="poker-suit">♣</span>
      </div>
    </div>
  `;
}

function applyPokerCardValue(card: HTMLElement, value: number) {
  const suit = getPokerSuit(value);
  const rank = String(value);
  card.className = `playing-card poker-card poker-card-${suit.color} poker-card-main`;
  card.dataset.value = rank;
  card.querySelectorAll(".poker-rank").forEach((element) => {
    element.textContent = rank;
  });
  card.querySelectorAll(".poker-suit").forEach((element) => {
    element.textContent = suit.symbol;
  });
  const center = card.querySelector(".poker-center-value");
  if (center) center.textContent = rank;
  const centerSuit = card.querySelector(".poker-center-suit");
  if (centerSuit) centerSuit.textContent = suit.symbol;
}

function showToast(message: string, type: "info" | "error" = "info") {
  state.toast = message;
  state.toastType = type;
  updateToast();
  window.setTimeout(() => {
    state.toast = null;
    updateToast();
  }, 3600);
}

function updateToast() {
  const existing = document.querySelector(".toast");
  if (!state.toast) {
    existing?.remove();
    return;
  }

  const toast =
    existing instanceof HTMLElement
      ? existing
      : (() => {
          const element = document.createElement("div");
          document.body.appendChild(element);
          return element;
        })();

  toast.className = `toast ${state.toastType === "error" ? "toast-error" : "toast-info"}`;
  toast.textContent = state.toast;
}

function updateCaptchaHelp() {
  const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-captcha-help"]');
  if (button) {
    button.setAttribute("aria-expanded", String(state.showCaptchaHelp));
  }

  const field = document.querySelector(".captcha-field");
  if (!field) return;

  let help = field.querySelector<HTMLElement>(".captcha-help-text");
  if (state.showCaptchaHelp) {
    if (!help) {
      help = document.createElement("p");
      help.className = "captcha-help-text";
      help.textContent = "드래그하여 문제를 확인하세요.";
      const row = field.querySelector(".captcha-row");
      if (row) {
        field.insertBefore(help, row);
      } else {
        field.appendChild(help);
      }
    }
  } else {
    help?.remove();
  }
}

function setBusy(isBusy: boolean) {
  state.isBusy = isBusy;
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    if (button.dataset.busyToggle === "true") {
      button.disabled = isBusy;
    }
  });
}

async function withBusy<T>(task: () => Promise<T>): Promise<T | null> {
  setBusy(true);
  try {
    return await task();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "오류가 발생했습니다.", "error");
    return null;
  } finally {
    setBusy(false);
  }
}

async function loadCaptcha(options: { silent?: boolean } = {}) {
  try {
    state.captcha = await api.captcha();
    updateCaptchaFields();
  } catch (error) {
    state.captcha = null;
    updateCaptchaFields();
    if (!options.silent) {
      showToast(
        error instanceof Error ? error.message : "보안코드를 불러오지 못했습니다.",
        "error"
      );
    }
  }
}

function updateCaptchaFields() {
  const box = document.querySelector<HTMLElement>(".captcha-box");
  const hidden = document.querySelector<HTMLInputElement>('input[name="captchaId"]');
  const answer = document.querySelector<HTMLInputElement>('input[name="captchaAnswer"]');

  if (box) {
    box.textContent = state.captcha?.question ?? "불러오는 중...";
  }
  if (hidden) {
    hidden.value = state.captcha?.captchaId ?? "";
  }
  if (answer && document.activeElement !== answer) {
    answer.value = "";
  }
}

async function refreshRankings() {
  try {
    const data = await api.rankings();
    state.rankings = data.rankings;
    state.rankingUpdatedAt = data.updatedAt;
    if (data.myRank && state.user) {
      state.user = data.myRank;
    }
    if (state.user) render();
  } catch {
    // ranking failures should not block auth or gameplay
  }
}

async function bootstrap() {
  bindGlobalEvents();

  if (state.authMode === "register") {
    await loadCaptcha();
  }

  await refreshRankings();
  rankingTimer = window.setInterval(refreshRankings, 5000);

  if (getToken()) {
    try {
      const result = await api.me();
      state.user = result.user;
      state.activeSession = result.activeSession;

      if (result.activeSession) {
        const gameState = await api.gameState();
        state.board = gameState.board ?? null;
      }

      void loadSessionInfo();
      startSessionClock();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setToken(null);
      }
    }
  }

  render();
}

function renderSiteFooter() {
  return `
    <footer class="site-footer">
      <a
        class="creator-card"
        href="https://instagram.com/xvzeon_"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="xvzeon_ Instagram 프로필 열기"
      >
        <span class="creator-card-ring" aria-hidden="true"></span>
        <span class="creator-card-label">MADE BY</span>
        <span class="creator-card-handle">xvzeon_</span>
        <span class="creator-card-action">Instagram</span>
      </a>
    </footer>
  `;
}

function renderAuthModal() {
  const captchaBlock =
    state.authMode === "register"
      ? `
        <div class="captcha-field">
          <div class="captcha-label-row">
            <span>보안코드</span>
            <button
              type="button"
              class="captcha-help-btn"
              data-action="toggle-captcha-help"
              aria-expanded="${state.showCaptchaHelp}"
            >
              설명
            </button>
          </div>
          ${
            state.showCaptchaHelp
              ? `<p class="captcha-help-text">드래그하여 문제를 확인하세요.</p>`
              : ""
          }
          <div class="captcha-row">
            <div class="captcha-box text-readable" draggable="true">${state.captcha?.question ?? "불러오는 중..."}</div>
            <button
              class="btn btn-ghost captcha-refresh"
              type="button"
              data-action="refresh-captcha"
              data-busy-toggle="true"
            >
              새로고침
            </button>
          </div>
          <label>
            <span class="sr-only">보안코드 정답</span>
            <input
              name="captchaAnswer"
              inputmode="numeric"
              autocomplete="off"
              placeholder="정답 입력"
              required
            />
          </label>
          <input type="hidden" name="captchaId" value="${state.captcha?.captchaId ?? ""}" />
        </div>
      `
      : "";

  return `
    <div class="modal-backdrop">
      <div class="modal card-surface holo-border">
        <div class="modal-header">
          <h2 class="holo-text">${state.authMode === "login" ? "로그인" : "회원가입"}</h2>
          <p class="text-readable">가상 돈만 사용하는 UP/DOWN 게임입니다.</p>
        </div>
        <form id="auth-form" class="auth-form">
          <label>
            <span>닉네임</span>
            <input name="nickname" maxlength="16" autocomplete="username" required />
          </label>
          <label>
            <span>비밀번호</span>
            <input name="password" type="password" minlength="6" maxlength="64" autocomplete="current-password" required />
          </label>
          ${captchaBlock}
          <label class="remember-row">
            <input
              type="checkbox"
              name="rememberMe"
              ${state.rememberLogin ? "checked" : ""}
            />
            <span>로그인 유지</span>
          </label>
          <button class="btn btn-primary holo-btn" type="submit" data-busy-toggle="true" ${state.isBusy ? "disabled" : ""}>
            ${state.authMode === "login" ? "로그인" : "가입하고 시작"}
          </button>
        </form>
        <div class="auth-switch-row">
          <button class="link-btn holo-link ${state.authMode === "login" ? "active" : ""}" type="button" data-action="set-login">
            로그인
          </button>
          <span class="auth-divider">|</span>
          <button class="link-btn holo-link ${state.authMode === "register" ? "active" : ""}" type="button" data-action="set-register">
            회원가입
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderMainNav() {
  return `
    <nav class="main-nav-image" aria-label="메인 메뉴">
      <div class="main-nav-inner">
        <button
          class="nav-side-btn nav-left ${state.activeGame === "oddeven" ? "active" : ""}"
          type="button"
          data-action="nav-oddeven"
        >
          홀짝
        </button>
        <button
          class="nav-side-btn nav-right ${state.activeGame === "updown" ? "active" : ""}"
          type="button"
          data-action="nav-updown"
        >
          업다운
        </button>
      </div>
      ${renderMainMenuPanel()}
    </nav>
  `;
}

function renderMainMenuPanel() {
  return `
    <div class="main-menu-panel">
      <div class="menu-info-row">
        <div class="menu-info-card">
          <span>현재 시각</span>
          <strong id="session-time">${formatSessionTime()}</strong>
        </div>
        <div class="menu-info-card">
          <span>접속 IP</span>
          <strong id="session-ip">${state.sessionIp}</strong>
        </div>
        <div class="menu-info-card">
          <span>접속 기기</span>
          <strong id="session-device">${detectDeviceLabel()}</strong>
        </div>
      </div>
      <div class="menu-link-row">
        <button type="button" data-action="open-profile">회원정보</button>
        <button type="button" data-action="open-notice">공지사항</button>
        <button type="button" data-action="open-patch">패치노트</button>
      </div>
    </div>
  `;
}

function renderInfoModal() {
  if (!state.activeModal || !state.user) return "";

  const titles = {
    profile: "회원정보",
    notice: "공지사항",
    patch: "패치노트",
  } as const;

  const bodies = {
    profile: `
      <div class="info-grid">
        <div><span>닉네임</span><strong>${state.user.nickname}</strong></div>
        <div><span>소지금</span><strong>${formatMoney(state.user.points)}</strong></div>
        <div><span>내 랭킹</span><strong>${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
        <div><span>최고 연승</span><strong>${state.user.maxStreak}</strong></div>
        <div><span>최고 획득</span><strong>${formatMoney(state.user.maxSessionGain)}</strong></div>
        <div><span>전적</span><strong>${state.user.wins}승 ${state.user.losses}패</strong></div>
      </div>
    `,
    notice: `
      <ul class="info-list">
        <li>1zuxm은 가상 돈만 사용하는 예측 게임입니다.</li>
        <li>실제 환전, 출금 기능은 없습니다.</li>
        <li>게임 중 그만하기를 눌러야 베팅금액이 소지금에 반영됩니다.</li>
      </ul>
    `,
    patch: `
      <ul class="info-list">
        <li><strong>v1.4</strong> 확률 공개 제거, 베팅금액 직접 입력</li>
        <li><strong>v1.3</strong> 포인트 → 원(돈) 표기, 시작 금액 10,000원</li>
        <li><strong>v1.2</strong> 카드형 UI, 상단 메뉴, 로그인 유지 추가</li>
        <li><strong>v1.1</strong> 보안코드, 홀로그램 UI, Render 배포</li>
        <li><strong>v1.0</strong> UP/DOWN 숫자 예측 게임 오픈</li>
      </ul>
    `,
  } as const;

  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal card-surface holo-border info-modal" role="dialog" aria-modal="true">
        <div class="modal-header info-modal-header">
          <h2 class="holo-text">${titles[state.activeModal]}</h2>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button>
        </div>
        <div class="info-modal-body">${bodies[state.activeModal]}</div>
      </div>
    </div>
  `;
}

function renderOddEvenPlaceholder() {
  return `
    <section class="game-board card-surface holo-border coming-soon-board">
      <div class="coming-soon-inner">
        <span class="coming-soon-badge">COMING SOON</span>
        <h2 class="holo-text">홀짝</h2>
        <p class="text-readable">홀짝 게임은 준비 중입니다. 지금은 업다운을 이용해 주세요.</p>
        <button class="btn btn-primary holo-btn" type="button" data-action="nav-updown">업다운으로 이동</button>
      </div>
    </section>
  `;
}

function renderRankingPanel() {
  const myRankText = state.user?.rank ? `#${state.user.rank}` : "-";

  return `
    <aside class="ranking-panel card-surface holo-border">
      <div class="panel-header">
        <h2 class="holo-text">실시간 랭킹</h2>
        <span class="live-dot holo-text">LIVE</span>
      </div>
      <div class="my-rank-box">
        <span>내 순위</span>
        <strong class="holo-text">${myRankText}</strong>
        <span>${state.user?.nickname ?? "게스트"}</span>
        <strong class="holo-text">${formatMoney(state.user?.points ?? 0)}</strong>
      </div>
      <div class="ranking-table-wrap">
        <table>
          <thead>
            <tr>
              <th>순위</th>
              <th>닉네임</th>
              <th>보유</th>
              <th>연승</th>
              <th>최고획득</th>
            </tr>
          </thead>
          <tbody>
            ${
              state.rankings.length === 0
                ? `<tr><td colspan="5" class="empty-row">랭킹 데이터를 불러오는 중...</td></tr>`
                : state.rankings
                    .map(
                      (row) => `
                <tr class="${state.user?.nickname === row.nickname ? "is-me" : ""}">
                  <td class="holo-text">#${row.rank}</td>
                  <td>${row.nickname}</td>
                  <td>${formatMoney(row.points)}</td>
                  <td>${row.maxStreak}</td>
                  <td>${formatMoney(row.maxSessionGain)}</td>
                </tr>
              `
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
      <p class="ranking-updated">업데이트: ${state.rankingUpdatedAt ? new Date(state.rankingUpdatedAt).toLocaleTimeString("ko-KR") : "-"}</p>
    </aside>
  `;
}

function renderGameBoard() {
  const session = state.activeSession;
  const board = state.board;
  const currentNumber = board?.currentNumber ?? session?.currentNumber ?? "--";
  const bettingAmount = session?.sessionPoints ?? 0;
  const canPlay = Boolean(session?.isActive);
  const canCashout = canPlay && bettingAmount > 0;
  const upPercent = board?.probabilities.up ?? 0;
  const downPercent = board?.probabilities.down ?? 0;
  const tiePercent = board?.probabilities.tie ?? 0;
  const winMultiplier = 2;
  const nextPreview = canPlay ? "?" : "--";
  const balance = state.user?.points ?? 0;
  const presetAmounts = [1000, 5000, 10000].filter((amount) => amount <= balance);
  const canStart = balance > 0;

  return `
    <section class="game-board card-surface holo-border ${canPlay ? "game-board--playing" : "game-board--setup"} ${state.lastResult?.type ?? ""}">
      <div class="card-table">
        <div class="card-slot">
          <span class="card-slot-label">숫자 범위</span>
          ${renderPokerRangeCard()}
        </div>
        <div class="card-slot card-slot-main">
          <span class="card-slot-label">현재 숫자</span>
          ${renderPokerFace(currentNumber, {
            main: true,
            cardId: "current-poker-card",
            valueId: "current-number",
          })}
        </div>
        <div class="card-slot">
          <span class="card-slot-label">다음 숫자</span>
          ${renderPokerBack(nextPreview)}
        </div>
      </div>

      <div class="status-row">
        <div class="status-chip status-balance">
          <span>소지금</span>
          <strong>${formatMoney(state.user?.points ?? 0)}</strong>
        </div>
        <div class="status-chip status-bet ${bettingAmount > 0 ? "active" : ""}">
          <span>베팅금액</span>
          <strong id="pending-points" class="holo-text">${formatMoney(bettingAmount)}</strong>
        </div>
        <div class="status-chip status-streak">
          <span>연승</span>
          <strong>${session?.currentStreak ?? 0}</strong>
        </div>
      </div>

      ${
        canPlay
          ? `
        <div class="choice-row choice-dock">
          <button class="choice-card choice-up" data-action="guess-up" data-busy-toggle="true">
            <span class="choice-label">업 ▲</span>
            <div class="choice-face">
              <span>확률 ${upPercent}%</span>
              <strong>성공 시 x${winMultiplier}</strong>
            </div>
          </button>
          <div class="choice-card choice-tie choice-static">
            <span class="choice-label">동일 =</span>
            <div class="choice-face">
              <span>확률 ${tiePercent}%</span>
              <strong>실패 처리</strong>
            </div>
          </div>
          <button class="choice-card choice-down" data-action="guess-down" data-busy-toggle="true">
            <span class="choice-label">다운 ▼</span>
            <div class="choice-face">
              <span>확률 ${downPercent}%</span>
              <strong>성공 시 x${winMultiplier}</strong>
            </div>
          </button>
        </div>
      `
          : ""
      }

      <div class="bet-panel holo-border ${canPlay ? "bet-panel-active bet-panel-playing" : "bet-panel-setup"}">
        ${
          canPlay
            ? `
          <p class="bet-panel-title">진행 중 · 맞출 때마다 베팅금액 ${winMultiplier}배</p>
          <div class="bet-panel-row">
            <div class="bet-amount-display">
              <span class="bet-amount-label">현재 베팅금액</span>
              <strong id="bet-display">${formatMoney(bettingAmount)}</strong>
            </div>
            <button class="btn btn-cashout" data-action="cashout" data-busy-toggle="true" ${!canCashout ? "disabled" : ""}>그만하기</button>
          </div>
          <small>그만하기를 누르면 베팅금액 전체가 소지금으로 들어옵니다. 실패하면 베팅금액을 잃습니다.</small>
        `
            : `
          <div class="bet-input-header">
            <span class="bet-required-badge">필수 입력</span>
            <h3 class="bet-input-title holo-text">베팅금액을 입력하세요</h3>
          </div>
          <p class="bet-input-guide">
            <strong>베팅금액(원)을 입력해야</strong> 게임을 시작할 수 있습니다. 입력 즉시 소지금에서 차감됩니다.
          </p>
          <label class="bet-input-label" for="bet-amount-input">베팅금액 (원)</label>
          <div class="bet-input-row">
            <input
              id="bet-amount-input"
              class="bet-amount-input"
              type="number"
              inputmode="numeric"
              min="1"
              max="${balance}"
              placeholder="예: 1000"
              value="${state.betInput}"
              ${canStart ? "" : "disabled"}
            />
            <span class="bet-input-unit">원</span>
          </div>
          <p class="bet-input-hint">현재 소지금 ${formatMoney(balance)} · 1원 이상, 소지금 이하만 베팅 가능</p>
          ${
            presetAmounts.length > 0
              ? `
            <div class="bet-preset-row">
              ${presetAmounts
                .map(
                  (amount) =>
                    `<button type="button" class="bet-preset-btn" data-action="set-bet" data-amount="${amount}">${amount.toLocaleString("ko-KR")}원</button>`
                )
                .join("")}
              ${
                balance > 0
                  ? `<button type="button" class="bet-preset-btn" data-action="set-bet" data-amount="${balance}">전액</button>`
                  : ""
              }
            </div>
          `
              : ""
          }
          <button class="btn btn-primary holo-btn bet-start-btn" data-action="start-game" data-busy-toggle="true" ${canStart ? "" : "disabled"}>
            베팅하고 게임 시작
          </button>
          ${
            state.user && state.user.points === 0 && !state.user.bonusClaimed
              ? `<button class="btn btn-secondary bonus-btn" data-action="claim-bonus" data-busy-toggle="true">무료 10,000원 받기</button>`
              : ""
          }
        `
        }
      </div>

      ${
        state.lastResult
          ? `
        <div class="result-banner ${state.lastResult.type.toLowerCase()}">
          <span>${state.lastResult.previousNumber} → ${state.lastResult.nextNumber}</span>
          <strong class="holo-text">${state.lastResult.type === "WIN" ? "성공" : state.lastResult.type === "TIE" ? "동일 숫자" : "실패"}</strong>
          ${state.lastResult.message ? `<p>${state.lastResult.message}</p>` : ""}
        </div>
      `
          : ""
      }
    </section>
  `;
}

function renderApp() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  if (!state.user) {
    app.innerHTML = `
      <div class="page-shell auth-page">
        <header class="topbar">
          <div class="brand">
            <span class="brand-mark holo-text">1ZUXM</span>
            <span class="brand-sub">Virtual Money Game</span>
          </div>
        </header>
        ${renderAuthModal()}
        ${renderSiteFooter()}
      </div>
    `;
    updateToast();
    return;
  }

  app.innerHTML = `
    <div class="page-shell game-page${state.activeSession?.isActive ? " is-playing" : ""}">
      <header class="site-header">
        <div class="brand">
          <span class="brand-mark holo-text">1ZUXM</span>
          <span class="brand-sub">${state.user.nickname}</span>
        </div>
        <button class="btn btn-ghost header-logout" data-action="logout" type="button">로그아웃</button>
      </header>

      ${renderMainNav()}

      <main class="layout">
        <section class="main-column">
          ${state.activeGame === "updown" ? renderGameBoard() : renderOddEvenPlaceholder()}
        </section>
        ${renderRankingPanel()}
      </main>
      ${renderInfoModal()}
      ${renderSiteFooter()}
    </div>
  `;
  updateToast();
  if (state.user) {
    startSessionClock();
  }
}

function render() {
  renderApp();
}

async function switchAuthMode(mode: "login" | "register") {
  state.authMode = mode;
  state.showCaptchaHelp = false;
  if (mode === "register") {
    await loadCaptcha({ silent: true });
  } else {
    state.captcha = null;
  }
  render();
}

async function handleAuthSubmit(form: HTMLFormElement) {
  const formData = new FormData(form);
  const nickname = String(formData.get("nickname") ?? "");
  const password = String(formData.get("password") ?? "");
  const rememberMe = formData.get("rememberMe") === "on";
  state.rememberLogin = rememberMe;
  setRememberLogin(rememberMe);

  if (state.authMode === "register") {
    const captchaId = String(formData.get("captchaId") ?? "");
    const captchaAnswer = String(formData.get("captchaAnswer") ?? "");

    const result = await withBusy(async () =>
      api.register(nickname, password, captchaId, captchaAnswer)
    );

    if (!result) {
      await loadCaptcha({ silent: true });
      return;
    }

    setToken(result.token);
    setRememberLogin(true);
    state.rememberLogin = true;
    state.user = result.user;
    state.activeSession = null;
    state.board = null;
    state.lastResult = null;
    showToast(`${result.user.nickname}님, 환영합니다.`);
    void loadSessionInfo();
    startSessionClock();
    render();
    return;
  }

  const result = await withBusy(async () =>
    api.login(nickname, password, rememberMe)
  );
  if (!result) return;

  setToken(result.token);
  setRememberLogin(rememberMe);
  state.rememberLogin = rememberMe;
  state.user = result.user;
  state.activeSession = null;
  state.board = null;
  state.lastResult = null;
  showToast(`${result.user.nickname}님, 환영합니다.`);
  void loadSessionInfo();
  startSessionClock();
  render();
}

function getBetAmountFromInput(): number {
  const input = document.querySelector<HTMLInputElement>("#bet-amount-input");
  const raw = input?.value ?? state.betInput;
  return Math.floor(Number(raw));
}

function bindGlobalEvents() {
  if (eventsBound) return;
  eventsBound = true;

  const app = document.querySelector("#app");
  if (!app) return;

  app.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || target.id !== "auth-form") return;
    event.preventDefault();
    void handleAuthSubmit(target);
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.id !== "bet-amount-input") return;
    state.betInput = target.value;
    target.classList.remove("bet-input-error");
  });

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    if (!action) return;

    if (action === "refresh-captcha") {
      if (!(button instanceof HTMLButtonElement)) return;
      if (target.closest(".captcha-box")) return;
      if (target !== button && !button.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      void loadCaptcha();
      return;
    }

    if (action === "toggle-captcha-help") {
      event.preventDefault();
      state.showCaptchaHelp = !state.showCaptchaHelp;
      updateCaptchaHelp();
      return;
    }

    if (action === "close-modal") {
      const backdrop = target.closest(".modal-backdrop");
      if (backdrop && target !== backdrop && !target.closest(".modal-close")) return;
      event.preventDefault();
      state.activeModal = null;
      render();
      return;
    }

    event.preventDefault();

    switch (action) {
      case "nav-updown":
        state.activeGame = "updown";
        render();
        break;
      case "nav-oddeven":
        state.activeGame = "oddeven";
        render();
        break;
      case "open-profile":
        state.activeModal = "profile";
        render();
        break;
      case "open-notice":
        state.activeModal = "notice";
        render();
        break;
      case "open-patch":
        state.activeModal = "patch";
        render();
        break;
      case "set-login":
        void switchAuthMode("login");
        break;
      case "set-register":
        void switchAuthMode("register");
        break;
      case "logout":
        setToken(null);
        state.user = null;
        state.activeSession = null;
        state.board = null;
        state.lastResult = null;
        state.activeModal = null;
        render();
        break;
      case "start-game": {
        const betAmount = getBetAmountFromInput();
        if (!betAmount || betAmount <= 0) {
          showToast("베팅금액을 입력해 주세요. 게임 시작 전에 금액을 꼭 입력해야 합니다.", "error");
          const input = document.querySelector<HTMLInputElement>("#bet-amount-input");
          input?.classList.add("bet-input-error");
          input?.focus();
          break;
        }
        void withBusy(async () => api.startGame(betAmount)).then((result) => {
          if (!result) return;
          state.activeSession = result.activeSession;
          state.board = result.board;
          state.lastResult = null;
          state.betInput = "";
          if (result.user) state.user = result.user;
          if (result.message) showToast(result.message);
          else showToast(`${formatMoney(betAmount)} 베팅으로 게임을 시작했습니다.`);
          render();
        });
        break;
      }
      case "set-bet": {
        const amount = Math.floor(Number(button.dataset.amount));
        if (!Number.isFinite(amount) || amount <= 0) break;
        state.betInput = String(amount);
        render();
        document.querySelector<HTMLInputElement>("#bet-amount-input")?.focus();
        break;
      }
      case "claim-bonus":
        void withBusy(async () => api.claimBonus()).then((result) => {
          if (!result) return;
          state.user = result.user;
          showToast(result.message);
          render();
        });
        break;
      case "guess-up":
        void handleGuess("UP");
        break;
      case "guess-down":
        void handleGuess("DOWN");
        break;
      case "cashout":
        void withBusy(async () => api.cashout()).then(async (result) => {
          if (!result) return;
          state.user = result.user;
          state.activeSession = null;
          state.board = null;
          state.lastResult = null;
          animatePointsGain(result.earned);
          showToast(result.message);
          await refreshRankings();
          render();
        });
        break;
      default:
        break;
    }
  });
}

async function handleGuess(choice: "UP" | "DOWN") {
  const result = await withBusy(async () => api.guess(choice));
  if (!result) return;

  state.lastResult = {
    type: result.result,
    previousNumber: result.previousNumber,
    nextNumber: result.nextNumber,
    message: result.message,
  };

  if (result.result === "WIN") {
    state.activeSession = result.activeSession;
    state.board = result.board ?? null;
    showToast(`성공! 베팅금액 2배 · ${formatMoney((result.gain ?? 0) * 2)}`);
  } else {
    state.activeSession = null;
    state.board = null;
    if (result.user) state.user = result.user;
    showToast(result.message ?? "게임이 종료되었습니다.");
    await refreshRankings();
  }

  render();
  animateNumberChange(result.previousNumber, result.nextNumber);
  if (result.result === "WIN" && result.gain) animatePointsGain(result.gain);
}

function animateNumberChange(from: number, to: number) {
  const card = document.querySelector<HTMLElement>("#current-poker-card");
  if (!card) return;

  card.classList.add("rolling");
  applyPokerCardValue(card, from);

  window.setTimeout(() => {
    applyPokerCardValue(card, to);
    card.classList.remove("rolling");
    card.classList.add("pop");
    window.setTimeout(() => card.classList.remove("pop"), 450);
  }, 180);
}

function animatePointsGain(amount: number) {
  const targets = [
    document.querySelector<HTMLElement>("#pending-points"),
    document.querySelector<HTMLElement>("#bet-display"),
  ];
  for (const element of targets) {
    if (!element || amount <= 0) continue;
    element.classList.add("gain-pop");
    window.setTimeout(() => element.classList.remove("gain-pop"), 600);
  }
}

bootstrap();
