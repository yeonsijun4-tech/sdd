import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let db: DatabaseSync | null = null;

function resolveSchemaPath(): string {
  if (process.env.SCHEMA_PATH) return process.env.SCHEMA_PATH;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(process.cwd(), "schema.sql"),
    path.join(moduleDir, "..", "schema.sql"),
    path.join(moduleDir, "..", "..", "schema.sql"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("schema.sql file not found");
}

function initSchema(database: DatabaseSync) {
  const schema = fs.readFileSync(resolveSchemaPath(), "utf8");
  database.exec(schema);
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "game.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  initSchema(db);

  return db;
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable is required");
    }
    return "local-dev-secret-change-me";
  }
  return secret;
}
