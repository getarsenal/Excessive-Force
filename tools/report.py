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
text = open(path).read()
m = re.search(r"\[SCENARIO\] (.*?)\n\[PERF\]", text, re.S)
if not m:
    print(f"{name}: NO RESULTS (did the page load? see the log)")
    raise SystemExit(1)
r = json.loads(m.group(1))
rows = r["out"] if isinstance(r, dict) and "out" in r else r
passed = sum(1 for x in rows if x["ok"])
failed = [x for x in rows if not x["ok"]]
print(f"{name}: {passed} pass {len(failed)} fail")
for x in failed:
    print("    FAIL", x["name"], "::", str(x.get("detail"))[:160])
raise SystemExit(1 if failed else 0)
