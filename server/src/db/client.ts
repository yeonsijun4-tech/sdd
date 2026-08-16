import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabasePath, resolveSchemaPath } from "../lib/paths.js";

let db: DatabaseSync | null = null;
let runtimeJwtSecret: string | null = null;

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
