#!/usr/bin/env bash
# Render Chrome Web Store graphic assets from the HTML art-boards.
# Headless Chrome renders each board at 2x (supersampled), then Pillow
# downsizes to the exact store dimensions and strips alpha (24-bit RGB).
set -e
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DIR/src" OUT="$DIR/out" TMP="$DIR/.render"
# Windows Chrome needs a drive-letter file:// URL, not the Git-Bash /c/ form.
SRCURL="$(cygpath -m "$SRC")"
mkdir -p "$OUT" "$TMP"

render() { # name width height scale
  local name=$1 w=$2 h=$3 s=$4
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$TMP/profile" \
    --force-device-scale-factor="$s" --window-size="$w,$h" \
    --virtual-time-budget=12000 \
    --screenshot="$(cygpath -m "$TMP")/$name.png" "file:///$SRCURL/$name.html" 2>/dev/null
  echo "rendered $name @${s}x"
}

render icon          512 512  1
render tile-small    440 280  2
render tile-marquee 1400 560  2
render shot1-overview 1280 800 2
render shot2-import   1280 800 2
render shot3-graphql  1280 800 2
render shot4-schema   1280 800 2
render shot5-images   1280 800 2

python - <<'PY'
from PIL import Image
import os
DIR = os.path.dirname(os.path.abspath("store-assets/build.sh"))
TMP, OUT = "store-assets/.render", "store-assets/out"
jobs = [  # (rendered, final name, final size)
    ("icon.png",           "store-icon-128.png",    (128, 128)),
    ("tile-small.png",     "promo-small-440x280.png",   (440, 280)),
    ("tile-marquee.png",   "promo-marquee-1400x560.png",(1400, 560)),
    ("shot1-overview.png", "screenshot-1-overview-1280x800.png", (1280, 800)),
    ("shot2-import.png",   "screenshot-2-import-1280x800.png",   (1280, 800)),
    ("shot3-graphql.png",  "screenshot-3-graphql-1280x800.png",  (1280, 800)),
    ("shot4-schema.png",   "screenshot-4-schema-1280x800.png",   (1280, 800)),
    ("shot5-images.png",   "screenshot-5-images-1280x800.png",   (1280, 800)),
]
for src, dst, size in jobs:
    im = Image.open(os.path.join(TMP, src)).convert("RGB")  # 24-bit, no alpha
    if im.size != size:
        im = im.resize(size, Image.LANCZOS)
    im.save(os.path.join(OUT, dst), optimize=True)
    print(f"{dst}: {size[0]}x{size[1]} mode=RGB")
PY
echo "done -> $OUT"
