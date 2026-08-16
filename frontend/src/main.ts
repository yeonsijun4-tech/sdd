import {
  api,
  getToken,
  setToken,
  type ActiveSession,
  type BoardState,
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
  lastResult: {
    type: "WIN" | "LOSE" | "TIE";
    previousNumber: number;
    nextNumber: number;
    message?: string;
  } | null;
  toast: string | null;
}

const state: AppState = {
  user: null,
  activeSession: null,
  board: null,
  rankings: [],
  rankingUpdatedAt: "",
  isBusy: false,
  authMode: "login",
  lastResult: null,
  toast: null,
};

let rankingTimer: number | null = null;

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function showToast(message: string) {
  state.toast = message;
  render();
  window.setTimeout(() => {
    state.toast = null;
    render();
  }, 2800);
}

async function withBusy<T>(task: () => Promise<T>): Promise<T | null> {
  state.isBusy = true;
  render();
  try {
    return await task();
  } catch (error) {
    showToast(error instanceof Error ? error.message : "오류가 발생했습니다.");
    return null;
  } finally {
    state.isBusy = false;
    render();
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
    render();
  } catch {
    // ranking failures should not block gameplay
  }
}

async function bootstrap() {
  await refreshRankings();
  rankingTimer = window.setInterval(refreshRankings, 5000);

  if (getToken()) {
    const result = await withBusy(async () => api.me());
    if (result) {
      state.user = result.user;
      state.activeSession = result.activeSession;

      if (result.activeSession) {
        const gameState = await api.gameState();
        state.board = gameState.board ?? null;
      }
    }
  }

  render();
}

function renderAuthModal() {
  return `
    <div class="modal-backdrop">
      <div class="modal card-surface">
        <div class="modal-header">
          <h2>${state.authMode === "login" ? "로그인" : "회원가입"}</h2>
          <p>가상 포인트만 사용하는 UP/DOWN 게임입니다. 실제 금전 거래는 없습니다.</p>
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
          <button class="btn btn-primary" type="submit" ${state.isBusy ? "disabled" : ""}>
            ${state.authMode === "login" ? "로그인" : "가입하고 시작"}
          </button>
        </form>
        <button class="link-btn" id="toggle-auth-mode" type="button">
          ${state.authMode === "login" ? "계정이 없나요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </div>
  `;
}

