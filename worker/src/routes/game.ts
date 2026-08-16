import { Hono } from "hono";
import {
  buildProbabilityPayload,
  calculateProbabilities,
  calculateRoundGain,
  evaluateGuess,
  randomNumber,
} from "../game/logic";
import {
  createGameSession,
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
  serializeActiveSession,
  updateGameSession,
} from "../db/queries";
import { createId } from "../auth/crypto";
import type { Env, GuessChoice } from "../types";

const game = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

game.get("/state", async (c) => {
  const userId = c.get("userId");
  const session = await getActiveGameSession(c.env.DB, userId);

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
  const dbUser = await findUserById(c.env.DB, userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  const existing = await getActiveGameSession(c.env.DB, userId);
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
        error: "보유 포인트가 없습니다. 무료 보너스를 받거나 그만하기로 포인트를 확정하세요.",
        needsBonus: dbUser.bonus_claimed === 0,
      },
      400
    );
  }

  const sessionId = createId();
  const currentNumber = randomNumber();
  await createGameSession(c.env.DB, {
    id: sessionId,
    user_id: userId,
    current_number: currentNumber,
  });

  const session = await getActiveGameSession(c.env.DB, userId);

  return c.json({
    activeSession: serializeActiveSession(session),
    board: buildProbabilityPayload(currentNumber),
  });
});

game.post("/guess", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{ choice?: string }>();
  const choice = body.choice?.toUpperCase();

  if (choice !== "UP" && choice !== "DOWN") {
    return c.json({ error: "UP 또는 DOWN을 선택해야 합니다." }, 400);
  }

  const session = await getActiveGameSession(c.env.DB, userId);
  if (!session) {
    return c.json({ error: "진행 중인 게임이 없습니다. 새 게임을 시작하세요." }, 400);
  }

  const probabilities = calculateProbabilities(session.current_number);
  const selectedMultiplier =
    choice === "UP" ? probabilities.upMultiplier : probabilities.downMultiplier;

  if (selectedMultiplier <= 0) {
    return c.json({ error: "선택할 수 없는 방향입니다." }, 400);
  }

  const nextNumber = randomNumber();
  const result = evaluateGuess(
    session.current_number,
    nextNumber,
    choice as GuessChoice
  );

  if (result === "WIN") {
    const gain = calculateRoundGain(choice as GuessChoice, probabilities);
    const newSessionPoints = session.session_points + gain;
    const newStreak = session.current_streak + 1;

    await updateGameSession(c.env.DB, session.id, {
      current_number: nextNumber,
      session_points: newSessionPoints,
      current_streak: newStreak,
    });

    const updated = await getActiveGameSession(c.env.DB, userId);

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
  await updateGameSession(c.env.DB, session.id, { is_active: 0 });
  await incrementUserStats(c.env.DB, userId, {
    gamesPlayed: 1,
    losses: 1,
    maxStreak: session.current_streak,
    maxSessionGain: lostPoints,
  });

  const dbUser = await findUserById(c.env.DB, userId);
  const rank = await getUserRank(c.env.DB, userId);

  return c.json({
    result: result === "TIE" ? "TIE" : "LOSE",
    previousNumber: session.current_number,
    nextNumber,
    choice,
    lostPoints,
    message:
      result === "TIE"
        ? "동일 숫자가 나와 UP/DOWN 모두 실패 처리되었습니다."
        : "예측에 실패했습니다. 이번 게임의 미확정 포인트가 초기화됩니다.",
    activeSession: null,
    user: dbUser ? publicUser(dbUser, rank) : null,
  });
});

game.post("/cashout", async (c) => {
  const userId = c.get("userId");
  const session = await getActiveGameSession(c.env.DB, userId);
  if (!session) {
    return c.json({ error: "진행 중인 게임이 없습니다." }, 400);
  }

  if (session.session_points <= 0) {
    return c.json({ error: "확정할 미확정 포인트가 없습니다." }, 400);
  }

  const earned = session.session_points;

  await updateGameSession(c.env.DB, session.id, { is_active: 0 });
  await incrementUserStats(c.env.DB, userId, {
    pointsDelta: earned,
    gamesPlayed: 1,
    wins: 1,
    maxStreak: session.current_streak,
    maxSessionGain: earned,
  });

  const dbUser = await findUserById(c.env.DB, userId);
  const rank = await getUserRank(c.env.DB, userId);

  return c.json({
    message: `${earned} 포인트가 보유 포인트에 추가되었습니다.`,
    earned,
    user: dbUser ? publicUser(dbUser, rank) : null,
    activeSession: null,
  });
});

export default game;
