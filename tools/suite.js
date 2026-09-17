// The regression suite, as a harness scenario: runs every test the in-game
// TEST panel runs and returns the results for `tools/report.py`.
//   TT_URL='http://localhost:5177/?level=westminster' TT_TIER=low \
//     node tools/shot.mjs /tmp/out/w-low tools/suite.js
(() => window.__runTests())()
