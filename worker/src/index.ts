import { Hono } from "hono";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/game";
import rankingRoutes from "./routes/ranking";
import userRoutes from "./routes/user";
import { optionalAuth, requireAuth } from "./middleware/auth";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

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

app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
