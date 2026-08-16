import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db/client.js";
import { optionalAuth, requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/game.js";
import rankingRoutes from "./routes/ranking.js";
import userRoutes from "./routes/user.js";

function resolvePublicDir(): string {
  if (process.env.PUBLIC_DIR) return process.env.PUBLIC_DIR;

  const candidates = [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "..", "frontend", "dist"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  throw new Error("Frontend build not found. Run npm run build --workspace=frontend");
}

const publicDir = resolvePublicDir();
const app = new Hono();

getDb();

app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

app.route("/api/auth", authRoutes);
app.use("/api/user/*", requireAuth);
app.route("/api/user", userRoutes);
app.use("/api/game/*", requireAuth);
app.route("/api/game", gameRoutes);
app.use("/api/ranking", optionalAuth);
app.route("/api/ranking", rankingRoutes);

app.use("/assets/*", serveStatic({ root: publicDir }));
app.use("/favicon.ico", serveStatic({ root: publicDir }));
app.get("/", serveStatic({ root: publicDir, path: "index.html" }));
app.get("*", serveStatic({ root: publicDir, path: "index.html" }));

const port = Number(process.env.PORT ?? 8080);

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
