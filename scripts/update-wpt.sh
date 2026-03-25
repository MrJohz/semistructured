#!/usr/bin/env bash
# Downloads the WPT (Web Platform Tests) fixtures for dom/abort tests.
# Run this script manually when you want to update the vendored WPT files.
# CI should never need to run this — the fixtures are committed to the repo.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_DIR="$ROOT_DIR/test/wpt/fixtures"

# wpt.live serves the latest WPT files over HTTPS.
RAW_BASE="https://wpt.live"

echo "Downloading WPT fixtures from wpt.live..."
echo ""

# Create directories
mkdir -p "$FIXTURES_DIR/dom/abort/resources"
mkdir -p "$FIXTURES_DIR/resources"

# Download the testharness
echo "Fetching resources/testharness.js..."
curl -sS -f "$RAW_BASE/resources/testharness.js" -o "$FIXTURES_DIR/resources/testharness.js"

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

echo ""
echo "Done. Files written to test/wpt/fixtures/"
echo ""
echo "Files downloaded:"
find "$FIXTURES_DIR" -type f | sort | while read -r f; do
  echo "  ${f#$ROOT_DIR/}"
done
