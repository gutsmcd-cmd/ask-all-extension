#!/usr/bin/env bash
# Builds the Firefox version (desktop + Android) from the same files as the Chrome one.
#   bash tools/build-firefox.sh [output.xpi]
# Result: dist/firefox/ (unpacked, for `web-ext run` / `web-ext lint`) and an
# UNSIGNED .xpi (default dist/ask-all-firefox-<version>.xpi). Firefox release only
# installs it after Mozilla has signed it (see README, "Firefox / Android").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist/firefox"
VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$ROOT/firefox/manifest.json")"
XPI="${1:-$ROOT/dist/ask-all-firefox-$VERSION.xpi}"
FILES=(compat.js sites.js runner.js background.js content.js hub.html hub.js hub.css settings.html settings.js LICENSE icons/icon.svg)

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/icons"
for f in "${FILES[@]}"; do cp "$ROOT/$f" "$OUT_DIR/$f"; done
cp "$ROOT/firefox/manifest.json" "$OUT_DIR/manifest.json"

mkdir -p "$(dirname "$XPI")"
XPI="$(cd "$(dirname "$XPI")" && pwd)/$(basename "$XPI")"
rm -f "$XPI"
if command -v zip >/dev/null 2>&1; then
  (cd "$OUT_DIR" && zip -q -X -r "$XPI" manifest.json "${FILES[@]}")
else
  (cd "$OUT_DIR" && python3 -c 'import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for f in sys.argv[2:]: z.write(f, f)' "$XPI" manifest.json "${FILES[@]}")
fi
echo "Built $OUT_DIR"
echo "Built $XPI (unsigned, version $VERSION)"
