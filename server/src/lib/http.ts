import type { Context } from "hono";

export async function readJsonBody<T extends Record<string, unknown>>(
  c: Context
): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}
