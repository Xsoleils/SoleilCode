# SoleilBench

SoleilBench is SoleilCode's small, reproducible agent harness. It tests whether the
agent can inspect a workspace, make a correct edit, run a focused command, and verify
a browser interaction. Every case runs in a fresh temporary project and is checked by
code outside the model.

It is an integration benchmark, not a general intelligence score. Results can vary
with provider availability, free-tier rate limits, routing, network latency, and model
updates.

## Latest verified snapshot

Recorded on 2026-07-27 with SoleilCode 0.5.0:

| Environment | Value |
| --- | --- |
| Operating system | Windows 10.0.26200.8875 |
| Node.js | 24.14.1 |
| Suite | `core` |
| Repetitions | 1 |
| Routes | Configured free cloud routes |
| Result | **3/3 passed (100%)** |
| Total wall time | 85.46 s |
| Reported model tokens | 23,847 |

| Case | Result | Time | Tokens | Repairs | Verified outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `create-file` | Pass | 13.06 s | 8,207 | 0 | Exact file contents matched |
| `repair-code` | Pass | 44.21 s | 9,364 | 1 | `add(2, 3)` returned `5` |
| `browser-runtime` | Pass | 28.16 s | 6,276 | 0 | Keyboard interaction changed the count with no runtime errors |

The run used the OpenRouter free router plus free Gemini, Qwen, and GPT-OSS routes.
Several model selections can appear in one case because SoleilRelay retries and falls
back when a route is unavailable or returns an unusable tool response. Provider
account identifiers are deliberately removed from the public report.

The machine-readable, sanitized result is available in
[`benchmarks/2026-07-27-windows-core.json`](benchmarks/2026-07-27-windows-core.json).
A single run is a smoke signal, not a statistically meaningful comparison.

## Reproduce it

Use a local Ollama model or connect only provider tokens that you own:

```bash
npm ci
npm run build
node bin/soleil.js doctor
node bin/soleil.js bench --suite core --runs 3 --json
```

The published npm package can be tested without cloning:

```bash
npx --yes --package soleilcode@0.5.0 soleil bench --suite core --runs 3 --json
```

Benchmarks consume the quota of the configured routes. No paid model is selected by
SoleilCode.

## Cases and scoring

- `create-file` requires exact contents and a trailing newline.
- `repair-code` imports the changed JavaScript and executes the repaired function.
- `browser-runtime` launches an installed Chromium-family browser, sends keyboard
  input, checks the visible state, and fails on console or page errors.
- A case passes only when its independent verifier succeeds. A convincing model
  answer alone receives no credit.

For comparisons, use the same SoleilCode version, suite, run count, mode, machine,
browser, and route set. Report pass rate first, then latency, token use, protocol
repairs, and any provider failures.
