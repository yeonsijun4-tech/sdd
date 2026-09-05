import {
  api,
  ApiError,
  getRememberLogin,
  getToken,
  setRememberLogin,
  setToken,
  type ActiveSession,
  type CaptchaChallenge,
  type PublicUser,
  type RankingEntry,
} from "./api";
import { canPlace, type BlastState, type Piece } from "./blockBlast";
import { isBgmEnabled, pauseBgm, setBgmEnabled, syncBgmForLoggedInUser } from "./bgm";
import { formatPoints } from "./points";
import { isBlockedErrorMessage, sanitizeUserMessage, shouldSilenceErrorToast } from "./userMessage";
import "./styles.css";

interface AppState {
  user: PublicUser | null;
  blast: BlastState | null;
  activeSession: ActiveSession | null;
  rankings: RankingEntry[];
  rankingUpdatedAt: string;
  isBusy: boolean;
  authMode: "login" | "register";
  captcha: CaptchaChallenge | null;
  showCaptchaHelp: boolean;
  toast: string | null;
  toastType: "info" | "error";
  lastErrorToastMessage: string;
  lastErrorToastAt: number;
  activeModal: "profile" | "notice" | "patch" | null;
  rememberLogin: boolean;
  sessionIp: string;
  onlineCount: number;
  bgmEnabled: boolean;
  authDraft: {
    nickname: string;
    password: string;
    accessCode: string;
    captchaAnswer: string;
  };
  authSubmitting: boolean;
  pendingAuth: { token: string; rememberMe: boolean; nickname: string } | null;
  selectedPiece: number | null;
  hoverCell: { row: number; col: number } | null;
}

const GAME_ICON = "/assets/1zuxm-icon.png";
const LOGIN_ACCESS_CODE = "0828";
const DEV_NICKNAMES = ["ysjyoun", "ysjyoun0"];

const state: AppState = {
  user: null,
  blast: null,
  activeSession: null,
  rankings: [],
  rankingUpdatedAt: "",
  isBusy: false,
  authMode: "login",
  captcha: null,
  showCaptchaHelp: false,
  toast: null,
  toastType: "info",
  lastErrorToastMessage: "",
  lastErrorToastAt: 0,
  activeModal: null,
  rememberLogin: getRememberLogin(),
  sessionIp: "확인 중",
  onlineCount: 0,
  bgmEnabled: isBgmEnabled(),
  authDraft: { nickname: "", password: "", accessCode: "", captchaAnswer: "" },
  authSubmitting: false,
  pendingAuth: null,
  selectedPiece: null,
  hoverCell: null,
};

let rankingTimer: number | null = null;
let presenceTimer: number | null = null;
let sessionClockTimer: number | null = null;
let eventsBound = false;

function isDevNickname(nickname: string): boolean {
  return DEV_NICKNAMES.some((name) => name.toLowerCase() === nickname.toLowerCase());
}

