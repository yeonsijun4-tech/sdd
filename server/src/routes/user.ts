import { Hono } from "hono";
import { hashPassword, isValidPassword, verifyPassword } from "../auth/crypto.js";
import { readJsonBody } from "../lib/http.js";
import { mapApiError } from "../lib/dbError.js";
import {
  deleteUserIfZeroBalance,
  findUserById,
  getActiveGameSession,
  getUserRank,
  publicUser,
  serializeActiveSession,
  updateUserPassword,
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

user.post("/password", async (c) => {
  const userId = c.get("userId");
  const body = await readJsonBody<{ currentPassword?: string; newPassword?: string }>(c);

  if (!body) {
    return c.json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const currentPassword = body.currentPassword ?? "";
  const newPassword = body.newPassword ?? "";

  if (!isValidPassword(newPassword)) {
    return c.json({ error: "새 비밀번호는 6~64자여야 합니다." }, 400);
  }

  if (currentPassword === newPassword) {
    return c.json({ error: "새 비밀번호는 현재 비밀번호와 달라야 합니다." }, 400);
  }

  const dbUser = await findUserById(userId);
  if (!dbUser) {
    return c.json({ error: "사용자를 찾을 수 없습니다." }, 404);
  }

  if (!(await verifyPassword(currentPassword, dbUser.password_hash))) {
    return c.json({ error: "현재 비밀번호가 올바르지 않습니다." }, 401);
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    await updateUserPassword(userId, passwordHash);
    return c.json({ message: "비밀번호가 변경되었습니다." });
  } catch (error) {
    console.error("Password change failed:", error);
    const mapped = mapApiError(error);
    return c.json({ error: mapped.message }, mapped.status);
  }
});

export default user;
