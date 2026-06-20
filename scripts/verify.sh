#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"
docker compose down --remove-orphans

cd "$ROOT_DIR/server"
python3 -m pip install -e .
python3 -m pytest

cd "$ROOT_DIR/client"
npm install
npx playwright install chromium
npm run typecheck
npm run build
npm run test:e2e

echo "Full verification passed."
