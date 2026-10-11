# Par against play, 11 October 2026

`tools/parsweep.sh` over the original sixteen: `tools/parprobe.mjs` with the full arsenal the campaign hands over by each landmark (a challenge link's `c`), opened along the bar, the garrison silent, stopped at the win mark (90% of the bar), once laying on the survey's red stone and once undercutting a face. The best of the two by rounds is shown. The defenders' hunt is not counted.

| Landmark | Win mark at | Rounds | Spend | Leverage | Par rounds | Par spend | Par minutes | Rounds vs par |
|---|---|---|---|---|---|---|---|---|
| westminster | 10:49 | 832 | $16,170 | 33.46 | 45 | $4,200 | 3 | 18.5× |
| paris | 5:02 | 443 | $32,215 | 111.37 | 40 | $6,000 | 3 | 11.1× |
| agra | not in 20 min | | | | 140 | $8,000 | 6 | |
| giza | not in 20 min | | | | 600 | $12,000 | 20 | |
| chichen | not in 20 min | | | | 70 | $8,000 | 4 | |
| pisa | not in 20 min | | | | 35 | $6,000 | 3 | |
| sydney | not in 20 min | | | | 90 | $12,000 | 5 | |
| moscow | 16:29 | 1524 | $35,570 | 19.8 | 120 | $14,000 | 6 | 12.7× |
| rio | not in 20 min | | | | 55 | $11,000 | 4 | |
| athens | 7:28 | 551 | $523,159 | 1.8 | 70 | $10,000 | 4 | 7.9× |
| istanbul | 7:11 | 491 | $422,135 | 2.06 | 150 | $18,000 | 7 | 3.3× |
| cologne | 8:18 | 534 | $554,426 | 2.37 | 100 | $16,000 | 5 | 5.3× |
| himeji | not in 20 min | | | | 60 | $14,000 | 4 | |
| petronas | 5:45 | 690 | $326,377 | 4.59 | 110 | $24,000 | 6 | 6.3× |
| dubai | 1:44 | 119 | $110,000 | 3602.36 | 70 | $26,000 | 5 | 1.7× |
| potala | 12:59 | 985 | $531,090 | 1.34 | 190 | $34,000 | 9 | 5.2× |

## What it says, and what it does not

- Wherever the bot reached the win mark it fired between 1.7 and 18.5 times par's rounds. Par's rounds come from a perfect gun undercutting one face (see the note in `levels.js`), and nothing in this run came close to that.
- The bot is not a good player. It buys the heaviest unit the money covers and calls the heaviest strike it can afford, so its spend balloons once income piles up (half a million dollars at Athens, Cologne and Potala). On the other eight landmarks it never reached the win mark in twenty minutes; at Agra and Giza its opening rocket teams barely moved the bar (under 1%), so the guns those levels open along the bar never opened for it.
- So par was not changed. Two things would make this the basis for tuning: a bot that buys for value and holds money back, and real results from players (the end card already keeps each player's best rounds, spend and time).

Raw runs: `par-2026-10-11.jsonl`, one line per run.
