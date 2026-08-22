import { Hono } from "hono";
import { readJsonBody } from "../lib/http.js";
import {
  calculateSlotPayout,
  SLOT_MIN_BET,
  SLOT_MIN_MAX_SESSION_GAIN,
  spinSlotReels,
} from "../game/slot.js";
import {
  deleteUserIfZeroBalance,
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
} from "../db/queries.js";
import type { AppVariables } from "../types.js";

const vault = new Hono<{ Variables: AppVariables }>();

vault.get("/eligibility", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(userId);
  if (!dbUser) {
    return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
  }

  return c.json({
    eligible: dbUser.max_session_gain >= SLOT_MIN_MAX_SESSION_GAIN,
    minMaxSessionGain: SLOT_MIN_MAX_SESSION_GAIN,
    minBet: SLOT_MIN_BET,
    maxSessionGain: dbUser.max_session_gain,
  });
});

vault.post("/spin", async (c) => {
  const userId = c.get("userId");
  const body = await readJsonBody<{ betAmount?: number | string }>(c);
  const betAmount = Math.floor(Number(body?.betAmount));

  const dbUser = await findUserById(userId);
  if (!dbUser) {
    return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
  }

  if (dbUser.max_session_gain < SLOT_MIN_MAX_SESSION_GAIN) {
    return c.json(
      {
        error: `최고 획득 ${SLOT_MIN_MAX_SESSION_GAIN.toLocaleString("ko-KR")}P 이상만 이용할 수 있습니다.`,
      },
      403
    );
  }

  const activeSession = await getActiveGameSession(userId);
  if (activeSession) {
    return c.json({ error: "업다운 게임을 먼저 종료한 뒤 이용해 주세요." }, 400);
  }

  if (!Number.isFinite(betAmount) || betAmount < SLOT_MIN_BET) {
    return c.json(
      {
        error: `최소 베팅은 ${SLOT_MIN_BET.toLocaleString("ko-KR")}P 입니다.`,
      },
      400
    );
  }

  if (betAmount > dbUser.points) {
    return c.json(
      {
        error: `보유 포인트(${dbUser.points.toLocaleString("ko-KR")}P) 이내로 베팅해 주세요.`,
      },
      400
    );
  }

  const { reels, win } = spinSlotReels();
  const payout = calculateSlotPayout(betAmount, win);
  const netDelta = payout - betAmount;

  await incrementUserStats(userId, {
    pointsDelta: netDelta,
    gamesPlayed: 1,
    wins: win ? 1 : 0,
    losses: win ? 0 : 1,
    maxSessionGain: win ? payout : undefined,
  });

  const updatedUser = await findUserById(userId);
  if (!updatedUser) {
    return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
  }

  const accountDeleted = await deleteUserIfZeroBalance(userId);
  const rank = accountDeleted ? null : await getUserRank(userId);

  return c.json({
    reels,
    win,
    betAmount,
    payout,
    netDelta,
    message: win
      ? `777! ${payout.toLocaleString("ko-KR")}P 획득`
      : "아쉽게도 빗나갔습니다.",
    accountDeleted,
    user: accountDeleted ? null : publicUser(updatedUser, rank),
  });
});

export default vault;
