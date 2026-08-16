import { Hono } from "hono";
import type { Env, GuessChoice } from "../types";
import {
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
  serializeActiveSession,
  updateGameSession,
} from "../db/queries";
import { BONUS_POINTS } from "../types";

const user = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

user.get("/me", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(c.env.DB, userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  const rank = await getUserRank(c.env.DB, userId);
  const activeSession = await getActiveGameSession(c.env.DB, userId);

  return c.json({
    user: publicUser(dbUser, rank),
    activeSession: serializeActiveSession(activeSession),
  });
});

user.post("/bonus", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(c.env.DB, userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  if (dbUser.points > 0) {
    return c.json({ error: "보유 포인트가 0일 때만 보너스를 받을 수 있습니다." }, 400);
  }

  if (dbUser.bonus_claimed === 1) {
    return c.json({ error: "무료 보너스는 1회만 제공됩니다." }, 400);
  }

  await incrementUserStats(c.env.DB, userId, {
    pointsDelta: BONUS_POINTS,
    bonusClaimed: 1,
  });

  const updated = await findUserById(c.env.DB, userId);
  const rank = await getUserRank(c.env.DB, userId);

  return c.json({
    message: `무료 보너스 ${BONUS_POINTS} 포인트가 지급되었습니다.`,
    user: updated ? publicUser(updated, rank) : null,
  });
});

export default user;
