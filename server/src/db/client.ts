import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import pg from "pg";
import { resolveDatabasePath, resolveSchemaPath, resolveSqliteSchemaPath } from "../lib/paths.js";

const { Pool } = pg;

type DbMode = "postgres" | "sqlite";

let pool: pg.Pool | null = null;
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
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error);
    void resetPool();
  });

  return pool;
}

async function resetPool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end().catch(() => undefined);
}

function isPgConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  const code = candidate.code ?? "";
  const message = candidate.message ?? "";
  return (
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "57P01", "53300", "08006", "08003", "ECONNABORTED"].includes(
      code
    ) ||
    message.includes("Connection terminated") ||
    message.includes("connection timeout") ||
    message.includes("Cannot use a pool after calling end")
  );
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

export async function initDb(): Promise<void> {
  const mode = resolveDbMode();
  const schema = fs.readFileSync(resolveSchemaFile(mode), "utf8");

  if (mode === "postgres") {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      try {
        await resetPool();
        await getPool().query(schema);
        console.log("PostgreSQL database ready");
        return;
      } catch (error) {
        lastError = error;
        console.error(`PostgreSQL init attempt ${attempt}/10 failed:`, error);
        await resetPool();
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
  try {
    return await getPool().query<T>(text, params);
  } catch (error) {
    if (attempt < 2 && isPgConnectionError(error)) {
      await resetPool();
      await sleep(400 * (attempt + 1));
      return queryPostgres(text, params, attempt + 1);
    }
    throw error;
  }
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
