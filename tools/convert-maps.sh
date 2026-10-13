#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for src in "$ROOT"/mapsrc/*/; do
  dir="$(jq -r .dir "$src/map.json")"
  file="$(jq -r .file "$src/map.json")"
  rm -rf "$ROOT/public/maps/$dir"
  mkdir -p "$ROOT/public/maps/$dir"
  for f in "$src"/textures/*.png; do
    cwebp -quiet -q 85 "$f" -o "$ROOT/public/maps/$dir/$(basename "${f%.png}").webp"
  done
  node "$ROOT/tools/convert-map.mjs" "$src" "$ROOT/src/maps/$file" "$@"
done
