import { Hono } from "hono";
import {
  createId,
  hashPassword,
  isValidNickname,
  isValidPassword,
  sanitizeNickname,
  verifyPassword,
} from "../auth/crypto.js";
import { signToken } from "../auth/jwt.js";
import {
  createUser,
  findUserById,
  findUserByNickname,
  getUserRank,
  publicUser,
} from "../db/queries.js";

const auth = new Hono();

auth.post("/register", async (c) => {
  const body = await c.req.json<{ nickname?: string; password?: string }>();
  const nickname = sanitizeNickname(body.nickname ?? "");
  const password = body.password ?? "";

  if (!isValidNickname(nickname)) {
    return c.json(
      {
        error: "닉네임은 2~16자의 한글, 영문, 숫자, _ 만 사용할 수 있습니다.",
      },
      400
    );
  }

  if (!isValidPassword(password)) {
    return c.json({ error: "비밀번호는 6~64자여야 합니다." }, 400);
  }

  const existing = await findUserByNickname(nickname);
  if (existing) {
    return c.json({ error: "이미 사용 중인 닉네임입니다." }, 409);
  }

  const userId = createId();
  const passwordHash = await hashPassword(password);
  await createUser({
    id: userId,
    nickname,
    password_hash: passwordHash,
  });

  const token = await signToken(userId);
  const user = await findUserById(userId);
  const rank = user ? await getUserRank(userId) : null;

  return c.json({
    token,
    user: user ? publicUser(user, rank) : null,
  });
});

auth.post("/login", async (c) => {
  const body = await c.req.json<{ nickname?: string; password?: string }>();
  const nickname = sanitizeNickname(body.nickname ?? "");
  const password = body.password ?? "";

  const user = await findUserByNickname(nickname);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "닉네임 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  const token = await signToken(user.id);
  const rank = await getUserRank(user.id);

  return c.json({
    token,
    user: publicUser(user, rank),
  });
});

export default auth;
