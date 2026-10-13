#!/usr/bin/env bash
set -euo pipefail
SRC="${1:-$HOME/projects/petro3d}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public"
rm -rf "$DEST/hamsters" "$DEST/sounds"
mkdir -p "$DEST/../src/maps" "$DEST/hamsters" "$DEST/sounds" "$DEST/weapons" "$DEST/../src/maps"

for f in "$SRC"/assets/hamsters/*.png; do
  cwebp -quiet -q 80 -alpha_q 90 "$f" -o "$DEST/hamsters/$(basename "${f%.png}").webp"
done
ls "$DEST/hamsters" | grep webp | sed 's/\.webp$//' | jq -R . | jq -s . > "$DEST/hamsters/index.json"
node "$(dirname "$0")/hamster-rects.mjs" "$SRC/assets/hamsters" "$DEST/hamsters/rects.json"
cp "$SRC/assets/hamsters/CREDITS.md" "$DEST/hamsters/CREDITS.md"
for n in hamster petro; do
  cwebp -quiet -q 85 -alpha_q 90 "$SRC/assets/$n.png" -o "$DEST/$n.webp"
done

for f in "$SRC"/assets/sounds/*.wav "$SRC"/assets/sounds/cs/*.wav; do
  afconvert -f WAVE -d LEI16@32000 -c 1 "$f" "$DEST/sounds/$(basename "$f")"
done
ls "$DEST/sounds" | grep -v index.json | sed 's/\.wav$//' | sort | jq -R . | jq -s . > "$DEST/sounds/index.json"

cp "$SRC/assets/weapons/ImphenziaPalette01-256-Gradient.png" "$DEST/weapons/palette.png"
cp "$SRC/assets/weapons/ammo_canister.glb" "$DEST/weapons/ammo_canister.glb"
cp "$SRC/assets/weapons/CREDITS.md" "$DEST/weapons/CREDITS.md"
node "$(dirname "$0")/extract-weapons.mjs" "$SRC/assets/weapons/Weapons.fbx" "$DEST/weapons/weapons.json"
cp "$SRC"/maps/*.txt "$DEST/../src/maps/"
echo done
