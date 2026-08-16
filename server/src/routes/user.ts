import { Hono } from "hono";
import {
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
  serializeActiveSession,
} from "../db/queries.js";
import { BONUS_POINTS, type AppVariables } from "../types.js";

const user = new Hono<{ Variables: AppVariables }>();

user.get("/me", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  const rank = await getUserRank(userId);
  const activeSession = await getActiveGameSession(userId);

  return c.json({
    user: publicUser(dbUser, rank),
    activeSession: serializeActiveSession(activeSession),
  });
});

user.post("/bonus", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  if (dbUser.points > 0) {
    return c.json({ error: "보유 금액이 0원일 때만 보너스를 받을 수 있습니다." }, 400);
  }

  if (dbUser.bonus_claimed === 1) {
    return c.json({ error: "무료 보너스는 1회만 제공됩니다." }, 400);
  }

  await incrementUserStats(userId, {
    pointsDelta: BONUS_POINTS,
    bonusClaimed: 1,
  });

  const updated = await findUserById(userId);
  const rank = await getUserRank(userId);

  return c.json({
    message: `무료 보너스 ${BONUS_POINTS.toLocaleString("ko-KR")}원이 지급되었습니다.`,
    user: updated ? publicUser(updated, rank) : null,
  });
});

export default user;
