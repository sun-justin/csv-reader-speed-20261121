# csv-reader-speed-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sun-justin/csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sun-justin/csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: `solve.js` answers exactly as csv-reader does on every case — same `{columns, rows, errors}` for every broken-CSV edge case (BOM, CRLF, stray CR, quoted fields, doubled quotes, quote junk, unterminated quotes, short/long rows) — at about half the CPU time of the house baseline end to end (~2× faster; `run()` alone ~3–5× faster on the practice set, 6/6 cases identical, plus 25,215 differential tests against the reference with zero mismatches).

How it is faster: instead of walking the text one character at a time, it jumps from delimiter to delimiter with `String.indexOf` and takes each field out with `String.slice`, only ever looking for a `\r` inside the short slice already in hand. Quoted fields jump to the next quote the same way, and only a segment that actually holds a CR or LF pays for newline normalisation.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). Node 22 or later, no dependencies, no install step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1z18vzyj&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
