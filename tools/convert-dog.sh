#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-$HOME/Downloads/dog.zip}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/models"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$DEST"
unzip -q "$ZIP" -d "$TMP/zip"
GLB="$(find "$TMP/zip/source" -name '*.glb' | head -1)"
node "$(dirname "$0")/convert-dog.mjs" "$GLB" "$DEST/dog" "$TMP/albedo.png"
cwebp -quiet -q 85 -resize 1024 1024 "$TMP/albedo.png" -o "$DEST/dog_albedo.webp"
echo done
