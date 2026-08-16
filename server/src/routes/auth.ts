import { Hono } from "hono";
import { createCaptcha, verifyCaptcha } from "../auth/captcha.js";
import { readJsonBody } from "../lib/http.js";
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

auth.get("/captcha", (c) => {
  return c.json(createCaptcha());
});

auth.post("/register", async (c) => {
  const body = await readJsonBody<{
    nickname?: string;
    password?: string;
    captchaId?: string;
    captchaAnswer?: string;
  }>(c);

  if (!body) {
    return c.json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const nickname = sanitizeNickname(body.nickname ?? "");
  const password = body.password ?? "";
  const captchaId = body.captchaId ?? "";
  const captchaAnswer = String(body.captchaAnswer ?? "").trim();

  if (!verifyCaptcha(captchaId, captchaAnswer)) {
    return c.json({ error: "보안코드가 올바르지 않거나 만료되었습니다." }, 400);
  }

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

  try {
    const userId = createId();
    const passwordHash = await hashPassword(password);
    await createUser({
      id: userId,
      nickname,
      password_hash: passwordHash,
    });

    const token = await signToken(userId, true);
    const user = await findUserById(userId);
    const rank = user ? await getUserRank(userId) : null;

    return c.json({
      token,
      user: user ? publicUser(user, rank) : null,
    });
  } catch (error) {
    console.error("Register failed:", error);
    return c.json({ error: "회원가입 처리 중 오류가 발생했습니다." }, 500);
  }
});

auth.post("/login", async (c) => {
  const body = await readJsonBody<{
    nickname?: string;
    password?: string;
    rememberMe?: boolean;
  }>(c);

  if (!body) {
    return c.json({ error: "요청 형식이 올바르지 않습니다." }, 400);
  }
  const nickname = sanitizeNickname(body.nickname ?? "");
  const password = body.password ?? "";
  const rememberMe = body.rememberMe !== false;

  const user = await findUserByNickname(nickname);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: "닉네임 또는 비밀번호가 올바르지 않습니다." }, 401);
  }

  try {
    const token = await signToken(user.id, rememberMe);
    const rank = await getUserRank(user.id);

    return c.json({
      token,
      user: publicUser(user, rank),
      rememberMe,
    });
  } catch (error) {
    console.error("Login failed:", error);
    return c.json({ error: "로그인 처리 중 오류가 발생했습니다." }, 500);
  }
});

export default auth;
