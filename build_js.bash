#!/usr/bin/env bash
# build_js.bash – concatenate the split DebugOTool.* source files
# into the single tools/DebugOTool.js used by the app + staging server.
#
# Run from /root/debugbrowser-apk (or anywhere – script cd's to its own dir).
# Usage:  ./build_js.bash
# Output: tools/DebugOTool.js  (single file, ~70 KB)
#
# Load order is CRITICAL. core must be first (defines window.DT),
# panel must be last (calls DT.buildGoldBar / buildPanel / initPanel at tail).
# ui.bars must precede panel (defines the DOM builders panel's START block calls).

set -euo pipefail

# --- Resolve repo root regardless of caller's cwd ---
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

TOOLS_DIR="tools"
OUT="$TOOLS_DIR/DebugOTool.js"

# --- Ordered list of source files. DO NOT reorder without updating load-order docs. ---
ORDER=(
  "DebugOTool.core.js"
  "DebugOTool.ui.bars.js"
  "DebugOTool.tabs.console-network.js"
  "DebugOTool.tabs.elements.js"
  "DebugOTool.tabs.storage.js"
  "DebugOTool.tabs.files.js"
  "DebugOTool.tabs.sworkers-perf.js"
  "DebugOTool.actions.js"
  "DebugOTool.panel.js"
)

# --- Verify every file exists before touching the output ---
MISSING=0
for f in "${ORDER[@]}"; do
  if [[ ! -f "$TOOLS_DIR/$f" ]]; then
    echo "❌ missing source: $TOOLS_DIR/$f" >&2
    MISSING=1
  fi
done
if [[ $MISSING -ne 0 ]]; then
  echo "" >&2
  echo "Aborting – no output written. Create the missing files first." >&2
  exit 1
fi

# --- Back up previous output if it exists ---
if [[ -f "$OUT" ]]; then
  BACKUP="$OUT.bak.$(date +%s)"
  cp -p "$OUT" "$BACKUP"
  echo "📦 backed up previous bundle → $BACKUP"
fi

# --- Concatenate ---
: > "$OUT"
for f in "${ORDER[@]}"; do
  {
    echo ""
    echo "// ============================================================"
    echo "// BEGIN $f"
    echo "// ============================================================"
    cat "$TOOLS_DIR/$f"
    echo ""
    echo "// ============================================================"
    echo "// END $f"
    echo "// ============================================================"
    echo ""
  } >> "$OUT"
  printf "  + %-45s (%s lines)\n" "$f" "$(wc -l < "$TOOLS_DIR/$f")"
done

# --- Report ---
SIZE=$(wc -c < "$OUT")
LINES=$(wc -l < "$OUT")
MD5=$(md5sum "$OUT" | awk '{print $1}')

echo ""
echo "✅ bundled → $OUT"
echo "   size : $SIZE bytes"
echo "   lines: $LINES"
echo "   md5  : $MD5"
echo ""
echo "Sanity tips:"
echo "  • node --check $OUT          # if node is installed"
echo "  • grep -c 'window.DT' $OUT    # should be ≥ 1 (core defines it)"
echo "  • grep -c 'classNameOf' $OUT  # should be ≥ 3 (core def + element usage + comment)"
echo ""