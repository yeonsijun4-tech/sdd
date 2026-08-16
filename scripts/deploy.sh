#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building frontend and worker"
npm run build

echo "==> Deploying to Cloudflare"
npm run deploy --workspace=worker

echo "==> Done. Open your Worker custom domain in the Cloudflare dashboard if not already connected."
