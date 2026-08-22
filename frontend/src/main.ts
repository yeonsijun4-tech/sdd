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
    type: "WIN" | "LOSE";
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
  onlineCount: number;
  betInput: string;
  authDraft: {
    nickname: string;
    password: string;
    accessCode: string;
    captchaAnswer: string;
  };
  authSubmitting: boolean;
  pendingAuth: {
    token: string;
    rememberMe: boolean;
    nickname: string;
  } | null;
}

const BET_INPUT_KEY = "1zuxm_bet_input";

function loadSavedBetInput(): string {
  const raw = localStorage.getItem(BET_INPUT_KEY);
  if (!raw) return "";
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : "";
}

function saveBetInput(value: string) {
  const parsed = Math.floor(Number(value));
  if (Number.isFinite(parsed) && parsed > 0) {
    localStorage.setItem(BET_INPUT_KEY, String(parsed));
    return;
  }
  localStorage.removeItem(BET_INPUT_KEY);
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
  onlineCount: 0,
  betInput: loadSavedBetInput(),
  authDraft: {
    nickname: "",
    password: "",
    accessCode: "",
    captchaAnswer: "",
  },
  authSubmitting: false,
  pendingAuth: null,
};

let rankingTimer: number | null = null;
let presenceTimer: number | null = null;
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

function isMobileDevice(): boolean {
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
  const narrowTouch =
    window.matchMedia("(max-width: 960px)").matches &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  return mobileUa || narrowTouch;
}

function isWindowFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement) {
    return true;
  }

  // F11 hides browser chrome. Maximized window still keeps tabs/address bar.
  const chromeHeight = window.outerHeight - window.innerHeight;
  const chromeWidth = window.outerWidth - window.innerWidth;
  const chromeHidden = chromeHeight <= 10 && chromeWidth <= 10;
  const fillsViewport =
    window.innerHeight >= window.screen.availHeight - 48 &&
    window.innerWidth >= window.screen.availWidth - 48;

  return chromeHidden && fillsViewport;
}

function isPlayBlocked(): boolean {
  if (isMobileDevice()) return false;
  return !isWindowFullscreen();
}

async function enterFullscreenMode() {
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
      await element.msRequestFullscreen();
    } else {
      showToast("F11을 눌러 전체 화면으로 전환해 주세요.", "error");
    }
  } catch {
    showToast("F11을 눌러 전체 화면으로 전환해 주세요.", "error");
  }
}

function ensurePlayAllowed(): boolean {
  if (!isPlayBlocked()) return true;
  showToast("F11을 눌러주세요.", "error");
  return false;
}

function renderFullscreenGatePage(): string {
  return `
    <div class="fullscreen-gate-page" aria-live="polite">
      <div class="fullscreen-gate-card card-surface holo-border">
        <p class="fullscreen-gate-label holo-text">F11을 눌러주세요.</p>
        <span class="fullscreen-gate-sub">전체 화면에서만 이용할 수 있습니다.</span>
        <button class="btn btn-primary holo-btn fullscreen-gate-btn" type="button" data-action="enter-fullscreen">
          전체 화면 들어가기
        </button>
      </div>
    </div>
  `;
}

function updatePlayBlockDom() {
  if (isMobileDevice()) {
    document.body.classList.remove("desktop-fullscreen-required");
    document.querySelector(".fullscreen-gate-page")?.remove();
    return;
  }

  const blocked = isPlayBlocked();
  document.body.classList.toggle("desktop-fullscreen-required", blocked);

  let gate = document.querySelector(".fullscreen-gate-page");
  if (blocked && !gate) {
    document.body.insertAdjacentHTML("beforeend", renderFullscreenGatePage());
  } else if (!blocked && gate) {
    gate.remove();
  }
}

