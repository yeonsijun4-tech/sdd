import { Hono } from "hono";
import {
  deleteUserIfZeroBalance,
  findUserById,
  getActiveGameSession,
  getUserRank,
  publicUser,
  serializeActiveSession,
} from "../db/queries.js";
import type { AppVariables } from "../types.js";

const user = new Hono<{ Variables: AppVariables }>();

user.get("/me", async (c) => {
  const userId = c.get("userId");
  const dbUser = await findUserById(userId);
  if (!dbUser) return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);

  const accountDeleted = await deleteUserIfZeroBalance(userId);
  if (accountDeleted) {
    return c.json(
      {
        error: "보유 포인트가 0P가 되어 계정이 삭제되었습니다.",
        accountDeleted: true,
      },
      410
    );
  }

  const rank = await getUserRank(userId);
  const activeSession = await getActiveGameSession(userId);

  return c.json({
    user: publicUser(dbUser, rank),
    activeSession: serializeActiveSession(activeSession),
  });
});

export default user;
