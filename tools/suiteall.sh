#!/bin/sh
# Run the regression suite over several levels and print one line each.
#
# In parallel, because the box has four cores and the suite is nine
# independent browsers against one static dev server. Serially a nine-level
# pass is twenty-one minutes, and that is the single biggest cost of changing
# anything in this repo: every fix is paid for twice, once to find it and once
# to prove the other eight levels still stand.
#
# A worker pool rather than batches of three. Batching waits for the slowest
# level in each batch before starting the next, and the levels are not the same
# size — Chichen Itza is sixty-eight seconds and Pisa is two hundred and fifty —
# so a third of the machine sits idle waiting for Pisa.
#
#   sh tools/suiteall.sh westminster paris ...      all nine
#   JOBS=1 sh tools/suiteall.sh westminster         one at a time, for a timing
#   TIER=high sh tools/suiteall.sh pisa
out=${OUT:-/tmp/out}
jobs=${JOBS:-3}
mkdir -p "$out"

# Self-dispatch: `--one` is a single level, which is what the pool calls.
if [ "$1" = "--one" ]; then
  TT_URL="http://localhost:5177/?level=$2" TT_TIER=${TIER:-low} TT_SUITE=1 \
    node tools/shot.mjs "$out/$2" tools/suite.js > "$out/$2-run.log" 2>&1 || true
  exit 0
fi

rm -f "$out"/*-result.json 2>/dev/null || true
printf '%s\n' "$@" | OUT="$out" TIER="${TIER:-low}" xargs -P "$jobs" -I{} \
  sh tools/suiteall.sh --one {}

# Reported in the order asked for, whatever order they finished in.
fail=0
for id in "$@"; do
  printf '%-12s ' "$id"
  python3 tools/report.py "$out/$id-console.txt" 2>/dev/null | tail -3 || fail=1
done
exit $fail
