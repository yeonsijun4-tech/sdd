import { Hono } from "hono";
import {
  findUserById,
  getRankings,
  getUserRank,
  publicUser,
} from "../db/queries.js";
import type { OptionalAuthVariables } from "../types.js";

const ranking = new Hono<{ Variables: OptionalAuthVariables }>();

ranking.get("/", async (c) => {
  const rows = await getRankings(20);
  const userId = c.get("userId");

  let myRank = null;
  if (userId) {
    const user = await findUserById(userId);
    const rank = user ? await getUserRank(userId) : null;
    myRank = user ? publicUser(user, rank) : null;
  }

  return c.json({
    rankings: rows.map((row) => ({
      rank: row.rank,
      nickname: row.nickname,
      points: row.points,
      maxStreak: row.max_streak,
      maxSessionGain: row.max_session_gain,
    })),
    myRank,
    updatedAt: new Date().toISOString(),
  });
});

export default ranking;
