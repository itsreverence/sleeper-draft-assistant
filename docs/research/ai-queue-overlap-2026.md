# Controlled AI queue overlap probe

On Linux, compared master `5e1c1a3` with the priority-queue implementation using
`scripts/measure-ai-queue.mts`. Five alternating runs per side used the real
provider with a synthetic client: question turns wait 100 ms and strategy turns
wait 300 ms. The question under measurement arrives during an active question,
after an automatic strategy refresh has queued. All three operations complete;
the probe validates the answer, strategy schema, operation count and order.

Question wall time from enqueue to completed provider answer:

| Side | Median | Range | Order |
| --- | --- | --- | --- |
| Master FIFO | 502.96 ms | 501.43–503.87 ms | active question, refresh, measured question |
| Priority queue | 201.07 ms | 200.72–202.30 ms | active question, measured question, refresh |

Zero failed operations. Individual before samples (ms): 502.96, 501.43, 501.48,
503.87, 503.18. After: 201.70, 200.72, 200.92, 202.30, 201.07.
The approximately 302 ms difference is the excluded synthetic 300 ms refresh
wait. The remaining approximately 201 ms is the active question and measured
question. This verifies scheduling rather than a change in model service speed.
API preparation, HTTP/browser rendering, real Codex and Sleeper are excluded.
The machine had eight logical CPUs and load average 3.82/2.18/1.96 at inspection;
timer spread was much smaller than the excluded wait.

To reproduce the comparison from the repository root:

```bash
git show 5e1c1a3:apps/api/src/ai/codex-app-server-provider.ts > apps/api/src/ai/.queue-baseline.ts
npx tsx scripts/measure-ai-queue.mts apps/api/src/ai/.queue-baseline.ts
rm apps/api/src/ai/.queue-baseline.ts
```

Without the optional baseline path, both sides use the current implementation
and assert priority order. The earlier live research's 7.3–17.1 second FIFO waits
are background evidence, not a paired measurement of this implementation.
