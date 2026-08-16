import type { Context, Next } from "hono";
import { verifyToken } from "../auth/jwt";
import type { Env } from "../types";

export async function requireAuth(c: Context<{ Bindings: Env; Variables: { userId: string } }>, next: Next) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return c.json({ error: "로그인이 필요합니다." }, 401);
  }

  const userId = await verifyToken(token, c.env.JWT_SECRET);
  if (!userId) {
    return c.json({ error: "세션이 만료되었습니다. 다시 로그인해 주세요." }, 401);
  }

  c.set("userId", userId);
  await next();
}

export async function optionalAuth(
  c: Context<{ Bindings: Env; Variables: { userId?: string } }>,
  next: Next
) {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    const userId = await verifyToken(token, c.env.JWT_SECRET);
    if (userId) c.set("userId", userId);
  }

  await next();
}