function startFullscreenWatch() {
  const update = () => updatePlayBlockDom();
  window.addEventListener("resize", update);
  window.addEventListener("focus", update);
  document.addEventListener("fullscreenchange", update);
  document.addEventListener("webkitfullscreenchange", update as EventListener);
  window.setInterval(update, 400);
  update();
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

let mouseTrailInitialized = false;
let mouseTrailRaf = 0;
const mouseTrailPoints: TrailPoint[] = [];

function startMouseTrail() {
  if (mouseTrailInitialized || isMobileDevice()) return;
  mouseTrailInitialized = true;

  const canvas = document.createElement("canvas");
  canvas.className = "mouse-trail-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const resize = () => {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  resize();
  window.addEventListener("resize", resize);

  window.addEventListener(
    "mousemove",
    (event) => {
      const last = mouseTrailPoints[mouseTrailPoints.length - 1];
      const x = event.clientX;
      const y = event.clientY;

      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const distance = Math.hypot(dx, dy);
        const step = 3;

        if (distance > step) {
          const steps = Math.ceil(distance / step);
          for (let i = 1; i <= steps; i++) {
            mouseTrailPoints.push({
              x: last.x + (dx * i) / steps,
              y: last.y + (dy * i) / steps,
              life: 1,
            });
          }
        } else {
          mouseTrailPoints.push({ x, y, life: 1 });
        }
      } else {
        mouseTrailPoints.push({ x, y, life: 1 });
      }

      if (mouseTrailPoints.length > 140) {
        mouseTrailPoints.splice(0, mouseTrailPoints.length - 140);
      }
    },
    { passive: true }
  );

  const draw = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.setLineDash([]);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.8;

    for (let i = 1; i < mouseTrailPoints.length; i++) {
      const from = mouseTrailPoints[i - 1];
      const to = mouseTrailPoints[i];
      const alpha = Math.min(from.life, to.life) * 0.68;
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    for (const point of mouseTrailPoints) {
      point.life -= 0.022;
    }

    while (mouseTrailPoints.length > 0 && mouseTrailPoints[0].life <= 0) {
      mouseTrailPoints.shift();
    }

    mouseTrailRaf = window.requestAnimationFrame(draw);
  };

  draw();
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

const PRESENCE_CLIENT_KEY = "1zuxm_presence_client";

function getPresenceClientId(): string {
  let clientId = sessionStorage.getItem(PRESENCE_CLIENT_KEY);
  if (!clientId) {
    clientId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(PRESENCE_CLIENT_KEY, clientId);
  }
  return clientId;
}

function formatOnlineCount(count: number): string {
  return `${count.toLocaleString("ko-KR")}명`;
}

function updateOnlineCountDom() {
  const element = document.querySelector<HTMLElement>("#online-count");
  if (element) element.textContent = formatOnlineCount(state.onlineCount);
}

async function sendPresenceHeartbeat() {
  try {
    const result = await api.presenceHeartbeat(getPresenceClientId());
    state.onlineCount = result.count;
    updateOnlineCountDom();
  } catch {
    // presence failures should not block auth or gameplay
  }
}

function startPresenceTracking() {
  void sendPresenceHeartbeat();
  if (presenceTimer) return;
  presenceTimer = window.setInterval(() => {
    void sendPresenceHeartbeat();
  }, 30000);

  window.addEventListener("beforeunload", () => {
    const clientId = getPresenceClientId();
    if (!navigator.sendBeacon) return;
    navigator.sendBeacon(
      "/api/presence/leave",
      new Blob([JSON.stringify({ clientId })], { type: "application/json" })
    );
  });
}

const MIN_CASHOUT_TURNS = 2;
const BET_PRESETS = [1000, 5000, 10000, 100000, 1000000, 10000000, 100000000];

const PATCH_NOTES_V10_HTML = `
  <div class="patch-version-block patch-version-latest">
    <h3 class="holo-text">v10.0 · 오픈 베타</h3>
    <p class="patch-version-summary">v1.5 이후 추가·수정된 내용을 모두 반영했습니다. 친구들과 함께 플레이해 보세요!</p>
    <ul class="info-list">
      <li><strong>v1.5</strong> 원(돈) 표기 → 포인트(P)로 변경</li>
      <li>PostgreSQL 도입으로 계정·랭킹 데이터 영구 저장</li>
      <li>동일 숫자(타이) 결과 제거</li>
      <li>보유 포인트 0P 시 계정 자동 삭제</li>
      <li>게임판 중앙 배치, 실시간 랭킹 우측 고정</li>
      <li>배팅 프리셋 확대 및 프리셋 클릭 시 금액 누적</li>
      <li>배팅 금액 저장 (새로고침 후에도 유지)</li>
      <li>배팅 상한 제거 (보유 포인트 범위 내 자유 배팅)</li>
      <li>랭킹 대액 포인트 표시 개선</li>
      <li>랭킹 갱신 시 로그인·입력 폼 초기화 버그 수정</li>
      <li>로그인 코드(0828) 별도 입장 화면</li>
      <li>로그인·회원가입 처리 안정화</li>
      <li>실시간 접속자 수 표시</li>
      <li>그만하기는 2턴 이상 성공 후 가능</li>
      <li>개발자(DEV) 배지 표시</li>
    </ul>
  </div>
  <div class="patch-version-block">
    <h3>v1.4 이전</h3>
    <ul class="info-list">
      <li><strong>v1.4</strong> 확률 공개 제거, 사용 포인트 직접 입력</li>
      <li><strong>v1.3</strong> 포인트 → 원(돈) 표기 (v1.5에서 되돌림)</li>
      <li><strong>v1.2</strong> 카드형 UI, 상단 메뉴, 로그인 유지 추가</li>
      <li><strong>v1.1</strong> 보안코드, 홀로그램 UI, Render 배포</li>
      <li><strong>v1.0</strong> UP/DOWN 숫자 예측 게임 오픈</li>
    </ul>
  </div>
`;
const GAME_ICON = "/assets/1zuxm-icon.png";
const LOGIN_ACCESS_CODE = "0828";
const DEV_NICKNAME = "ysjyoun";

function isDevNickname(nickname: string): boolean {
  return nickname.toLowerCase() === DEV_NICKNAME.toLowerCase();
}

function renderNicknameWithDevBadge(nickname: string): string {
  if (!isDevNickname(nickname)) {
    return nickname;
  }

  return `<span class="nickname-with-badge">${nickname}<span class="dev-badge">DEV</span></span>`;
}

function getCurrentBetInputAmount(): number {
  const raw = document.querySelector<HTMLInputElement>("#bet-amount-input")?.value ?? state.betInput;
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function setBetInputAmount(amount: number) {
  const normalized = Math.max(0, Math.floor(amount));
  state.betInput = normalized > 0 ? String(normalized) : "";
  saveBetInput(state.betInput);
}

function syncBetInputWithBalance() {
  const balance = state.user?.points ?? 0;
  const current = getCurrentBetInputAmount();
  if (current <= 0) return;
  if (current > balance) {
    setBetInputAmount(balance);
  }
}

function forceExitApp(message?: string) {
  setToken(null);
  localStorage.clear();
  sessionStorage.clear();
  window.alert(message ?? "로그인 코드가 틀려 접속이 종료됩니다.");
  window.location.replace("about:blank");
  window.close();
}

function handleAccountDeleted(message?: string) {
  setToken(null);
  state.user = null;
  state.activeSession = null;
  state.board = null;
  state.lastResult = null;
  state.betInput = "";
  saveBetInput("");
  state.activeModal = null;
  showToast(message ?? "보유 포인트가 0P가 되어 계정이 삭제되었습니다.", "error");
  render();
}

function formatPoints(value: number): string {
  return `${value.toLocaleString("ko-KR")}P`;
}

const GAME_MIN_NUMBER = 2;
const GAME_MAX_NUMBER = 10;

const POKER_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

const NUMBER_TO_POKER_RANK: Record<number, string> = {
  2: "A",
  3: "2",
  4: "3",
  5: "4",
  6: "5",
  7: "J",
  8: "Q",
  9: "K",
  10: "10",
};

const POKER_SUITS = [
  { symbol: "♠", color: "black" },
  { symbol: "♥", color: "red" },
  { symbol: "♦", color: "red" },
  { symbol: "♣", color: "black" },
] as const;

function getPokerRank(number: number): string {
  if (NUMBER_TO_POKER_RANK[number]) {
    return NUMBER_TO_POKER_RANK[number];
  }
  if (number >= GAME_MIN_NUMBER && number <= GAME_MAX_NUMBER) {
    return String(number);
  }
  return POKER_RANKS[(number - GAME_MIN_NUMBER) % POKER_RANKS.length];
}

function getPokerSuit(number: number) {
  return POKER_SUITS[(number - GAME_MIN_NUMBER) % POKER_SUITS.length];
}

function formatPokerCardLabel(number: number): string {
  return `${getPokerRank(number)}${getPokerSuit(number).symbol}`;
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
  const rank = getPokerRank(parsed);
  const mainClass = options.main ? " poker-card-main" : "";
  const cardId = options.cardId ? ` id="${options.cardId}"` : "";
  const valueId = options.valueId ? ` id="${options.valueId}"` : "";

  return `
    <div
      class="playing-card poker-card poker-card-${suit.color}${mainClass}"
      ${cardId}
      data-value="${parsed}"
      title="숫자 ${parsed}"
      aria-label="숫자 ${parsed}, ${rank}${suit.symbol}"
    >
      <div class="poker-corner poker-corner-tl">
        <span class="poker-rank">${rank}</span>
        <span class="poker-suit">${suit.symbol}</span>
      </div>
      <div class="poker-center">
        <span class="poker-center-value pop-target${rank.length > 1 ? " poker-center-value-wide" : ""}"${valueId}>${rank}</span>
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
    <div class="playing-card poker-card poker-card-range poker-card-black" title="숫자 2~10">
      <div class="poker-corner poker-corner-tl">
        <span class="poker-rank">A</span>
        <span class="poker-suit">♠</span>
      </div>
      <div class="poker-center poker-center-deck">
        <span class="poker-deck-suit">♠</span>
        <span class="poker-deck-suit poker-deck-red">♥</span>
        <span class="poker-deck-suit poker-deck-red">♦</span>
        <span class="poker-deck-suit">♣</span>
      </div>
      <div class="poker-corner poker-corner-br">
        <span class="poker-rank">K</span>
        <span class="poker-suit">♣</span>
      </div>
    </div>
  `;
}

function updateCurrentNumberLabel(value: number | string) {
  const label = document.querySelector<HTMLElement>("#current-number-label");
  if (!label) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    label.textContent = "현재 숫자";
    return;
  }
  label.innerHTML = `현재 숫자 · <strong>${parsed}</strong> <span class="card-slot-poker">(${formatPokerCardLabel(parsed)})</span>`;
}

function applyPokerCardValue(card: HTMLElement, value: number) {
  const suit = getPokerSuit(value);
  const rank = getPokerRank(value);
  card.className = `playing-card poker-card poker-card-${suit.color} poker-card-main`;
  card.dataset.value = String(value);
  card.title = `숫자 ${value}`;
  card.setAttribute("aria-label", `숫자 ${value}, ${rank}${suit.symbol}`);
  card.querySelectorAll(".poker-rank").forEach((element) => {
    element.textContent = rank;
  });
  card.querySelectorAll(".poker-suit").forEach((element) => {
    if (element.closest(".poker-corner")) {
      element.textContent = suit.symbol;
    }
  });
  const center = card.querySelector(".poker-center-value");
  if (center) {
    center.textContent = rank;
    center.classList.toggle("poker-center-value-wide", rank.length > 1);
  }
  const centerSuit = card.querySelector(".poker-center-suit");
  if (centerSuit) centerSuit.textContent = suit.symbol;
  updateCurrentNumberLabel(value);
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
    if (button.dataset.busyToggle !== "true") return;
    if (button.dataset.action === "auth-submit") return;
    button.disabled = isBusy;
  });
  updateBusyOverlay(isBusy);
}

