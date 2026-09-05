import { Hono } from "hono";
import { createId } from "../auth/crypto.js";
import { createInitialState, parseBlastState, placePiece } from "../game/blockBlast.js";
import {
  createGameSession,
  findUserById,
  getActiveGameSession,
  getUserRank,
  incrementUserStats,
  publicUser,
  serializeActiveSession,
  updateGameSession,
} from "../db/queries.js";
import type { AppVariables } from "../types.js";

const game = new Hono<{ Variables: AppVariables }>();

function readState(raw: string | null): ReturnType<typeof parseBlastState> {
  if (!raw) return null;
  try {
    return parseBlastState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function payload(session: Awaited<ReturnType<typeof getActiveGameSession>>) {
  return serializeActiveSession(session);
}

async function persistState(
  sessionId: string,
  userId: string,
  next: ReturnType<typeof createInitialState>,
  finish: boolean
) {
  await updateGameSession(sessionId, {
    session_points: String(next.score),
    current_streak: next.combo,
    is_active: finish ? 0 : 1,
    board_json: JSON.stringify(next),
  });

  if (finish) {
    await incrementUserStats(userId, {
      highScore: next.score,
      maxStreak: next.combo,
      gamesPlayed: 1,
    });
  }

  const session = await getActiveGameSession(userId);
  const user = await findUserById(userId);
  const rank = user ? await getUserRank(userId) : null;

  return {
    activeSession: finish ? null : payload(session),
    blast: next,
    user: user ? publicUser(user, rank) : null,
    gameOver: finish,
  };
}

game.get("/state", async (c) => {
  const userId = c.get("userId");
  const session = await getActiveGameSession(userId);
  if (!session) {
    return c.json({ activeSession: null, blast: null });
  }

  const blast = readState(session.board_json);
  return c.json({
    activeSession: payload(session),
    blast,
  });
});

game.post("/start", async (c) => {
  const userId = c.get("userId");
  const existing = await getActiveGameSession(userId);
  if (existing) {
    const blast = readState(existing.board_json);
    return c.json({
      activeSession: payload(existing),
      blast,
      message: "진행 중인 게임이 있습니다.",
    });
  }

  const blast = createInitialState();
  await createGameSession({
    id: createId(),
    user_id: userId,
    current_number: 0,
    session_points: "0",
    board_json: JSON.stringify(blast),
  });

  const session = await getActiveGameSession(userId);
  const user = await findUserById(userId);
  const rank = user ? await getUserRank(userId) : null;

  return c.json({
    activeSession: payload(session),
    blast,
    user: user ? publicUser(user, rank) : null,
  });
});

game.post("/place", async (c) => {
  const userId = c.get("userId");
  const body = (await c.req.json<{ pieceIndex?: number; row?: number; col?: number }>().catch(() => ({
    pieceIndex: undefined,
    row: undefined,
    col: undefined,
  }))) as { pieceIndex?: number; row?: number; col?: number };
  const pieceIndex = Number(body.pieceIndex);
  const row = Number(body.row);
  const col = Number(body.col);

  const session = await getActiveGameSession(userId);
  if (!session?.board_json) {
    return c.json({ error: "진행 중인 게임이 없습니다." }, 400);
  }

  const current = readState(session.board_json);
  if (!current) {
    return c.json({ error: "게임 상태를 불러오지 못했습니다." }, 400);
  }

  const next = placePiece(current, pieceIndex, row, col);
  if (!next) {
    return c.json({ error: "그 위치에는 놓을 수 없습니다." }, 400);
  }

  return c.json(await persistState(session.id, userId, next, next.gameOver));
});

game.post("/restart", async (c) => {
  const userId = c.get("userId");
  const existing = await getActiveGameSession(userId);
  if (existing?.board_json) {
    const current = readState(existing.board_json);
    if (current && !current.gameOver) {
      await incrementUserStats(userId, {
        highScore: current.score,
        maxStreak: current.combo,
        gamesPlayed: 1,
      });
      await updateGameSession(existing.id, { is_active: 0 });
    }
  }

  const blast = createInitialState();
  await createGameSession({
    id: createId(),
    user_id: userId,
    current_number: 0,
    session_points: "0",
    board_json: JSON.stringify(blast),
  });

  const session = await getActiveGameSession(userId);
  const user = await findUserById(userId);
  const rank = user ? await getUserRank(userId) : null;

  return c.json({
    activeSession: payload(session),
    blast,
    user: user ? publicUser(user, rank) : null,
  });
});

export default game;
