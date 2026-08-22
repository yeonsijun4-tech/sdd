import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg from "pg";
import { resolveDatabasePath, resolveSchemaPath, resolveSqliteSchemaPath } from "../lib/paths.js";
import { isDbConnectionError } from "../lib/dbError.js";

const { Pool } = pg;

type DbMode = "postgres" | "sqlite";

let pool: pg.Pool | null = null;
let poolResetPromise: Promise<void> | null = null;
let sqliteDb: DatabaseSync | null = null;
let dbMode: DbMode | null = null;
let runtimeJwtSecret: string | null = null;

function resolveDbMode(): DbMode {
  if (dbMode) return dbMode;
  dbMode = process.env.DATABASE_URL ? "postgres" : "sqlite";
  return dbMode;
}

function getSslConfig(connectionString: string): pg.ConnectionConfig["ssl"] {
  if (process.env.DATABASE_SSL === "false") return undefined;
  if (
    process.env.NODE_ENV === "production" ||
    connectionString.includes("render.com") ||
    connectionString.includes("sslmode=require")
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL mode");
  }

  pool = new Pool({
    connectionString,
    ssl: getSslConfig(connectionString),
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 120_000,
    max: 10,
    keepAlive: true,
  });

  pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error);
  });

  return pool;
}

async function resetPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end().catch(() => undefined);
}

async function resetPoolSafe(): Promise<void> {
  if (poolResetPromise) {
    await poolResetPromise;
    return;
  }

  poolResetPromise = resetPool().finally(() => {
    poolResetPromise = null;
  });
  await poolResetPromise;
}

function isPgConnectionError(error: unknown): boolean {
  return isDbConnectionError(error);
}

function getSqliteDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb;

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA journal_mode = WAL");
  sqliteDb.exec("PRAGMA foreign_keys = ON");

  return sqliteDb;
}

function resolveSchemaFile(mode: DbMode): string {
  return mode === "sqlite" ? resolveSqliteSchemaPath() : resolveSchemaPath();
}

function normalizeSqliteParams(params: unknown[]): SQLInputValue[] {
  return params.map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "bigint") return Number(value);
    return value as SQLInputValue;
  });
}

function toSqliteSql(text: string): string {
  return text
    .replace(/\$(\d+)/g, "?")
    .replace(/\bTRUE\b/g, "1")
    .replace(/\bFALSE\b/g, "0")
    .replace(/\bGREATEST\b/g, "MAX");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPointColumnMigrations(): Promise<void> {
  const migrations = [
    "ALTER TABLE users ALTER COLUMN points TYPE BIGINT",
    "ALTER TABLE users ALTER COLUMN max_session_gain TYPE BIGINT",
    "ALTER TABLE game_sessions ALTER COLUMN session_points TYPE BIGINT",
  ];

  for (const statement of migrations) {
    try {
      await query(statement);
    } catch {
      // Column may already be BIGINT or SQLite fallback is active elsewhere.
    }
  }
}

export async function initDb(): Promise<void> {
  const mode = resolveDbMode();
  const schema = fs.readFileSync(resolveSchemaFile(mode), "utf8");

  if (mode === "postgres") {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        await resetPoolSafe();
        await getPool().query("SELECT 1");
        await getPool().query(schema);
        await runPointColumnMigrations();
        console.log("PostgreSQL database ready");
        return;
      } catch (error) {
        lastError = error;
        console.error(`PostgreSQL init attempt ${attempt}/10 failed:`, error);
        await resetPoolSafe();
        if (attempt < 10) await sleep(1500 * attempt);
      }
    }

    if (process.env.DATABASE_URL) {
      throw lastError instanceof Error
        ? lastError
        : new Error("PostgreSQL database is unavailable.");
    }

    console.error("PostgreSQL unavailable. Falling back to SQLite:", lastError);
    dbMode = "sqlite";
    getSqliteDb().exec(fs.readFileSync(resolveSqliteSchemaPath(), "utf8"));
    console.warn(
      "Using local SQLite storage. Link Render PostgreSQL DATABASE_URL for persistent rankings and accounts."
    );
    return;
  }

  getSqliteDb().exec(schema);
  console.warn(
    "Using local SQLite storage. Set DATABASE_URL on Render for persistent rankings and accounts."
  );
}

async function queryPostgres<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[],
  attempt = 0
): Promise<pg.QueryResult<T>> {
  if (poolResetPromise) {
    await poolResetPromise;
  }

  try {
    return await getPool().query<T>(text, params);
  } catch (error) {
    if (attempt < 4 && isPgConnectionError(error)) {
      await resetPoolSafe();
      await sleep(300 * 2 ** attempt);
      return queryPostgres(text, params, attempt + 1);
    }
    throw error;
  }
}

export function startDbKeepAlive(): void {
  if (resolveDbMode() !== "postgres") return;

  setInterval(() => {
    void query("SELECT 1").catch((error) => {
      console.error("Database keep-alive failed:", error);
    });
  }, 45_000);
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<pg.QueryResult<T>> {
  if (resolveDbMode() === "postgres") {
    return queryPostgres<T>(text, params);
  }

  const statement = getSqliteDb().prepare(toSqliteSql(text));
  const normalizedParams = normalizeSqliteParams(params);
  const command = text.trimStart().split(/\s+/)[0]?.toUpperCase();

  if (command === "SELECT") {
    const rows = statement.all(...normalizedParams) as T[];
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
  }

  const result = statement.run(...normalizedParams);
  return { rows: [], rowCount: Number(result.changes), command, oid: 0, fields: [] };
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
