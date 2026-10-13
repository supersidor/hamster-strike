#!/usr/bin/env bash
set -euo pipefail
ZIP="${1:-$HOME/Downloads/ak-47-assault-rifle.zip}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/weapons"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

unzip -q "$ZIP" -d "$TMP/outer"
unzip -q "$TMP/outer/source/ak47.zip" -d "$TMP/src"
node "$(dirname "$0")/convert-gun.mjs" "$TMP/src/ak47/ak47.obj" "$DEST/ak47" AK47

TEX="$TMP/outer/textures"
cwebp -quiet -q 85 -resize 2048 2048 "$TEX/ak47_Albedo.png" -o "$DEST/ak47_albedo.webp"
cwebp -quiet -q 92 -resize 2048 2048 "$TEX/ak47_Normal.png" -o "$DEST/ak47_normal.webp"
for t in AO Roughness Metallic; do
  lower="$(echo "$t" | tr '[:upper:]' '[:lower:]')"
  cwebp -quiet -q 85 -resize 1024 1024 "$TEX/ak47_$t.png" -o "$DEST/ak47_$lower.webp"
done
echo done