function renderRules(board: BoardState | null) {
  if (!board) return "";
  return `
    <div class="rules card-surface">
      <h3>확률 공개</h3>
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
    <aside class="ranking-panel card-surface">
      <div class="panel-header">
        <h2>실시간 랭킹</h2>
        <span class="live-dot">LIVE</span>
      </div>
      <div class="my-rank-box">
        <span>내 순위</span>
        <strong>${myRankText}</strong>
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
                  <td>#${row.rank}</td>
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
    <section class="game-board card-surface ${state.lastResult?.type ?? ""}">
      <div class="board-top">
        <div>
          <p class="label">현재 숫자</p>
          <div class="number-card">
            <span id="current-number" class="current-number">${currentNumber}</span>
          </div>
        </div>
        <div class="stats-grid">
          <div>
            <span>UP 확률</span>
            <strong>${board ? `${board.probabilities.up}%` : "-"}</strong>
          </div>
          <div>
            <span>DOWN 확률</span>
            <strong>${board ? `${board.probabilities.down}%` : "-"}</strong>
          </div>
          <div>
            <span>동일 숫자</span>
            <strong>${board ? `${board.probabilities.tie}%` : "-"}</strong>
          </div>
          <div>
            <span>UP 배수</span>
            <strong class="holo-text">x${board?.multipliers.up ?? "-"}</strong>
          </div>
          <div>
            <span>DOWN 배수</span>
            <strong class="holo-text">x${board?.multipliers.down ?? "-"}</strong>
          </div>
          <div>
            <span>현재 연승</span>
            <strong>${session?.currentStreak ?? 0}</strong>
          </div>
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
          <strong>${state.lastResult.type === "WIN" ? "성공" : state.lastResult.type === "TIE" ? "동일 숫자" : "실패"}</strong>
          ${state.lastResult.message ? `<p>${state.lastResult.message}</p>` : ""}
        </div>
      `
          : ""
      }

      <div class="action-row">
        ${
          canPlay
            ? `
          <button class="btn btn-up" data-action="guess-up" ${state.isBusy ? "disabled" : ""}>UP</button>
          <button class="btn btn-down" data-action="guess-down" ${state.isBusy ? "disabled" : ""}>DOWN</button>
          <button class="btn btn-cashout" data-action="cashout" ${!canCashout || state.isBusy ? "disabled" : ""}>그만하기</button>
        `
            : `
          <button class="btn btn-primary" data-action="start-game" ${state.isBusy ? "disabled" : ""}>새 게임 시작</button>
          ${
            state.user && state.user.points === 0 && !state.user.bonusClaimed
              ? `<button class="btn btn-secondary" data-action="claim-bonus" ${state.isBusy ? "disabled" : ""}>무료 100P 받기</button>`
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
            <span class="brand-mark">1ZUXM</span>
            <span class="brand-sub">Virtual Point Game</span>
          </div>
        </header>
        ${renderAuthModal()}
      </div>
    `;
    bindAuthEvents();
    return;
  }

  app.innerHTML = `
    <div class="page-shell">
      <header class="topbar card-surface">
        <div class="brand">
          <span class="brand-mark">1ZUXM</span>
          <span class="brand-sub">UP / DOWN</span>
        </div>
        <div class="user-stats">
          <div><span>닉네임</span><strong>${state.user.nickname}</strong></div>
          <div><span>보유 포인트</span><strong class="holo-text">${formatNumber(state.user.points)} P</strong></div>
          <div><span>내 랭킹</span><strong>${state.user.rank ? `#${state.user.rank}` : "-"}</strong></div>
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
    </div>
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
  `;

  bindGameEvents();
}

function render() {
  renderApp();
}

function bindAuthEvents() {
  document.querySelector<HTMLFormElement>("#auth-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nickname = String(formData.get("nickname") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await withBusy(async () =>
      state.authMode === "login"
        ? api.login(nickname, password)
        : api.register(nickname, password)
    );

    if (!result) return;
    setToken(result.token);
    state.user = result.user;
    state.activeSession = null;
    state.board = null;
    state.lastResult = null;
    showToast(`${result.user.nickname}님, 환영합니다.`);
    render();
  });

  document.querySelector("#toggle-auth-mode")?.addEventListener("click", () => {
    state.authMode = state.authMode === "login" ? "register" : "login";
    render();
  });
}

function bindGameEvents() {
  document.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
    setToken(null);
    state.user = null;
    state.activeSession = null;
    state.board = null;
    state.lastResult = null;
    render();
  });

  document.querySelector('[data-action="start-game"]')?.addEventListener("click", async () => {
    const result = await withBusy(async () => api.startGame());
    if (!result) return;
    state.activeSession = result.activeSession;
    state.board = result.board;
    state.lastResult = null;
    if (result.message) showToast(result.message);
    render();
  });

  document.querySelector('[data-action="claim-bonus"]')?.addEventListener("click", async () => {
    const result = await withBusy(async () => api.claimBonus());
    if (!result) return;
    state.user = result.user;
    showToast(result.message);
    render();
  });

  document.querySelector('[data-action="guess-up"]')?.addEventListener("click", () => handleGuess("UP"));
  document.querySelector('[data-action="guess-down"]')?.addEventListener("click", () => handleGuess("DOWN"));

  document.querySelector('[data-action="cashout"]')?.addEventListener("click", async () => {
    const result = await withBusy(async () => api.cashout());
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

  animateNumberChange(result.previousNumber, result.nextNumber);

  if (result.result === "WIN") {
    state.activeSession = result.activeSession;
    state.board = result.board ?? null;
    if (result.gain) animatePointsGain(result.gain);
    showToast(`성공! +${formatNumber(result.gain ?? 0)} P`);
  } else {
    state.activeSession = null;
    state.board = null;
    if (result.user) state.user = result.user;
    showToast(result.message ?? "게임이 종료되었습니다.");
    await refreshRankings();
  }

  render();
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
