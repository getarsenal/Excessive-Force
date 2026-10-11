#!/bin/sh
# Par against play, over several levels: tools/parprobe.mjs with the full
# arsenal and the garrison silent, stopped at the win mark, once laying on the
# survey's red stone and once undercutting a face, two browsers at a time.
# One JSON line per run in $OUT/par.jsonl, the printed report beside it.
#   TT_PORT=5178 OUT=/tmp/par sh tools/parsweep.sh westminster paris ...
out=${OUT:-/tmp/par}
mkdir -p "$out"
if [ "$1" = "--one" ]; then
  HOW=full QUIET=1 STOPDOWN=1 AIMBY=$3 LIMIT=${LIMIT:-20} node tools/parprobe.mjs "$2" "${TT_PORT:-5178}" > "$out/$2-$3.txt" 2>&1
  grep '^JSON ' "$out/$2-$3.txt" | sed 's/^JSON //' >> "$out/par.jsonl"
  echo "$2 $3: $(grep 'bar past' "$out/$2-$3.txt")"
  exit 0
fi
for lv in "$@"; do for aim in survey face; do echo "$lv $aim"; done; done | xargs -P "${JOBS:-2}" -n 2 sh "$0" --one
