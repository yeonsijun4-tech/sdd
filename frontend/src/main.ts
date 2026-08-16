import {
  api,
  getToken,
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
};

let rankingTimer: number | null = null;
let eventsBound = false;

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
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
    } catch {
      setToken(null);
    }
  }

  render();
}

function renderSiteFooter() {
  return `
    <footer class="site-footer">
      <a
        class="creator-card"
        href="https://instagram.com/xvzeon"
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
          <p class="text-readable">가상 포인트만 사용하는 UP/DOWN 게임입니다.</p>
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

function renderRules(board: BoardState | null) {
  if (!board) return "";
  return `
    <div class="rules card-surface holo-border">
      <h3 class="holo-text">확률 공개</h3>
      <p>${board.rules.probabilityRule}</p>
      <p>${board.rules.multiplierRule}</p>
      <p>${board.rules.rewardRule}</p>
      <p class="rule-highlight">${board.rules.tieRule}</p>
    </div>
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
        <strong class="holo-text">${formatNumber(state.user?.points ?? 0)} P</strong>
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
                  <td>${formatNumber(row.points)}</td>
                  <td>${row.maxStreak}</td>
                  <td>${formatNumber(row.maxSessionGain)}</td>
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
  const pendingPoints = session?.sessionPoints ?? 0;
  const canPlay = Boolean(session?.isActive);
  const canCashout = canPlay && pendingPoints > 0;

  return `
    <section class="game-board card-surface holo-border ${state.lastResult?.type ?? ""}">
      <div class="board-top">
        <div>
          <p class="label">현재 숫자</p>
          <div class="number-card holo-border">
            <span id="current-number" class="current-number holo-text">${currentNumber}</span>
          </div>
        </div>
        <div class="stats-grid">
          <div><span>UP 확률</span><strong>${board ? `${board.probabilities.up}%` : "-"}</strong></div>
          <div><span>DOWN 확률</span><strong>${board ? `${board.probabilities.down}%` : "-"}</strong></div>
          <div><span>동일 숫자</span><strong>${board ? `${board.probabilities.tie}%` : "-"}</strong></div>
          <div><span>UP 배수</span><strong class="holo-text">x${board?.multipliers.up ?? "-"}</strong></div>
          <div><span>DOWN 배수</span><strong class="holo-text">x${board?.multipliers.down ?? "-"}</strong></div>
          <div><span>현재 연승</span><strong class="holo-text">${session?.currentStreak ?? 0}</strong></div>
        </div>
      </div>

      <div class="pending-box ${pendingPoints > 0 ? "active" : ""}">
        <span>현재 게임 미확정 포인트</span>
        <strong id="pending-points" class="holo-text">${formatNumber(pendingPoints)} P</strong>
        <small>그만하기를 누르기 전까지는 보유 포인트에 반영되지 않습니다.</small>
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

      <div class="action-row">
        ${
          canPlay
            ? `
          <button class="btn btn-up" data-action="guess-up" data-busy-toggle="true">UP</button>
          <button class="btn btn-down" data-action="guess-down" data-busy-toggle="true">DOWN</button>
          <button class="btn btn-cashout" data-action="cashout" data-busy-toggle="true" ${!canCashout ? "disabled" : ""}>그만하기</button>
        `
            : `
          <button class="btn btn-primary holo-btn" data-action="start-game" data-busy-toggle="true">새 게임 시작</button>
          ${
            state.user && state.user.points === 0 && !state.user.bonusClaimed
              ? `<button class="btn btn-secondary" data-action="claim-bonus" data-busy-toggle="true">무료 100P 받기</button>`
              : ""
          }
        `
        }
      </div>
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
            <span class="brand-sub">Virtual Point Game</span>
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
    <div class="page-shell">
      <header class="topbar card-surface holo-border">
        <div class="brand">
          <span class="brand-mark holo-text">1ZUXM</span>
          <span class="brand-sub">UP / DOWN</span>
        </div>
        <div class="user-stats">
          <div><span>닉네임</span><strong>${state.user.nickname}</strong></div>
          <div><span>보유 포인트</span><strong class="holo-text">${formatNumber(state.user.points)} P</strong></div>
          <div><span>내 랭킹</span><strong class="holo-text">${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
        </div>
        <button class="btn btn-ghost" data-action="logout" type="button">로그아웃</button>
      </header>

      <main class="layout">
        <section class="main-column">
          ${renderGameBoard()}
          ${renderRules(state.board)}
        </section>
        ${renderRankingPanel()}
      </main>
      ${renderSiteFooter()}
    </div>
  `;
  updateToast();
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
    state.user = result.user;
    state.activeSession = null;
    state.board = null;
    state.lastResult = null;
    showToast(`${result.user.nickname}님, 환영합니다.`);
    render();
    return;
  }

  const result = await withBusy(async () => api.login(nickname, password));
  if (!result) return;

  setToken(result.token);
  state.user = result.user;
  state.activeSession = null;
  state.board = null;
  state.lastResult = null;
  showToast(`${result.user.nickname}님, 환영합니다.`);
  render();
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

    event.preventDefault();

    switch (action) {
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
        render();
        break;
      case "start-game":
        void withBusy(async () => api.startGame()).then((result) => {
          if (!result) return;
          state.activeSession = result.activeSession;
          state.board = result.board;
          state.lastResult = null;
          if (result.message) showToast(result.message);
          render();
        });
        break;
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
    showToast(`성공! +${formatNumber(result.gain ?? 0)} P`);
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
  const element = document.querySelector<HTMLElement>("#current-number");
  if (!element) return;

  element.classList.add("rolling");
  element.textContent = String(from);

  window.setTimeout(() => {
    element.textContent = String(to);
    element.classList.remove("rolling");
    element.classList.add("pop");
    window.setTimeout(() => element.classList.remove("pop"), 450);
  }, 180);
}

function animatePointsGain(amount: number) {
  const element = document.querySelector<HTMLElement>("#pending-points");
  if (!element || amount <= 0) return;
  element.classList.add("gain-pop");
  window.setTimeout(() => element.classList.remove("gain-pop"), 600);
}

bootstrap();