function getAuthSubmitLabel(mode: AppState["authMode"] = state.authMode): string {
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

async function withAuthBusy<T>(task: () => Promise<T>): Promise<T | null> {
  setAuthSubmitting(true);
  try {
    return await task();
  } catch (error) {
    if (error instanceof ApiError && error.forceExit) {
      forceExitApp(error.message);
      return null;
    }
    if (error instanceof ApiError && error.accountDeleted) {
      handleAccountDeleted(error.message);
      return null;
    }
    showToast(error instanceof Error ? error.message : "오류가 발생했습니다.", "error");
    return null;
  } finally {
    setAuthSubmitting(false);
  }
}

function updateBusyOverlay(isBusy: boolean) {
  const existing = document.querySelector(".busy-overlay");
  if (!isBusy) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.className = "busy-overlay";
  overlay.innerHTML = `
    <img src="${GAME_ICON}" alt="" class="busy-icon spin" width="72" height="72" />
  `;
  document.body.appendChild(overlay);
}

function playResultEffect(type: "WIN" | "LOSE") {
  const flash = document.createElement("div");
  flash.className = `result-flash result-flash-${type.toLowerCase()}`;
  document.body.appendChild(flash);
  window.setTimeout(() => flash.remove(), 900);

  const board = document.querySelector(".game-board");
  if (!board) return;
  board.classList.remove("game-board--win", "game-board--lose", "game-board--tie");
  board.classList.add(`game-board--${type.toLowerCase()}`);
  window.setTimeout(() => {
    board.classList.remove("game-board--win", "game-board--lose", "game-board--tie");
  }, 1200);
}

async function withBusy<T>(task: () => Promise<T>): Promise<T | null> {
  setBusy(true);
  try {
    return await task();
  } catch (error) {
    if (error instanceof ApiError && error.forceExit) {
      forceExitApp(error.message);
      return null;
    }
    if (error instanceof ApiError && error.accountDeleted) {
      handleAccountDeleted(error.message);
      return null;
    }
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
    if (state.user) {
      updateRankingPanelDom();
    }
  } catch {
    // ranking failures should not block auth or gameplay
  }
}

async function bootstrap() {
  bindGlobalEvents();
  void loadCaptcha({ silent: true });
  startPresenceTracking();
  startFullscreenWatch();
  startMouseTrail();

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
      syncBetInputWithBalance();
    } catch (error) {
      if (error instanceof ApiError && error.accountDeleted) {
        handleAccountDeleted(error.message);
      } else if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
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
            <input
              id="access-code-input"
              name="accessCode"
              inputmode="numeric"
              autocomplete="off"
              maxlength="16"
              placeholder="로그인 코드 입력"
              value="${state.authDraft.accessCode}"
            />
          </label>
          <button class="btn btn-primary holo-btn" type="button" data-action="access-code-submit">
            입장하기
          </button>
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
              value="${state.authDraft.captchaAnswer}"
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
          <p class="text-readable">가상 포인트만 사용하는 UP/DOWN 게임입니다.</p>
        </div>
        <form id="auth-form" class="auth-form" novalidate>
          <input type="hidden" name="authMode" value="${state.authMode}" />
          <label>
            <span>닉네임</span>
            <input
              name="nickname"
              maxlength="16"
              autocomplete="username"
              value="${state.authDraft.nickname}"
            />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              name="password"
              type="password"
              minlength="6"
              maxlength="64"
              autocomplete="current-password"
              value="${state.authDraft.password}"
            />
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
          <button
            class="btn btn-primary holo-btn"
            type="button"
            data-action="auth-submit"
            ${state.authSubmitting ? "disabled" : ""}
          >
            ${state.authSubmitting ? (state.authMode === "login" ? "로그인 중..." : "가입 처리 중...") : getAuthSubmitLabel()}
          </button>
          <p class="auth-mode-hint text-readable">
            ${
              state.authMode === "login"
                ? "로그인 탭이 선택되어 있습니다. 기존 계정으로 들어갑니다."
                : "회원가입 탭이 선택되어 있습니다. 보안코드까지 입력해야 가입됩니다."
            }
          </p>
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
        <div class="menu-info-card">
          <span>접속자</span>
          <strong id="online-count">${formatOnlineCount(state.onlineCount)}</strong>
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

function renderUpdateBanner() {
  return `
    <section class="v10-update-banner holo-border" aria-label="V10 업데이트">
      <div class="v10-update-copy">
        <span class="v10-update-badge">NEW</span>
        <div class="v10-update-headline">
          <strong class="holo-text">V10 업데이트</strong>
          <span>오픈 베타 · 새 기능과 버그 수정을 확인하세요</span>
        </div>
      </div>
      <button class="btn btn-primary holo-btn v10-update-view-btn" type="button" data-action="open-patch">
        보기
      </button>
    </section>
  `;
}

function renderInfoModal() {
  if (!state.activeModal) return "";
  if (state.activeModal !== "patch" && !state.user) return "";

  const titles = {
    profile: "회원정보",
    notice: "공지사항",
    patch: "패치노트",
  } as const;

  const bodies = {
    profile: `
      <div class="info-grid">
        <div><span>닉네임</span><strong>${renderNicknameWithDevBadge(state.user.nickname)}</strong></div>
        <div><span>보유 포인트</span><strong>${formatPoints(state.user.points)}</strong></div>
        <div><span>내 랭킹</span><strong>${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
        <div><span>최고 연승</span><strong>${state.user.maxStreak}</strong></div>
        <div><span>최고 획득</span><strong>${formatPoints(state.user.maxSessionGain)}</strong></div>
        <div><span>전적</span><strong>${state.user.wins}승 ${state.user.losses}패</strong></div>
      </div>
    `,
    notice: `
      <ul class="info-list">
        <li>1zuxm은 가상 포인트만 사용하는 예측 게임입니다.</li>
        <li>실제 환전, 출금 기능은 없습니다.</li>
        <li>게임 중 2턴 이상 성공 후 그만하기를 눌러야 미확정 포인트가 보유 포인트에 반영됩니다.</li>
        <li>보유 포인트가 0P가 되면 계정이 자동 삭제됩니다.</li>
      </ul>
    `,
    patch: PATCH_NOTES_V10_HTML,
  } as const;

  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal card-surface holo-border info-modal info-modal-patch" role="dialog" aria-modal="true">
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

function renderRankingTableBody(): string {
  if (state.rankings.length === 0) {
    return `<tr><td colspan="5" class="empty-row">${
      state.rankingUpdatedAt
        ? "등록된 플레이어가 없습니다."
        : "랭킹 데이터를 불러오는 중..."
    }</td></tr>`;
  }

  return state.rankings
    .map(
      (row) => `
                <tr class="${state.user?.nickname.toLowerCase() === row.nickname.toLowerCase() ? "is-me" : ""}">
                  <td class="holo-text">#${row.rank}</td>
                  <td>${renderNicknameWithDevBadge(row.nickname)}</td>
                  <td class="ranking-points">${formatPoints(row.points)}</td>
                  <td>${row.maxStreak}</td>
                  <td class="ranking-points">${formatPoints(row.maxSessionGain)}</td>
                </tr>
              `
    )
    .join("");
}

function updateRankingPanelDom() {
  const tbody = document.querySelector(".ranking-panel tbody");
  const updated = document.querySelector(".ranking-updated");
  const myRankBox = document.querySelector(".my-rank-box");
  if (!tbody || !updated || !myRankBox) return;

  tbody.innerHTML = renderRankingTableBody();
  updated.textContent = `업데이트: ${
    state.rankingUpdatedAt
      ? new Date(state.rankingUpdatedAt).toLocaleTimeString("ko-KR")
      : "-"
  }`;

  const strongs = myRankBox.querySelectorAll("strong");
  const spans = myRankBox.querySelectorAll("span");
  if (strongs[0]) {
    strongs[0].textContent = state.user?.rank ? `#${state.user.rank}` : "-";
  }
  if (spans[1]) {
    spans[1].innerHTML = state.user
      ? renderNicknameWithDevBadge(state.user.nickname)
      : "게스트";
  }
  if (strongs[1]) {
    strongs[1].textContent = formatPoints(state.user?.points ?? 0);
    strongs[1].classList.add("ranking-points");
  }
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
        <span>${state.user ? renderNicknameWithDevBadge(state.user.nickname) : "게스트"}</span>
        <strong class="holo-text ranking-points">${formatPoints(state.user?.points ?? 0)}</strong>
      </div>
      <div class="ranking-table-wrap">
        <table class="ranking-table">
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
            ${renderRankingTableBody()}
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
  const currentTurn = session?.currentStreak ?? 0;
  const canCashout = canPlay && bettingAmount > 0 && currentTurn >= MIN_CASHOUT_TURNS;
  const upPercent = board?.probabilities.up ?? 0;
  const downPercent = board?.probabilities.down ?? 0;
  const winMultiplier = 2;
  const nextPreview = canPlay ? "?" : "--";
  const balance = state.user?.points ?? 0;
  const presetAmounts = BET_PRESETS;
  const canStart = balance > 0;

  return `
    <section class="game-board card-surface holo-border ${canPlay ? "game-board--playing" : "game-board--setup"}">
      <div class="card-table">
        <div class="card-slot">
          <span class="card-slot-label">숫자 범위 · 2~10</span>
          ${renderPokerRangeCard()}
        </div>
        <div class="card-slot card-slot-main">
          <span class="card-slot-label" id="current-number-label">현재 숫자 · <strong>${currentNumber}</strong>${Number.isFinite(Number(currentNumber)) ? ` <span class="card-slot-poker">(${formatPokerCardLabel(Number(currentNumber))})</span>` : ""}</span>
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
          <span>보유 포인트</span>
          <strong>${formatPoints(state.user?.points ?? 0)}</strong>
        </div>
        <div class="status-chip status-bet ${bettingAmount > 0 ? "active" : ""}">
          <span>미확정 포인트</span>
          <strong id="pending-points" class="holo-text">${formatPoints(bettingAmount)}</strong>
        </div>
        <div class="status-chip status-streak">
          <span>연승</span>
          <strong>${session?.currentStreak ?? 0}</strong>
        </div>
      </div>

      ${
        canPlay
          ? `
        <div class="choice-row choice-dock choice-row-dual">
          <button class="choice-card choice-up" data-action="guess-up" data-busy-toggle="true">
            <span class="choice-label">업 ▲</span>
            <div class="choice-face">
              <span>확률 ${upPercent}%</span>
              <strong>성공 시 x${winMultiplier}</strong>
            </div>
          </button>
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
          <p class="bet-panel-title">진행 중 · 맞출 때마다 미확정 포인트 ${winMultiplier}배</p>
          <div class="bet-panel-row">
            <div class="bet-amount-display">
              <span class="bet-amount-label">현재 미확정 포인트</span>
              <strong id="bet-display">${formatPoints(bettingAmount)}</strong>
            </div>
            <button class="btn btn-cashout" data-action="cashout" data-busy-toggle="true" ${!canCashout ? "disabled" : ""}>그만하기</button>
          </div>
          <small>2턴 이상 성공해야 그만하기가 열립니다. 열리면 미확정 포인트 전체가 보유 포인트로 들어옵니다. 실패하면 미확정 포인트를 잃습니다.</small>
        `
            : `
          <div class="bet-input-header">
            <span class="bet-required-badge">필수 입력</span>
            <h3 class="bet-input-title holo-text">사용할 포인트를 입력하세요</h3>
          </div>
          <p class="bet-input-guide">
            <strong>포인트(P)를 입력해야</strong> 게임을 시작할 수 있습니다. 입력 즉시 보유 포인트에서 차감됩니다.
          </p>
          <label class="bet-input-label" for="bet-amount-input">사용 포인트 (P)</label>
          <div class="bet-input-row">
            <input
              id="bet-amount-input"
              class="bet-amount-input"
              type="number"
              inputmode="numeric"
              min="1"
              placeholder="예: 1000"
              value="${state.betInput}"
              data-locked="${canStart ? "0" : "1"}"
              ${canStart ? "" : "disabled"}
            />
            <span class="bet-input-unit">P</span>
          </div>
          <p class="bet-input-hint">현재 보유 ${formatPoints(balance)} · 1P 이상, 보유 포인트 이하 입력 가능</p>
          ${
            presetAmounts.length > 0
              ? `
            <div class="bet-preset-row">
              ${presetAmounts
                .map(
                  (amount) =>
                    `<button type="button" class="bet-preset-btn" data-action="set-bet" data-amount="${amount}">${amount.toLocaleString("ko-KR")}P</button>`
                )
                .join("")}
              ${
                balance > 0
                  ? `<button type="button" class="bet-preset-btn" data-action="set-bet" data-bet-mode="set" data-amount="${balance}">전액</button>`
                  : ""
              }
            </div>
          `
              : ""
          }
          <button class="btn btn-primary holo-btn bet-start-btn" data-action="start-game" data-busy-toggle="true" ${canStart ? "" : "disabled"}>
            포인트 사용하고 게임 시작
          </button>
          ${
            balance === 0 && !canPlay
              ? `<p class="bet-zero-notice">보유 포인트가 0P가 되면 계정이 삭제됩니다.</p>`
              : ""
          }
        `
        }
      </div>

      ${
        state.lastResult
          ? `
        <div class="result-banner result-banner-${state.lastResult.type.toLowerCase()}">
          <span class="result-banner-icon">${state.lastResult.type === "WIN" ? "✦" : "✕"}</span>
          <span>${state.lastResult.previousNumber} → ${state.lastResult.nextNumber}</span>
          <strong class="result-banner-title">${state.lastResult.type === "WIN" ? "성공!" : "실패"}</strong>
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
            <div class="brand-row">
              <img src="${GAME_ICON}" alt="" class="brand-icon" width="28" height="28" />
              <span class="brand-mark holo-text">1ZUXM</span>
            </div>
            <span class="brand-sub">Virtual Point Game</span>
          </div>
          <div class="online-count-badge">
            <span>접속자</span>
            <strong id="online-count">${formatOnlineCount(state.onlineCount)}</strong>
          </div>
        </header>
        ${renderUpdateBanner()}
        ${state.pendingAuth ? renderAccessCodeModal() : renderAuthModal()}
        ${renderInfoModal()}
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
          <div class="brand-row">
            <img src="${GAME_ICON}" alt="" class="brand-icon" width="28" height="28" />
            <span class="brand-mark holo-text">1ZUXM</span>
          </div>
          <span class="brand-sub">${renderNicknameWithDevBadge(state.user.nickname)}</span>
        </div>
        <button class="btn btn-ghost header-logout" data-action="logout" type="button">로그아웃</button>
      </header>

      ${renderUpdateBanner()}

      ${renderMainNav()}

      <main class="layout game-layout">
        <div class="layout-spacer" aria-hidden="true"></div>
        <section class="main-column game-center-column">
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
  updatePlayBlockDom();
}

async function switchAuthMode(mode: "login" | "register") {
  const form = document.querySelector<HTMLFormElement>("#auth-form");
  if (form) syncAuthDraftFromForm(form);

  state.authMode = mode;
  state.showCaptchaHelp = false;
  if (mode === "register") {
    await loadCaptcha({ silent: true });
  } else {
    state.captcha = null;
    state.authDraft.captchaAnswer = "";
  }
  render();
}

function completeAuthSession(token: string, rememberMe: boolean) {
  setToken(token);
  setRememberLogin(rememberMe);
  window.location.reload();
}

function syncAuthDraftFromForm(form: HTMLFormElement) {
  const formData = new FormData(form);
  state.authDraft.nickname = String(formData.get("nickname") ?? "");
  state.authDraft.password = String(formData.get("password") ?? "");
  state.authDraft.accessCode = String(formData.get("accessCode") ?? "");
  state.authDraft.captchaAnswer = String(formData.get("captchaAnswer") ?? "");
}

function validateAuthForm(form: HTMLFormElement): boolean {
  syncAuthDraftFromForm(form);

  if (!state.authDraft.nickname.trim()) {
    window.alert("닉네임을 입력해 주세요.");
    return false;
  }

  if (state.authDraft.password.length < 6) {
    window.alert("비밀번호는 6자 이상 입력해 주세요.");
    return false;
  }

  if (state.authMode === "register") {
    if (!state.captcha?.captchaId) {
      window.alert("보안코드를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.");
      void loadCaptcha({ silent: true });
      return false;
    }
    if (!state.authDraft.captchaAnswer.trim()) {
      window.alert("보안코드 정답을 입력해 주세요.");
      return false;
    }
  }

  return true;
}

async function handleAuthSubmit(form: HTMLFormElement) {
  if (state.authSubmitting) return;

  const modeField = form.elements.namedItem("authMode");
  if (modeField instanceof HTMLInputElement) {
    state.authMode = modeField.value === "register" ? "register" : "login";
  }

  if (!validateAuthForm(form)) return;

  const formData = new FormData(form);
  const nickname = String(formData.get("nickname") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rememberInput = form.elements.namedItem("rememberMe");
  const rememberMe = rememberInput instanceof HTMLInputElement ? rememberInput.checked : false;

  setAuthSubmitting(true);

  try {
    if (state.authMode === "register") {
      const captchaId = String(formData.get("captchaId") ?? "") || state.captcha?.captchaId || "";
      const captchaAnswer = String(formData.get("captchaAnswer") ?? "").trim();

      try {
        const result = await api.register(nickname, password, captchaId, captchaAnswer);
        state.pendingAuth = {
          token: result.token,
          rememberMe: true,
          nickname: result.user.nickname,
        };
        state.authDraft.accessCode = "";
        render();
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>("#access-code-input")?.focus();
        });
        return;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const loginResult = await api.login(nickname, password, rememberMe);
          state.pendingAuth = {
            token: loginResult.token,
            rememberMe,
            nickname: loginResult.user.nickname,
          };
          state.authDraft.accessCode = "";
          render();
          window.requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>("#access-code-input")?.focus();
          });
          return;
        }
        throw error;
      }
    }

    const result = await api.login(nickname, password, rememberMe);
    state.pendingAuth = {
      token: result.token,
      rememberMe,
      nickname: result.user.nickname,
    };
    state.authDraft.accessCode = "";
    render();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("#access-code-input")?.focus();
    });
  } catch (error) {
    if (error instanceof ApiError && error.forceExit) {
      forceExitApp(error.message);
      return;
    }
    if (error instanceof ApiError && error.accountDeleted) {
      handleAccountDeleted(error.message);
      return;
    }

    const message =
      error instanceof Error ? error.message : "로그인 처리 중 오류가 발생했습니다.";
    window.alert(message);
    showToast(message, "error");

    if (state.authMode === "register") {
      await loadCaptcha({ silent: true });
    }
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
    forceExitApp("로그인 코드가 틀렸습니다.");
    return;
  }

  completeAuthSession(state.pendingAuth.token, state.pendingAuth.rememberMe);
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
    if (!(target instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (target.id === "auth-form") {
      void handleAuthSubmit(target);
      return;
    }
    if (target.id === "access-code-form") {
      handleAccessCodeSubmit(target);
    }
  });

  app.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    if (target.id === "bet-amount-input") {
      state.betInput = target.value;
      saveBetInput(target.value);
      target.classList.remove("bet-input-error");
      return;
    }

    const form = target.closest("#auth-form");
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
      case "enter-fullscreen":
        void enterFullscreenMode();
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
        if (!ensurePlayAllowed()) break;
        const betAmount = getBetAmountFromInput();
        if (!betAmount || betAmount <= 0) {
          showToast("사용할 포인트를 입력해 주세요. 게임 시작 전에 포인트를 꼭 입력해야 합니다.", "error");
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
          if (result.user) state.user = result.user;
          syncBetInputWithBalance();
          if (result.message) showToast(result.message);
          else showToast(`${formatPoints(betAmount)} 포인트로 게임을 시작했습니다.`);
          render();
        });
        break;
      }
      case "set-bet": {
        if (!ensurePlayAllowed()) break;
        const amount = Math.floor(Number(button.dataset.amount));
        if (!Number.isFinite(amount) || amount <= 0) break;
        const balance = state.user?.points ?? 0;
        const mode = button.dataset.betMode ?? "add";
        const nextAmount =
          mode === "set" ? Math.min(amount, balance) : Math.min(getCurrentBetInputAmount() + amount, balance);
        setBetInputAmount(nextAmount);
        render();
        document.querySelector<HTMLInputElement>("#bet-amount-input")?.focus();
        break;
      }
      case "guess-up":
        if (!ensurePlayAllowed()) break;
        void handleGuess("UP");
        break;
      case "guess-down":
        if (!ensurePlayAllowed()) break;
        void handleGuess("DOWN");
        break;
      case "cashout":
        if (!ensurePlayAllowed()) break;
        void withBusy(async () => api.cashout()).then(async (result) => {
          if (!result) return;
          state.user = result.user;
          state.activeSession = null;
          state.board = null;
          state.lastResult = null;
          syncBetInputWithBalance();
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
    showToast(`성공! 미확정 포인트 2배 · ${formatPoints((result.gain ?? 0) * 2)}`);
  } else {
    state.activeSession = null;
    state.board = null;
    if (result.accountDeleted) {
      handleAccountDeleted(result.message);
      playResultEffect(result.result);
      animateNumberChange(result.previousNumber, result.nextNumber);
      return;
    }
    if (result.user) state.user = result.user;
    syncBetInputWithBalance();
    showToast(result.message ?? "게임이 종료되었습니다.");
    await refreshRankings();
  }

  render();
  playResultEffect(result.result);
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
