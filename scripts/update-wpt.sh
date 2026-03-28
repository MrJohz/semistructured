#!/usr/bin/env bash
# Downloads the WPT (Web Platform Tests) fixtures for dom/abort tests.
# Run this script manually when you want to update the vendored WPT files.
# CI should never need to run this — the fixtures are committed to the repo.

set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$ROOT_DIR/test/wpt/fixtures"
PATCHES_DIR="$ROOT_DIR/test/wpt/patches"

# wpt.live serves the latest WPT files over HTTPS.
RAW_BASE="https://raw.githubusercontent.com/web-platform-tests/wpt/refs/heads/master"

echo "Downloading WPT fixtures from GitHub.com..."
echo ""

# Create directories
mkdir -p "$FIXTURES_DIR/dom/abort/resources"

# Download dom/abort test files
FILES=(
  "dom/abort/event.any.js"
  "dom/abort/AbortSignal.any.js"
  "dom/abort/abort-signal-any.any.js"
  "dom/abort/timeout.any.js"
  "dom/abort/resources/abort-signal-any-tests.js"
)

for file in "${FILES[@]}"; do
  echo "Fetching $file..."
  curl -sS -f "$RAW_BASE/$file" -o "$FIXTURES_DIR/$file"
done

if [ -d "$PATCHES_DIR" ] && [ -n "$(ls -A $PATCHES_DIR)" ]; then
  echo ""
  echo "Applying patches..."
  echo ""
  
  for patch in "$PATCHES_DIR/"*.patch; do
    echo "Applying patch $(basename "$patch")..."
    patch -p4 -d "$FIXTURES_DIR" < "$patch"
  done
fi


echo ""
echo "Done. Files written to test/wpt/fixtures/"
echo ""
echo "Files downloaded:"
find "$FIXTURES_DIR" -type f | sort | while read -r f; do
  echo "  ${f#$ROOT_DIR/}"
done
