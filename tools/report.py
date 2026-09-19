#!/usr/bin/env python3
"""Summarise a harness run of tools/suite.js.

Usage:  python3 tools/report.py <outPrefix>-console.txt
Prints "<name>: N pass M fail" and one line per failure.
"""
import json
import os
import re
import sys

path = sys.argv[1]
name = os.path.basename(path).replace("-console.txt", "")
if not os.path.exists(path):
    print(f"{name}: NO FILE")
    raise SystemExit(1)
# The harness writes the scenario's answer to its own file. Prefer it: the
# console log is a log, and the reader used to pull the result out of it by
# taking everything between the `[SCENARIO]` marker and the next `[PERF]` line
# — which silently includes any console message that arrived in between.
side = path.replace("-console.txt", "-result.json")
if os.path.exists(side):
    r = json.load(open(side))
else:
    text = open(path).read()
    at = text.find("[SCENARIO] ")
    if at < 0:
        print(f"{name}: NO RESULTS (did the page load? see the log)")
        raise SystemExit(1)
    # Match brackets from the start of the value, so whatever follows it in the
    # log is whatever follows it in the log.
    start = at + len("[SCENARIO] ")
    depth, end, instr, esc = 0, -1, False, False
    for i in range(start, len(text)):
        c = text[i]
        if instr:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                instr = False
            continue
        if c == '"':
            instr = True
        elif c in "[{":
            depth += 1
        elif c in "]}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end < 0:
        print(f"{name}: TRUNCATED RESULTS (the run did not finish)")
        raise SystemExit(1)
    r = json.loads(text[start:end])
rows = r["out"] if isinstance(r, dict) and "out" in r else r
passed = sum(1 for x in rows if x["ok"])
failed = [x for x in rows if not x["ok"]]
print(f"{name}: {passed} pass {len(failed)} fail")
for x in failed:
    print("    FAIL", x["name"], "::", str(x.get("detail"))[:160])
raise SystemExit(1 if failed else 0)
