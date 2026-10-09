#!/usr/bin/env bash
# Build wasm/lighter-signer.wasm and wasm/wasm_exec.js from lighter-go source
# with the toolchain pinned in signer-wasm.Dockerfile, then regenerate
# src/signers/generated/wasmExecRuntime.ts.
#
# Usage: scripts/build-signer-wasm.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
DOCKERFILE="$SCRIPT_DIR/signer-wasm.Dockerfile"
WASM_DIR="$PACKAGE_DIR/wasm"

command -v docker >/dev/null || { echo "docker not found" >&2; exit 1; }

OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT

docker build --file "$DOCKERFILE" --target artifact \
  --output "type=local,dest=$OUT_DIR" "$SCRIPT_DIR"

cp "$OUT_DIR/lighter-signer.wasm" "$OUT_DIR/wasm_exec.js" "$WASM_DIR/"
node "$SCRIPT_DIR/generate-wasm-exec.mjs"

COMMIT="$(sed -n 's/^ARG LIGHTER_GO_COMMIT=//p' "$DOCKERFILE")"
TOOLCHAIN="$(sed -n 's/^FROM \(golang:[^ ]*\).*/\1/p' "$DOCKERFILE")"
echo "lighter-go commit: $COMMIT"
echo "toolchain: $TOOLCHAIN"
cd "$WASM_DIR" && sha256sum lighter-signer.wasm wasm_exec.js