function renderNicknameWithDevBadge(nickname: string): string {
  return isDevNickname(nickname)
    ? `${escapeHtml(nickname)} <span class="dev-badge">DEV</span>`
    : escapeHtml(nickname);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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

function formatOnlineCount(count: number): string {
  return `${count.toLocaleString("ko-KR")}명`;
}

function showToast(message: string, type: "info" | "error" = "info") {
  const displayMessage = type === "error" ? sanitizeUserMessage(message) : message;
  if (type === "error" && (!displayMessage || isBlockedErrorMessage(displayMessage))) return;
  const now = Date.now();
  if (type === "error" && displayMessage === state.lastErrorToastMessage && now - state.lastErrorToastAt < 3000) {
    return;
  }
  if (type === "error") {
    state.lastErrorToastMessage = displayMessage;
    state.lastErrorToastAt = now;
  }
  state.toast = displayMessage;
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

function setBusy(isBusy: boolean) {
  state.isBusy = isBusy;
}

function formatActionError(error: unknown): string {
  if (shouldSilenceErrorToast(error)) return "";
  if (error instanceof Error) return sanitizeUserMessage(error.message);
  return "";
}

async function withBusy<T>(task: () => Promise<T>): Promise<T | null> {
  setBusy(true);
  try {
    return await task();
  } catch (error) {
    const message = formatActionError(error);
    if (message) showToast(message, "error");
    return null;
  } finally {
    setBusy(false);
  }
}

function getAuthSubmitLabel(mode = state.authMode): string {
  return mode === "login" ? "로그인" : "가입하고 시작";
}

function setAuthSubmitting(isSubmitting: boolean) {
  state.authSubmitting = isSubmitting;
  const submitButton = document.querySelector<HTMLButtonElement>('[data-action="auth-submit"]');
  if (!submitButton) return;
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting
    ? state.authMode === "login"
      ? "로그인 중..."
      : "가입 처리 중..."
    : getAuthSubmitLabel();
}

async function loadCaptcha(options: { silent?: boolean } = {}) {
  try {
    state.captcha = await api.captcha();
    updateCaptchaFields();
  } catch (error) {
    state.captcha = null;
    updateCaptchaFields();
    if (!options.silent) {
      showToast(error instanceof Error ? error.message : "보안코드를 불러오지 못했습니다.", "error");
    }
  }
}

function updateCaptchaFields() {
  const box = document.querySelector<HTMLElement>(".captcha-box");
  const hidden = document.querySelector<HTMLInputElement>('input[name="captchaId"]');
  const answer = document.querySelector<HTMLInputElement>('input[name="captchaAnswer"]');
  if (box) box.textContent = state.captcha?.question ?? "불러오는 중...";
  if (hidden) hidden.value = state.captcha?.captchaId ?? "";
  if (answer && document.activeElement !== answer) answer.value = "";
}

function updateCaptchaHelp() {
  const button = document.querySelector<HTMLButtonElement>('[data-action="toggle-captcha-help"]');
  if (button) button.setAttribute("aria-expanded", String(state.showCaptchaHelp));
  const field = document.querySelector(".captcha-field");
  if (!field) return;
  let help = field.querySelector<HTMLElement>(".captcha-help-text");
  if (state.showCaptchaHelp) {
    if (!help) {
      help = document.createElement("p");
      help.className = "captcha-help-text";
      help.textContent = "드래그하여 문제를 확인하세요.";
      field.insertBefore(help, field.querySelector(".captcha-row"));
    }
  } else {
    help?.remove();
  }
}

async function refreshRankings() {
  try {
    const data = await api.rankings();
    state.rankings = data.rankings;
    state.rankingUpdatedAt = data.updatedAt;
    if (data.myRank && state.user) state.user = data.myRank;
    if (state.user) updateRankingPanelDom();
  } catch {
    // ignore ranking errors
  }
}

function getPresenceClientId(): string {
  const key = "1zuxm_presence_client";
  let clientId = sessionStorage.getItem(key);
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem(key, clientId);
  }
  return clientId;
}

async function sendPresenceHeartbeat() {
  try {
    const result = await api.presenceHeartbeat(getPresenceClientId());
    state.onlineCount = result.count;
    const element = document.querySelector<HTMLElement>("#online-count");
    if (element) element.textContent = formatOnlineCount(state.onlineCount);
  } catch {
    // ignore
  }
}

function startPresenceTracking() {
  void sendPresenceHeartbeat();
  if (presenceTimer) return;
  presenceTimer = window.setInterval(() => void sendPresenceHeartbeat(), 30000);
}

async function loadSessionInfo() {
  try {
    const info = await api.sessionInfo();
    state.sessionIp = info.ip;
    const ipElement = document.querySelector<HTMLElement>("#session-ip");
    if (ipElement) ipElement.textContent = info.ip;
  } catch {
    state.sessionIp = "확인 불가";
  }
}

function startSessionClock() {
  const update = () => {
    const element = document.querySelector<HTMLElement>("#session-time");
    if (element) element.textContent = formatSessionTime();
  };
  update();
  if (sessionClockTimer) return;
  sessionClockTimer = window.setInterval(update, 1000);
}

function applyGamePayload(result: {
  activeSession: ActiveSession | null;
  blast: BlastState | null;
  user?: PublicUser | null;
}) {
  state.activeSession = result.activeSession;
  state.blast = result.blast ?? result.activeSession?.blast ?? null;
  if (result.user) state.user = result.user;
  state.selectedPiece = null;
  state.hoverCell = null;
}

function renderSiteFooter() {
  return `
    <footer class="site-footer">
      <p class="ncs-credit">
        BGM:
        <a href="https://ncs.io/Phoenix" target="_blank" rel="noopener noreferrer">Netrum &amp; Halvorsen - Phoenix [NCS Release]</a>
        · Music provided by
        <a href="https://www.youtube.com/c/NoCopyrightSounds" target="_blank" rel="noopener noreferrer">NoCopyrightSounds</a>
      </p>
      <a class="creator-card" href="https://instagram.com/xvzeon_" target="_blank" rel="noopener noreferrer" aria-label="xvzeon_ Instagram 프로필 열기">
        <span class="creator-card-ring" aria-hidden="true"></span>
        <span class="creator-card-label">MADE BY</span>
        <span class="creator-card-handle">xvzeon_</span>
        <span class="creator-card-action">Instagram</span>
      </a>
    </footer>
  `;
}

function renderAccessCodeModal() {
  const nickname = state.pendingAuth?.nickname ?? "";
  return `
    <div class="modal-backdrop access-code-backdrop">
      <div class="modal card-surface holo-border access-code-modal">
        <div class="modal-header">
          <h2 class="holo-text">로그인 코드</h2>
          <p class="text-readable">${renderNicknameWithDevBadge(nickname)}님, 입장 코드를 입력해 주세요.</p>
        </div>
        <form id="access-code-form" class="auth-form" novalidate>
          <label>
            <span>로그인 코드</span>
            <input id="access-code-input" name="accessCode" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="로그인 코드 입력" value="${state.authDraft.accessCode}" />
          </label>
          <button class="btn btn-primary holo-btn" type="button" data-action="access-code-submit">입장하기</button>
        </form>
      </div>
    </div>
  `;
}

function renderAuthModal() {
  const captchaBlock =
    state.authMode === "register"
      ? `
        <div class="captcha-field">
          <div class="captcha-label-row">
            <span>보안코드</span>
            <button type="button" class="captcha-help-btn" data-action="toggle-captcha-help" aria-expanded="${state.showCaptchaHelp}">설명</button>
          </div>
          ${state.showCaptchaHelp ? `<p class="captcha-help-text">드래그하여 문제를 확인하세요.</p>` : ""}
          <div class="captcha-row">
            <div class="captcha-box text-readable" draggable="true">${state.captcha?.question ?? "불러오는 중..."}</div>
            <button class="btn btn-ghost captcha-refresh" type="button" data-action="refresh-captcha">새로고침</button>
          </div>
          <label>
            <span class="sr-only">보안코드 정답</span>
            <input name="captchaAnswer" inputmode="numeric" autocomplete="off" placeholder="정답 입력" value="${state.authDraft.captchaAnswer}" />
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
          <p class="text-readable">블록을 놓고 줄을 지워 최고 점수를 겨루세요.</p>
        </div>
        <form id="auth-form" class="auth-form" novalidate>
          <input type="hidden" name="authMode" value="${state.authMode}" />
          <label>
            <span>닉네임</span>
            <input name="nickname" maxlength="16" autocomplete="username" value="${escapeHtml(state.authDraft.nickname)}" />
          </label>
          <label>
            <span>비밀번호</span>
            <input name="password" type="password" minlength="6" maxlength="64" autocomplete="current-password" value="${escapeHtml(state.authDraft.password)}" />
          </label>
          ${captchaBlock}
          <label class="remember-row">
            <input type="checkbox" name="rememberMe" ${state.rememberLogin ? "checked" : ""} />
            <span>로그인 유지</span>
          </label>
          <button class="btn btn-primary holo-btn" type="button" data-action="auth-submit" ${state.authSubmitting ? "disabled" : ""}>
            ${state.authSubmitting ? (state.authMode === "login" ? "로그인 중..." : "가입 처리 중...") : getAuthSubmitLabel()}
          </button>
        </form>
        <div class="auth-switch-row">
          <button class="link-btn holo-link ${state.authMode === "login" ? "active" : ""}" type="button" data-action="set-login">로그인</button>
          <span class="auth-divider">|</span>
          <button class="link-btn holo-link ${state.authMode === "register" ? "active" : ""}" type="button" data-action="set-register">회원가입</button>
        </div>
      </div>
    </div>
  `;
}

function renderInfoModal() {
  if (!state.activeModal || !state.user) return "";
  const titles = { profile: "회원정보", notice: "공지사항", patch: "패치노트" };
  const bodies = {
    profile: `
      <div class="info-grid">
        <div><span>닉네임</span><strong>${renderNicknameWithDevBadge(state.user.nickname)}</strong></div>
        <div><span>최고 점수</span><strong>${formatPoints(state.user.points)}</strong></div>
        <div><span>내 랭킹</span><strong>${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
        <div><span>최고 콤보</span><strong>${state.user.maxStreak}</strong></div>
        <div><span>플레이</span><strong>${state.user.gamesPlayed}회</strong></div>
      </div>
      <div class="password-change-panel">
        <h3 class="password-change-title holo-text">비밀번호 변경</h3>
        <form id="password-change-form" class="auth-form password-change-form" novalidate>
          <label><span>현재 비밀번호</span><input name="currentPassword" type="password" /></label>
          <label><span>새 비밀번호</span><input name="newPassword" type="password" minlength="6" /></label>
          <label><span>새 비밀번호 확인</span><input name="confirmPassword" type="password" minlength="6" /></label>
          <button class="btn btn-primary holo-btn" type="button" data-action="change-password">변경하기</button>
        </form>
      </div>
    `,
    notice: `
      <ul class="info-list">
        <li>블록을 보드에 놓아 가로·세로 줄을 완성하면 지워집니다.</li>
        <li>한 번에 여러 줄을 지우면 콤보 점수가 올라갑니다.</li>
        <li>더 이상 블록을 놓을 수 없으면 게임 오버입니다.</li>
        <li>랭킹은 최고 점수 기준입니다.</li>
      </ul>
    `,
    patch: `
      <div class="patch-version-block patch-version-latest">
        <h3 class="holo-text">Block Blast</h3>
        <p class="patch-version-summary">UP/DOWN을 종료하고 블록 퍼즐로 전환했습니다.</p>
        <ul class="info-list">
          <li>8x8 보드에 블록 3개를 놓는 방식</li>
          <li>로그인·회원가입·랭킹 유지</li>
          <li>최고 점수로 순위 집계</li>
        </ul>
      </div>
    `,
  };

  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal card-surface holo-border info-modal">
        <div class="info-modal-header">
          <h2 class="holo-text">${titles[state.activeModal]}</h2>
          <button class="modal-close" type="button" data-action="close-modal" aria-label="닫기">×</button>
        </div>
        <div class="info-modal-body">${bodies[state.activeModal]}</div>
      </div>
    </div>
  `;
}

function renderMainMenuPanel() {
  return `
    <div class="main-menu-panel">
      <div class="menu-info-row">
        <div class="menu-info-card"><span>현재 시각</span><strong id="session-time">${formatSessionTime()}</strong></div>
        <div class="menu-info-card"><span>접속 IP</span><strong id="session-ip">${state.sessionIp}</strong></div>
        <div class="menu-info-card"><span>접속 기기</span><strong id="session-device">${detectDeviceLabel()}</strong></div>
        <div class="menu-info-card"><span>접속자</span><strong id="online-count">${formatOnlineCount(state.onlineCount)}</strong></div>
      </div>
      <div class="menu-link-row">
        <button type="button" data-action="toggle-bgm">${state.bgmEnabled ? "BGM 끄기" : "BGM 켜기"}</button>
        <button type="button" data-action="open-profile">회원정보</button>
        <button type="button" data-action="open-notice">공지사항</button>
        <button type="button" data-action="open-patch">패치노트</button>
      </div>
    </div>
  `;
}

function renderRankingTableBody() {
  if (state.rankings.length === 0) {
    return `<tr><td colspan="4">아직 기록이 없습니다.</td></tr>`;
  }
  return state.rankings
    .map(
      (row) => `
      <tr>
        <td>${row.rank}</td>
        <td>${renderNicknameWithDevBadge(row.nickname)}</td>
        <td class="ranking-points">${formatPoints(row.points)}</td>
        <td>${row.maxStreak}</td>
      </tr>
    `
    )
    .join("");
}

function updateRankingPanelDom() {
  const wrap = document.querySelector(".ranking-table tbody");
  if (wrap) wrap.innerHTML = renderRankingTableBody();
  const mine = document.querySelector(".ranking-mine");
  if (mine && state.user) {
    mine.innerHTML = `
      <span>내 순위</span>
      <strong class="holo-text">${state.user.rank ? `#${state.user.rank}` : "-"}</strong>
      <span>${renderNicknameWithDevBadge(state.user.nickname)}</span>
      <strong class="holo-text ranking-points">${formatPoints(state.user.points)}</strong>
    `;
  }
}

function renderRankingPanel() {
  return `
    <aside class="ranking-panel card-surface holo-border">
      <div class="panel-header">
        <h2 class="holo-text">랭킹</h2>
        <span>최고 점수</span>
      </div>
      <div class="ranking-mine">
        <span>내 순위</span>
        <strong class="holo-text">${state.user?.rank ? `#${state.user.rank}` : "-"}</strong>
        <span>${state.user ? renderNicknameWithDevBadge(state.user.nickname) : "게스트"}</span>
        <strong class="holo-text ranking-points">${formatPoints(state.user?.points ?? "0")}</strong>
      </div>
      <div class="ranking-table-wrap">
        <table class="ranking-table">
          <thead><tr><th>순위</th><th>닉네임</th><th>최고점수</th><th>콤보</th></tr></thead>
          <tbody>${renderRankingTableBody()}</tbody>
        </table>
      </div>
      <p class="ranking-updated">업데이트: ${state.rankingUpdatedAt ? new Date(state.rankingUpdatedAt).toLocaleTimeString("ko-KR") : "-"}</p>
    </aside>
  `;
}

function previewCells(): Set<string> {
  const cells = new Set<string>();
  const blast = state.blast;
  const piece = blast && state.selectedPiece !== null ? blast.pieces[state.selectedPiece] : null;
  if (!blast || !piece || !state.hoverCell) return cells;
  if (!canPlace(blast.board, piece, state.hoverCell.row, state.hoverCell.col)) return cells;
  piece.shape.forEach((row, r) => {
    row.forEach((value, c) => {
      if (value) cells.add(`${state.hoverCell!.row + r}:${state.hoverCell!.col + c}`);
    });
  });
  return cells;
}

function renderPiece(piece: Piece | null, index: number): string {
  if (!piece) {
    return `<button class="blast-piece blast-piece-empty" type="button" disabled></button>`;
  }
  const selected = state.selectedPiece === index ? " is-selected" : "";
  const rows = piece.shape
    .map(
      (row) =>
        `<span class="blast-piece-row">${row
          .map((cell) => `<span class="blast-mini ${cell ? `c${piece.color}` : "empty"}"></span>`)
          .join("")}</span>`
    )
    .join("");
  return `<button class="blast-piece${selected}" type="button" data-action="select-piece" data-piece="${index}">${rows}</button>`;
}

function renderBlastBoard() {
  const blast = state.blast;
  const preview = previewCells();
  const score = blast?.score ?? 0;
  const combo = blast?.combo ?? 0;
  const over = blast?.gameOver === true;

  const cells = Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => {
      const filled = blast?.board[row]?.[col] ?? 0;
      const ghost = preview.has(`${row}:${col}`);
      return `<button class="blast-cell ${filled ? `c${filled}` : ""} ${ghost ? "is-ghost" : ""}" type="button" data-action="place-cell" data-row="${row}" data-col="${col}"></button>`;
    }).join("")
  ).join("");

  return `
    <section class="blast-board card-surface holo-border">
      <div class="blast-hud">
        <div><span>점수</span><strong>${score.toLocaleString("ko-KR")}</strong></div>
        <div><span>콤보</span><strong>x${combo}</strong></div>
        <div><span>최고</span><strong>${formatPoints(state.user?.points ?? "0")}</strong></div>
      </div>
      <div class="blast-grid">${cells}</div>
      <div class="blast-hand">
        ${[0, 1, 2].map((index) => renderPiece(blast?.pieces[index] ?? null, index)).join("")}
      </div>
      <div class="blast-actions">
        ${
          blast && !over
            ? `<button class="btn btn-ghost" type="button" data-action="restart-game">다시 시작</button>`
            : `<button class="btn btn-primary holo-btn" type="button" data-action="start-game">${blast ? "새 게임" : "게임 시작"}</button>`
        }
      </div>
      ${over ? `<p class="blast-over">게임 오버 · ${score.toLocaleString("ko-KR")}점</p>` : `<p class="blast-hint">블록을 고른 뒤 보드를 눌러 놓으세요.</p>`}
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
            <div class="brand-row">
              <img src="${GAME_ICON}" alt="" class="brand-icon" width="28" height="28" />
              <span class="brand-mark holo-text">1ZUXM</span>
            </div>
            <span class="brand-sub">Block Blast</span>
          </div>
          <div class="online-count-badge">
            <span>접속자</span>
            <strong id="online-count">${formatOnlineCount(state.onlineCount)}</strong>
          </div>
        </header>
        ${state.pendingAuth ? renderAccessCodeModal() : renderAuthModal()}
        ${renderSiteFooter()}
      </div>
    `;
    updateToast();
    return;
  }

  app.innerHTML = `
    <div class="page-shell game-page">
      <header class="site-header">
        <div class="brand">
          <div class="brand-row">
            <img src="${GAME_ICON}" alt="" class="brand-icon" width="28" height="28" />
            <span class="brand-mark holo-text">1ZUXM</span>
          </div>
          <span class="brand-sub">${renderNicknameWithDevBadge(state.user.nickname)}</span>
        </div>
        <button class="btn btn-ghost header-logout" data-action="logout" type="button">로그아웃</button>
      </header>
      ${renderMainMenuPanel()}
      <main class="layout game-layout">
        <div class="layout-spacer" aria-hidden="true"></div>
        <section class="main-column game-center-column">${renderBlastBoard()}</section>
        ${renderRankingPanel()}
      </main>
      ${renderInfoModal()}
      ${renderSiteFooter()}
    </div>
  `;
  updateToast();
  startSessionClock();
}

function render() {
  renderApp();
}

function syncAuthDraftFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);
  state.authDraft.nickname = String(formData.get("nickname") ?? "");
  state.authDraft.password = String(formData.get("password") ?? "");
  state.authDraft.accessCode = String(formData.get("accessCode") ?? "");
  state.authDraft.captchaAnswer = String(formData.get("captchaAnswer") ?? "");
}

function completeAuthSession(token: string, rememberMe: boolean) {
  setToken(token);
  setRememberLogin(rememberMe);
  window.location.reload();
}

async function switchAuthMode(mode: "login" | "register") {
  const form = document.querySelector<HTMLFormElement>("#auth-form");
  if (form) syncAuthDraftFromForm(form);
  state.authMode = mode;
  state.showCaptchaHelp = false;
  if (mode === "register") await loadCaptcha({ silent: true });
  else {
    state.captcha = null;
    state.authDraft.captchaAnswer = "";
  }
  render();
}

async function handlePasswordChange(form: HTMLFormElement) {
  const formData = new FormData(form);
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (currentPassword.length < 6) return showToast("현재 비밀번호를 입력해 주세요.", "error");
  if (newPassword.length < 6) return showToast("새 비밀번호는 6자 이상 입력해 주세요.", "error");
  if (newPassword !== confirmPassword) return showToast("새 비밀번호 확인이 일치하지 않습니다.", "error");
  try {
    const result = await api.changePassword(currentPassword, newPassword);
    showToast(result.message);
    form.reset();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "비밀번호 변경 중 오류가 발생했습니다.", "error");
  }
}

async function handleAuthSubmit(form: HTMLFormElement) {
  if (state.authSubmitting) return;
  syncAuthDraftFromForm(form);
  if (!state.authDraft.nickname.trim()) return showToast("닉네임을 입력해 주세요.", "error");
  if (state.authDraft.password.length < 6) return showToast("비밀번호는 6자 이상 입력해 주세요.", "error");
  if (state.authMode === "register") {
    if (!state.captcha?.captchaId) return showToast("보안코드를 불러오는 중입니다.", "error");
    if (!state.authDraft.captchaAnswer.trim()) return showToast("보안코드 정답을 입력해 주세요.", "error");
  }

  const formData = new FormData(form);
  const nickname = String(formData.get("nickname") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rememberInput = form.elements.namedItem("rememberMe");
  const rememberMe = rememberInput instanceof HTMLInputElement ? rememberInput.checked : false;
  setAuthSubmitting(true);
  try {
    if (state.authMode === "register") {
      const result = await api.register(
        nickname,
        password,
        String(formData.get("captchaId") ?? "") || state.captcha?.captchaId || "",
        String(formData.get("captchaAnswer") ?? "").trim()
      );
      state.pendingAuth = { token: result.token, rememberMe: true, nickname: result.user.nickname };
    } else {
      const result = await api.login(nickname, password, rememberMe);
      state.pendingAuth = { token: result.token, rememberMe, nickname: result.user.nickname };
    }
    state.authDraft.accessCode = "";
    render();
    window.requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#access-code-input")?.focus());
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const loginResult = await api.login(nickname, password, rememberMe);
      state.pendingAuth = { token: loginResult.token, rememberMe, nickname: loginResult.user.nickname };
      render();
      return;
    }
    showToast(error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.", "error");
    if (state.authMode === "register") await loadCaptcha({ silent: true });
  } finally {
    setAuthSubmitting(false);
  }
}

function handleAccessCodeSubmit(form: HTMLFormElement) {
  if (!state.pendingAuth) return;
  const accessCode = String(new FormData(form).get("accessCode") ?? "").trim();
  state.authDraft.accessCode = accessCode;
  if (accessCode !== LOGIN_ACCESS_CODE) {
    state.pendingAuth = null;
    setToken(null);
    showToast("로그인 코드가 틀렸습니다.", "error");
    render();
    return;
  }
  completeAuthSession(state.pendingAuth.token, state.pendingAuth.rememberMe);
}

async function handlePlace(row: number, col: number) {
  if (state.selectedPiece === null || !state.blast || state.blast.gameOver) return;
  const result = await withBusy(() => api.placePiece(state.selectedPiece!, row, col));
  if (!result) return;
  applyGamePayload(result);
  if (result.gameOver) showToast(`게임 오버 · ${result.blast?.score ?? 0}점`);
  else if ((result.blast?.combo ?? 0) > 0) showToast(`콤보 x${result.blast?.combo}`);
  await refreshRankings();
  render();
}

function bindGlobalEvents() {
  if (eventsBound) return;
  eventsBound = true;
  const app = document.querySelector("#app");
  if (!app) return;

  app.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (target.id === "auth-form") void handleAuthSubmit(target);
    if (target.id === "access-code-form") handleAccessCodeSubmit(target);
    if (target.id === "password-change-form") void handlePasswordChange(target);
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const form = target.closest("#auth-form, #access-code-form");
    if (!form) return;
    if (target.name === "nickname") state.authDraft.nickname = target.value;
    if (target.name === "password") state.authDraft.password = target.value;
    if (target.name === "accessCode") state.authDraft.accessCode = target.value;
    if (target.name === "captchaAnswer") state.authDraft.captchaAnswer = target.value;
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    event.preventDefault();

    switch (action) {
      case "refresh-captcha":
        void loadCaptcha();
        break;
      case "toggle-captcha-help":
        state.showCaptchaHelp = !state.showCaptchaHelp;
        updateCaptchaHelp();
        break;
      case "close-modal":
        if (target.closest(".modal") && !target.closest(".modal-close") && !target.classList.contains("modal-backdrop")) {
          return;
        }
        state.activeModal = null;
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
      case "toggle-bgm":
        state.bgmEnabled = !state.bgmEnabled;
        setBgmEnabled(state.bgmEnabled);
        render();
        break;
      case "set-login":
        void switchAuthMode("login");
        break;
      case "set-register":
        void switchAuthMode("register");
        break;
      case "auth-submit": {
        const form = document.querySelector<HTMLFormElement>("#auth-form");
        if (form) void handleAuthSubmit(form);
        break;
      }
      case "access-code-submit": {
        const form = document.querySelector<HTMLFormElement>("#access-code-form");
        if (form) handleAccessCodeSubmit(form);
        break;
      }
      case "change-password": {
        const form = document.querySelector<HTMLFormElement>("#password-change-form");
        if (form) void handlePasswordChange(form);
        break;
      }
      case "logout":
        setToken(null);
        pauseBgm();
        state.user = null;
        state.blast = null;
        state.activeSession = null;
        state.activeModal = null;
        render();
        break;
      case "select-piece":
        state.selectedPiece = Number(button.dataset.piece);
        render();
        break;
      case "place-cell":
        void handlePlace(Number(button.dataset.row), Number(button.dataset.col));
        break;
      case "start-game":
        void withBusy(() => api.startGame()).then((result) => {
          if (!result) return;
          applyGamePayload(result);
          render();
        });
        break;
      case "restart-game":
        void withBusy(() => api.restartGame()).then((result) => {
          if (!result) return;
          applyGamePayload(result);
          void refreshRankings();
          render();
        });
        break;
      default:
        break;
    }
  });

  document.addEventListener("pointerover", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cell = target.closest<HTMLElement>("[data-action='place-cell']");
    if (!cell) return;
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (state.hoverCell?.row === row && state.hoverCell?.col === col) return;
    state.hoverCell = { row, col };
    const grid = document.querySelector(".blast-grid");
    if (grid) {
      const preview = previewCells();
      grid.querySelectorAll<HTMLElement>(".blast-cell").forEach((element) => {
        element.classList.toggle("is-ghost", preview.has(`${element.dataset.row}:${element.dataset.col}`));
      });
    }
  });
}

async function bootstrap() {
  bindGlobalEvents();
  void loadCaptcha({ silent: true });
  startPresenceTracking();
  await refreshRankings();
  rankingTimer = window.setInterval(refreshRankings, 5000);

  if (getToken()) {
    try {
      const result = await api.me();
      state.user = result.user;
      state.activeSession = result.activeSession;
      if (result.activeSession?.blast) {
        state.blast = result.activeSession.blast;
      } else if (result.activeSession) {
        const gameState = await api.gameState();
        applyGamePayload(gameState);
      }
      void loadSessionInfo();
      startSessionClock();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setToken(null);
      }
    }
  }

  syncBgmForLoggedInUser(Boolean(state.user));
  render();
}

void bootstrap();
