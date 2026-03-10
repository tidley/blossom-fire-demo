#!/usr/bin/env bash
set -euo pipefail

# Build the Rust OpenMLS WASM bindings into web/pkg_mls using wasm-pack.
#
# Prefers local wasm-pack if present; otherwise uses the official docker image.
#
# Output is committed/served as static assets by the web container.

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT_DIR="$ROOT_DIR/web/pkg_mls"

mkdir -p "$OUT_DIR"

if command -v wasm-pack >/dev/null 2>&1; then
  echo "[build-mls] using local wasm-pack"
  (cd "$ROOT_DIR/mls-wasm" && wasm-pack build --release --target web --out-dir ../web/pkg_mls)
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[build-mls] error: wasm-pack not found and docker not available" >&2
  echo "Install wasm-pack (cargo install wasm-pack) or docker." >&2
  exit 1
fi

echo "[build-mls] using docker rustwasm/wasm-pack"
docker run --rm \
  -u "$(id -u):$(id -g)" \
  -v "$ROOT_DIR":/work \
  -w /work \
  rustwasm/wasm-pack:latest \
  wasm-pack build mls-wasm --release --target web --out-dir ../web/pkg_mls
