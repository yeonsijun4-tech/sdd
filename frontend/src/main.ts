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
    <nav class="main-nav card-surface holo-border" aria-label="메인 메뉴">
      <button
        class="nav-game nav-left ${state.activeGame === "oddeven" ? "active" : ""}"
        type="button"
        data-action="nav-oddeven"
      >
        홀짝
      </button>
      <div class="nav-center">
        <button class="nav-menu-btn" type="button" data-action="open-profile">회원정보</button>
        <button class="nav-menu-btn" type="button" data-action="open-notice">공지사항</button>
        <button class="nav-menu-btn" type="button" data-action="open-patch">패치노트</button>
      </div>
      <button
        class="nav-game nav-right ${state.activeGame === "updown" ? "active" : ""}"
        type="button"
        data-action="nav-updown"
      >
        업다운
      </button>
    </nav>
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
        <div><span>소지금</span><strong>${formatNumber(state.user.points)} P</strong></div>
        <div><span>내 랭킹</span><strong>${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
        <div><span>최고 연승</span><strong>${state.user.maxStreak}</strong></div>
        <div><span>최고 획득</span><strong>${formatNumber(state.user.maxSessionGain)} P</strong></div>
        <div><span>전적</span><strong>${state.user.wins}승 ${state.user.losses}패</strong></div>
      </div>
    `,
    notice: `
      <ul class="info-list">
        <li>1zuxm은 가상 포인트만 사용하는 예측 게임입니다.</li>
        <li>실제 money 거래, 환전, 출금 기능은 없습니다.</li>
        <li>게임 중 그만하기를 눌러야 베팅금액이 소지금에 반영됩니다.</li>
      </ul>
    `,
    patch: `
      <ul class="info-list">
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
  const bettingAmount = session?.sessionPoints ?? 0;
  const canPlay = Boolean(session?.isActive);
  const canCashout = canPlay && bettingAmount > 0;
  const upPercent = board?.probabilities.up ?? 0;
  const downPercent = board?.probabilities.down ?? 0;
  const tiePercent = board?.probabilities.tie ?? 0;
  const upMult = board?.multipliers.up ?? 0;
  const downMult = board?.multipliers.down ?? 0;
  const nextPreview = canPlay ? "?" : "--";

  return `
    <section class="game-board card-surface holo-border ${state.lastResult?.type ?? ""}">
      <div class="card-table">
        <div class="card-slot">
          <span class="card-slot-label">숫자 범위</span>
          <div class="playing-card card-back">
            <span>1-100</span>
          </div>
        </div>
        <div class="card-slot card-slot-main">
          <span class="card-slot-label">현재 숫자</span>
          <div class="playing-card card-face holo-border">
            <span id="current-number" class="current-number holo-text">${currentNumber}</span>
          </div>
        </div>
        <div class="card-slot">
          <span class="card-slot-label">다음 숫자</span>
          <div class="playing-card card-back card-next">
            <span>${nextPreview}</span>
          </div>
        </div>
      </div>

      <div class="status-row">
        <div class="status-chip status-balance">
          <span>소지금</span>
          <strong>${formatNumber(state.user?.points ?? 0)} P</strong>
        </div>
        <div class="status-chip status-bet ${bettingAmount > 0 ? "active" : ""}">
          <span>베팅금액</span>
          <strong id="pending-points" class="holo-text">${formatNumber(bettingAmount)} P</strong>
        </div>
        <div class="status-chip status-streak">
          <span>연승</span>
          <strong>${session?.currentStreak ?? 0}</strong>
        </div>
      </div>

      <div class="bet-panel holo-border">
        <p class="bet-panel-title">베팅 · 맞출 때마다 배수 적용</p>
        <div class="bet-panel-row">
          <div class="bet-amount-display">
            <strong id="bet-display">${formatNumber(bettingAmount)} P</strong>
          </div>
          ${
            canPlay
              ? `<button class="btn btn-cashout" data-action="cashout" data-busy-toggle="true" ${!canCashout ? "disabled" : ""}>그만하기</button>`
              : `<button class="btn btn-primary holo-btn" data-action="start-game" data-busy-toggle="true">새 게임 시작</button>`
          }
        </div>
        <small>그만하기를 누르기 전까지 베팅금액은 소지금에 반영되지 않습니다.</small>
        ${
          state.user && state.user.points === 0 && !state.user.bonusClaimed && !canPlay
            ? `<button class="btn btn-secondary bonus-btn" data-action="claim-bonus" data-busy-toggle="true">무료 100P 받기</button>`
            : ""
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

      ${
        canPlay
          ? `
        <div class="choice-row">
          <button class="choice-card choice-up" data-action="guess-up" data-busy-toggle="true">
            <span class="choice-label">업 ▲</span>
            <div class="choice-face">
              <span>확률 ${upPercent}%</span>
              <strong>성공 시 x${upMult}</strong>
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
              <strong>성공 시 x${downMult}</strong>
            </div>
          </button>
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
          ${state.activeGame === "updown" ? renderRules(state.board) : ""}
        </section>
        ${renderRankingPanel()}
      </main>
      ${renderInfoModal()}
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
