# Performance: type and memory vs Ink & Memory

Same ruler for both (`scripts/perf.mjs`): headless Chromium on one machine, arms alternating, three rounds each, medians below.
Ink & Memory is its frontend at `ab8d83e` built unmodified, with its backend answered by stubs in the browser. Each page holds
the stated amount of Chinese prose in 120-character paragraphs with eight notes; the script then types 57 characters at the end.

| page | | load to editable | main thread per keystroke | script per keystroke | keydown to next frame, p50 / p95 | JS heap |
|---|---|---|---|---|---|---|
| 0 chars | Ink & Memory | 237 ms | 15.9 ms | 9.56 ms | 11 / 19 ms | 4.9 MB |
| 0 chars | type and memory | 107 ms | 2.5 ms | 0.36 ms | 3 / 17 ms | 3.0 MB |
| 5,020 chars | Ink & Memory | 322 ms | 41.7 ms | 26.97 ms | 26 / 35 ms | 5.1 MB |
| 5,020 chars | type and memory | 189 ms | 3.6 ms | 0.60 ms | 4 / 19 ms | 3.4 MB |
| 50,069 chars | Ink & Memory | 472 ms | 197.5 ms | 163.34 ms | 147 / 208 ms | 11.5 MB |
| 50,069 chars | type and memory | 206 ms | 4.6 ms | 0.63 ms | 6 / 18 ms | 4.0 MB |
| 500,095 chars | Ink & Memory | 2539 ms | 1814.9 ms | 1718.66 ms | 3222 / 4684 ms | 12.3 MB |
| 500,095 chars | type and memory | 370 ms | 15.8 ms | 0.71 ms | 16 / 29 ms | 5.8 MB |

JavaScript shipped: Ink & Memory 461.5 kB (136.8 kB gzip); type and memory standalone page 44 kB (about 15 kB gzip, a third of it the five persona prompts), the embeddable library 20.6 kB (about 8 kB gzip).

What the numbers say:

- An empty page: about 6x less main-thread work per keystroke, and it is editable in under half the time.
- Ink & Memory's cost per keystroke grows with the page (16 → 42 → 198 → 1,811 ms): every keystroke re-renders the React tree,
  measures the whole text character by character on a canvas to place comments, and pushes a full copy of the text onto an array.
  At 500,000 characters one keystroke takes about three seconds to reach the screen.
- type and memory stays near flat to 50,000 characters (2.5 → 4.6 ms). At 500,000 it is 16 ms, of which script is 0.7 ms and layout 2 ms;
  the rest is the browser's own work for an edit inside a contenteditable with 4,000 children (measured: turning content-visibility
  off makes it 23 ms; hiding the margin or changing the scroller does not move it). Not investigated further.
- The p95 frame figures near 17–19 ms for the new page are one 60 Hz frame: the keystroke waited for the next vsync.

Raw rounds: `raw.jsonl`. Reproduce: build both, serve them (see the top of `scripts/perf.mjs`), run `scripts/perf-matrix.sh`.
