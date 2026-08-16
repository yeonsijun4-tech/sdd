import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabasePath, resolveSchemaPath } from "../lib/paths.js";

let db: DatabaseSync | null = null;

function initSchema(database: DatabaseSync) {
  const schema = fs.readFileSync(resolveSchemaPath(), "utf8");
  database.exec(schema);
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = resolveDatabasePath();
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
