#!/bin/sh
# Run the regression suite over every level and print one line each.
set -e
out=${OUT:-/tmp/out}
for id in "$@"; do
  TT_URL="http://localhost:5177/?level=$id" TT_TIER=${TIER:-low} \
    node tools/shot.mjs "$out/$id" tools/suite.js > "$out/$id-run.log" 2>&1 || true
  printf '%-12s ' "$id"
  python3 tools/report.py "$out/$id-console.txt" 2>/dev/null | tail -1 || echo "NO REPORT"
done
