import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getJwtSecret, initDb, query, startDbKeepAlive } from "./db/client.js";
import { mapApiError } from "./lib/dbError.js";
import { resolvePublicDir } from "./lib/paths.js";
import { readJsonBody } from "./lib/http.js";
import { getOnlineCount, removeConnection, touchConnection } from "./lib/presence.js";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import rankingRoutes from "./routes/ranking.js";
import userRoutes from "./routes/user.js";

const publicDir = resolvePublicDir();
const app = new Hono();

try {
  await initDb();
  getJwtSecret();
  startDbKeepAlive();
  console.log("Database and auth configuration ready");
} catch (error) {
  console.error("Startup initialization failed:", error);
  throw error;
}

app.onError((error, c) => {
  console.error(error);
  const mapped = mapApiError(error);
  return c.json({ error: mapped.message }, mapped.status);
});

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  try {
    await next();
  } catch (error) {
    console.error("API route error:", error);
    const mapped = mapApiError(error);
    return c.json({ error: mapped.message }, mapped.status);
  }
});

app.get("/api/health", async (c) => {
  try {
    await query("SELECT 1");
    return c.json({
      ok: true,
      db: "ok",
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    const mapped = mapApiError(error);
    return c.json(
      {
        ok: false,
        db: "error",
        error: mapped.message,
        time: new Date().toISOString(),
      },
      mapped.status
    );
  }
});

app.get("/api/session/info", (c) => {
  const forwarded = c.req.header("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "확인 중";

  return c.json({
    ip,
    time: new Date().toISOString(),
  });
});

app.get("/api/presence/count", (c) => {
  return c.json({ count: getOnlineCount() });
});

app.post("/api/presence/heartbeat", async (c) => {
  const body = await readJsonBody<{ clientId?: string }>(c);
  const clientId = String(body?.clientId ?? "").trim();
  const count = clientId ? touchConnection(clientId) : getOnlineCount();
  return c.json({ count });
});

app.post("/api/presence/leave", async (c) => {
  const body = await readJsonBody<{ clientId?: string }>(c);
  const clientId = String(body?.clientId ?? "").trim();
  const count = clientId ? removeConnection(clientId) : getOnlineCount();
  return c.json({ count });
});

app.route("/api/auth", authRoutes);
app.use("/api/user/*", requireAuth);
app.route("/api/user", userRoutes);
app.use("/api/game/*", requireAuth);
app.route("/api/game", gameRoutes);
app.use("/api/ranking/*", optionalAuth);
app.route("/api/ranking", rankingRoutes);

app.use("/assets/*", serveStatic({ root: publicDir }));
app.use("/favicon.ico", serveStatic({ root: publicDir }));
app.get("/", serveStatic({ root: publicDir, path: "index.html" }));
app.get("*", serveStatic({ root: publicDir, path: "index.html" }));

const port = Number(process.env.PORT ?? 8080);

console.log(`Serving frontend from ${publicDir}`);

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  },
  (info: { address: string; port: number }) => {
    console.log(`1zuxm-game running on http://${info.address}:${info.port}`);
  }
);
