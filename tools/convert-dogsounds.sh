#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/../public/dog"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/src/pack" "$WORK/src/growls" "$WORK/src/other" "$WORK/wav"

fetch() { curl -fsSL -A "Mozilla/5.0 (petro3d asset fetch)" -o "$2" "$1"; }

fetch https://opengameart.org/sites/default/files/dog.7z "$WORK/src/pack/dog.7z"
fetch https://opengameart.org/sites/default/files/archive_1.zip "$WORK/src/growls/growls.zip"
fetch https://opengameart.org/sites/default/files/dog-growl.ogg "$WORK/src/other/dog-growl.ogg"
fetch https://opengameart.org/sites/default/files/dog_barking_mono.wav "$WORK/src/other/dog_barking_mono.wav"
fetch https://opengameart.org/sites/default/files/80-CC0-creature-SFX_0.zip "$WORK/src/other/creature.zip"
fetch https://upload.wikimedia.org/wikipedia/commons/8/87/Wolf_howls.ogg "$WORK/src/other/wolf_howls.ogg"

bsdtar -xf "$WORK/src/pack/dog.7z" -C "$WORK/src/pack"
bsdtar -xf "$WORK/src/growls/growls.zip" -C "$WORK/src/growls"
bsdtar -xf "$WORK/src/other/creature.zip" -C "$WORK/src/other" barking_01.ogg barking_02.ogg

conv() { afconvert -f WAVE -d LEI16@32000 -c 1 "$1" "$WORK/wav/$2.wav"; }

for n in "Dog Bark 1" "Dog Bark 2" "Dog Bark 3" "Dog Bark" "Sad Dog" "Sad Dog 1"; do
  conv "$WORK/src/pack/Dog/$n.wav" "${n// /_}"
done
for i in 0 1 2 3 4 5; do conv "$WORK/src/growls/$i.ogg" "growl_$i"; done
conv "$WORK/src/other/dog-growl.ogg" dog-growl
conv "$WORK/src/other/dog_barking_mono.wav" dog_barking_mono
conv "$WORK/src/other/barking_01.ogg" barking_01
conv "$WORK/src/other/barking_02.ogg" barking_02
conv "$WORK/src/other/wolf_howls.ogg" wolf_howls

rm -rf "$DEST"
node "$HERE/cut-dogsounds.mjs" "$WORK/wav" "$DEST"
cat > "$DEST/CREDITS.md" <<'EOF'
# Dog sounds

Ten variants each of bark, growl, whine and howl, cut and normalised by `tools/convert-dogsounds.sh`. Some whines and growls are pitch-shifted copies of the originals.

- bark: "dog sounds" pack (CC0), https://opengameart.org/content/dog-sounds; "dog barking mono" (CC0 / OGA-BY 3.0), https://opengameart.org/content/dog-barking-mono; "80 CC0 creature SFX" by rubberduck (CC0), https://opengameart.org/content/80-cc0-creature-sfx
- growl: "dog growls" (CC-BY 3.0), https://opengameart.org/content/dog-growls, derived from "Dogs growling.wav" by juskiddink, https://freesound.org/people/juskiddink/sounds/121565/; "dog growl" (CC0), https://opengameart.org/content/dog-growl
- whine: "Sad Dog" clips from the "dog sounds" pack (CC0)
- howl: "Wolf howls.ogg" by the U.S. Fish and Wildlife Service (public domain), https://commons.wikimedia.org/wiki/File:Wolf_howls.ogg
EOF
echo done
