import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function uniquePaths(candidates: string[]): string[] {
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

export function getServerRoots(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.join(moduleDir, "..");
  const serverDir = path.join(distDir, "..");
  const repoRoot = path.join(serverDir, "..");

  return uniquePaths([process.cwd(), serverDir, repoRoot, distDir]);
}

export function resolvePublicDir(): string {
  if (process.env.PUBLIC_DIR) {
    const explicit = path.resolve(process.env.PUBLIC_DIR);
    if (fs.existsSync(path.join(explicit, "index.html"))) {
      return explicit;
    }
  }

  const candidates = getServerRoots().flatMap((root) => [
    path.join(root, "frontend", "dist"),
    path.join(root, "public"),
    path.join(root, "server", "public"),
  ]);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }

  throw new Error("Frontend build not found. Run npm run build --workspace=frontend");
}

export function resolveSchemaPath(): string {
  if (process.env.SCHEMA_PATH) {
    return path.resolve(process.env.SCHEMA_PATH);
  }

  const candidates = getServerRoots().flatMap((root) => [
    path.join(root, "schema.sql"),
    path.join(root, "server", "schema.sql"),
    path.join(root, "dist", "schema.sql"),
    path.join(root, "server", "dist", "schema.sql"),
  ]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("schema.sql file not found");
}

export function resolveSqliteSchemaPath(): string {
  if (process.env.SQLITE_SCHEMA_PATH) {
    return path.resolve(process.env.SQLITE_SCHEMA_PATH);
  }

  const candidates = getServerRoots().flatMap((root) => [
    path.join(root, "schema.sqlite.sql"),
    path.join(root, "server", "schema.sqlite.sql"),
    path.join(root, "dist", "schema.sqlite.sql"),
    path.join(root, "server", "dist", "schema.sqlite.sql"),
  ]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("schema.sqlite.sql file not found");
}

export function resolveDatabasePath(): string {
  if (process.env.DATABASE_PATH) {
    return path.resolve(process.env.DATABASE_PATH);
  }

  const candidates = getServerRoots().map((root) => path.join(root, "data", "game.db"));

  return candidates[0] ?? path.join(process.cwd(), "data", "game.db");
}
