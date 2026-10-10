#!/usr/bin/env bash
# Builds the Thai owner manual PDF. Needs node and playwright (global install is fine) and a prior tools/screenshot-ui.sh run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
exec node "$ROOT/tools/build-manual.cjs" "$@"
