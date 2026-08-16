import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getDb, getJwtSecret } from "./db/client.js";
import { resolvePublicDir } from "./lib/paths.js";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import rankingRoutes from "./routes/ranking.js";
import userRoutes from "./routes/user.js";

const publicDir = resolvePublicDir();
const app = new Hono();

try {
  getDb();
  getJwtSecret();
  console.log("Database and auth configuration ready");
} catch (error) {
  console.error("Startup initialization failed:", error);
  throw error;
}

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." }, 500);
});

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    time: new Date().toISOString(),
  });
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

app.route("/api/auth", authRoutes);
app.use("/api/user/*", requireAuth);
app.route("/api/user", userRoutes);
app.use("/api/game/*", requireAuth);
app.route("/api/game", gameRoutes);
app.use("/api/ranking/*", optionalAuth);
app.use("/api/ranking", optionalAuth);
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
