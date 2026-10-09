#!/usr/bin/env bash
# Screenshots every UI screen with headless Chromium. Needs node and playwright (global install is fine).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
exec node "$ROOT/tools/screenshot-ui.cjs" "$@"
