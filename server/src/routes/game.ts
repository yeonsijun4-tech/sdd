import { Hono } from "hono";
import { createId } from "../auth/crypto.js";
import {
  buildProbabilityPayload,
  calculateProbabilities,
  applyWinMultiplier,
  evaluateGuess,
  randomNumber,
  randomNumberExcept,
} from "../game/logic.js";
import {
  createGameSession,
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
  serializeActiveSession,
  updateGameSession,
} from "../db/queries.js";
import type { AppVariables, GuessChoice } from "../types.js";

const game = new Hono<{ Variables: AppVariables }>();

game.get("/state", async (c) => {
  const userId = c.get("userId");
  const session = await getActiveGameSession(userId);

  if (!session) {
    return c.json({ activeSession: null });
  }

  return c.json({
    activeSession: serializeActiveSession(session),
    board: buildProbabilityPayload(session.current_number),
  });
});

game.post("/start", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json<{ betAmount?: number | string }>().catch(() => ({
    betAmount: undefined,
  }))) as { betAmount?: number | string };
  const betAmount = Math.floor(Number(body.betAmount));
  const dbUser = await findUserById(userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  const existing = await getActiveGameSession(userId);
  if (existing) {
    return c.json({
      activeSession: serializeActiveSession(existing),
      board: buildProbabilityPayload(existing.current_number),
      message: "이미 진행 중인 게임이 있습니다.",
    });
  }

  if (dbUser.points <= 0) {
    return c.json(
      {
        error: "보유 포인트가 없습니다. 무료 보너스를 받은 뒤 사용할 포인트를 입력해 주세요.",
        needsBonus: dbUser.bonus_claimed === 0,
      },
      400
    );
  }

  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    return c.json({ error: "사용할 포인트를 입력해 주세요. 1P 이상 입력해야 게임을 시작할 수 있습니다." }, 400);
  }

  if (betAmount > dbUser.points) {
    return c.json(
      { error: `사용 포인트는 보유 포인트(${dbUser.points.toLocaleString("ko-KR")}P) 이하여야 합니다.` },
      400
    );
  }

  const sessionId = createId();
  const currentNumber = randomNumber();
  await incrementUserStats(userId, { pointsDelta: -betAmount });
  await createGameSession({
    id: sessionId,
    user_id: userId,
    current_number: currentNumber,
    session_points: betAmount,
  });

  const session = await getActiveGameSession(userId);
  const updatedUser = await findUserById(userId);
  const rank = await getUserRank(userId);

  return c.json({
    activeSession: serializeActiveSession(session),
    board: buildProbabilityPayload(currentNumber),
    user: updatedUser ? publicUser(updatedUser, rank) : null,
  });
});

game.post("/guess", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ choice?: string }>();
  const choice = body.choice?.toUpperCase();

  if (choice !== "UP" && choice !== "DOWN") {
    return c.json({ error: "UP 또는 DOWN을 선택해야 합니다." }, 400);
  }

  const session = await getActiveGameSession(userId);
  if (!session) {
    return c.json({ error: "진행 중인 게임이 없습니다. 새 게임을 시작하세요." }, 400);
  }

  const probabilities = calculateProbabilities(session.current_number);
  const selectedMultiplier =
    choice === "UP" ? probabilities.upMultiplier : probabilities.downMultiplier;

  if (selectedMultiplier <= 0) {
    return c.json({ error: "선택할 수 없는 방향입니다." }, 400);
  }

  const nextNumber = randomNumberExcept(session.current_number);
  const result = evaluateGuess(
    session.current_number,
    nextNumber,
    choice as GuessChoice
  );

  if (result === "WIN") {
    const { gain, total: newSessionPoints } = applyWinMultiplier(session.session_points);
    const newStreak = session.current_streak + 1;

    await updateGameSession(session.id, {
      current_number: nextNumber,
      session_points: newSessionPoints,
      current_streak: newStreak,
    });

    const updated = await getActiveGameSession(userId);

    return c.json({
      result: "WIN",
      previousNumber: session.current_number,
      nextNumber,
      choice,
      gain,
      activeSession: serializeActiveSession(updated),
      board: buildProbabilityPayload(nextNumber),
    });
  }

  const lostPoints = session.session_points;
  await updateGameSession(session.id, { is_active: 0 });
  await incrementUserStats(userId, {
    gamesPlayed: 1,
    losses: 1,
    maxStreak: session.current_streak,
    maxSessionGain: lostPoints,
  });

  const dbUser = await findUserById(userId);
  const rank = await getUserRank(userId);

  return c.json({
    result: "LOSE",
    previousNumber: session.current_number,
    nextNumber,
    choice,
    lostPoints,
    message: "예측에 실패했습니다. 이번 게임의 미확정 포인트가 초기화됩니다.",
    activeSession: null,
    user: dbUser ? publicUser(dbUser, rank) : null,
  });
});

game.post("/cashout", async (c) => {
  const userId = c.get("userId");
  const session = await getActiveGameSession(userId);
  if (!session) {
    return c.json({ error: "진행 중인 게임이 없습니다." }, 400);
  }

  if (session.session_points <= 0) {
    return c.json({ error: "확정할 미확정 포인트가 없습니다." }, 400);
  }

  const earned = session.session_points;

  await updateGameSession(session.id, { is_active: 0 });
  await incrementUserStats(userId, {
    pointsDelta: earned,
    gamesPlayed: 1,
    wins: 1,
    maxStreak: session.current_streak,
    maxSessionGain: earned,
  });

  const dbUser = await findUserById(userId);
  const rank = await getUserRank(userId);

  return c.json({
    message: `${earned.toLocaleString("ko-KR")}P가 보유 포인트에 추가되었습니다.`,
    earned,
    user: dbUser ? publicUser(dbUser, rank) : null,
    activeSession: null,
  });
});

export default game;
