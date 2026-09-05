import { DEV_NICKNAMES, DEV_POINT_GRANT } from "./points.js";
import { query } from "../db/client.js";

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function hasMigration(id: string): Promise<boolean> {
  const result = await query("SELECT id FROM app_migrations WHERE id = $1", [id]);
  return result.rows.length > 0;
}

async function markMigration(id: string): Promise<void> {
  await query("INSERT INTO app_migrations (id) VALUES ($1)", [id]);
}

export async function runPointColumnMigrations(): Promise<void> {
  const migrations = [
    "ALTER TABLE users ALTER COLUMN points TYPE NUMERIC(40,0)",
    "ALTER TABLE users ALTER COLUMN max_session_gain TYPE NUMERIC(40,0)",
    "ALTER TABLE game_sessions ALTER COLUMN session_points TYPE NUMERIC(40,0)",
  ];

  for (const statement of migrations) {
    try {
      await query(statement);
    } catch {
      // Column may already be migrated.
    }
  }
}

export async function addBoardJsonColumn(): Promise<void> {
  try {
    await query("ALTER TABLE game_sessions ADD COLUMN board_json TEXT");
  } catch {
    // Column may already exist.
  }
}

export async function grantDevPointsOnce(): Promise<void> {
  await ensureMigrationsTable();

  const migrationId = `grant-dev-${DEV_POINT_GRANT}`;
  if (await hasMigration(migrationId)) return;

  for (const nickname of DEV_NICKNAMES) {
    await query(
      `UPDATE users
       SET points = COALESCE(points, 0) + $1::numeric
       WHERE LOWER(nickname) = LOWER($2)`,
      [DEV_POINT_GRANT, nickname]
    );
  }

  await markMigration(migrationId);
  console.log(`Granted ${DEV_POINT_GRANT} points to DEV accounts.`);
}
