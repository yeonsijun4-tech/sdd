import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import { resolveSchemaPath } from "../lib/paths.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let runtimeJwtSecret: string | null = null;

function getSslConfig(): pg.ConnectionConfig["ssl"] {
  if (process.env.DATABASE_SSL === "false") return undefined;
  if (process.env.NODE_ENV === "production") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  pool = new Pool({
    connectionString,
    ssl: getSslConfig(),
  });

  return pool;
}

export async function initDb(): Promise<void> {
  const schema = fs.readFileSync(resolveSchemaPath(), "utf8");
  await getPool().query(schema);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (!runtimeJwtSecret) {
    runtimeJwtSecret = crypto.randomBytes(32).toString("hex");
    console.warn(
      "JWT_SECRET is not set. Using a temporary in-memory secret. Set JWT_SECRET in Render for stable sessions."
    );
  }

  return runtimeJwtSecret;
}
