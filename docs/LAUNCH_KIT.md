# SoleilCode launch kit

This page contains ready-to-use English copy and the assets needed to introduce
SoleilCode without overstating what the project can do.

## Positioning

**One line:** SoleilCode is a free-first, local-first coding agent that works in your
terminal and routes each task across free cloud models or local Ollama models.

**Short pitch:** It inspects real projects, edits files with approval, runs focused
commands, verifies browser apps, keeps recoverable checkpoints, and never
automatically falls back to a paid model.

**Links:**

- Repository: <https://github.com/Xsoleils/SoleilCode>
- npm: <https://www.npmjs.com/package/soleilcode>
- Release: <https://github.com/Xsoleils/SoleilCode/releases/tag/v0.5.0>
- Benchmark: <https://github.com/Xsoleils/SoleilCode/blob/main/docs/BENCHMARKS.md>

**Assets:**

- `docs/assets/soleilcode-social-preview.png` — 1280×640 social card
- `docs/assets/soleilcode-demo.gif` — terminal workflow demo

## Show HN

**Title**

> Show HN: SoleilCode – a free-first, local-first coding agent for the terminal

**Body**

> I built SoleilCode, an MIT-licensed terminal coding agent that is not tied to one
> model or a paid subscription. SoleilRelay chooses between configured free cloud
> routes and local Ollama models based on the task, availability, latency, and past
> success.
>
> It can inspect a project, edit files with approval, run focused commands, verify web
> apps in a real Chromium-family browser, and restore file checkpoints. The interface
> ships in ten languages. There is also a headless JSON mode and a small reproducible
> benchmark whose checks run outside the model.
>
> This is an early pre-1.0 project, so I would especially value feedback on routing,
> safety boundaries, and the terminal workflow.
>
> GitHub: https://github.com/Xsoleils/SoleilCode
>
> Install: `npm install -g soleilcode`

## Reddit / LocalLLaMA

**Title**

> I made an open-source coding agent that routes tasks across free APIs and local Ollama models

**Body**

> SoleilCode is a free-first terminal coding agent built around a small router called
> SoleilRelay. It can switch routes by task and fall back when a provider is
> rate-limited, while rejecting paid model definitions.
>
> The current release includes real workspace tools, approval before writes and
> commands, browser verification, undoable file checkpoints, ten UI languages,
> headless JSON runs, and an integration benchmark.
>
> I am looking for honest feedback from people who use local or free-tier models:
> which Ollama models and routing signals should I test next?
>
> Repo: https://github.com/Xsoleils/SoleilCode

## X / Bluesky

> I built SoleilCode ☀ — an open-source, free-first coding agent for your terminal.
>
> ✓ free cloud + local Ollama routing  
> ✓ real file, command, diff, and browser tools  
> ✓ approvals + recoverable checkpoints  
> ✓ 10 interface languages  
> ✓ npm install -g soleilcode
>
> https://github.com/Xsoleils/SoleilCode

## LinkedIn

> I have released SoleilCode 0.5, an MIT-licensed coding agent for the terminal.
>
> Its routing layer, SoleilRelay, selects between free cloud routes and local Ollama
> models based on the task and live route health. The agent works on real project
> files, asks before mutations by default, runs focused verification, can test web
> interactions in a local browser, and keeps file checkpoints for undo.
>
> I also published the benchmark method and a sanitized result so the claims are
> inspectable instead of relying on a polished demo alone.
>
> Feedback and focused contributions are welcome:
> https://github.com/Xsoleils/SoleilCode

## Product Hunt

**Tagline**

> A free-first, local-first coding agent for your terminal

**Description**

> Route coding tasks across free providers and local Ollama models, edit real projects
> with explicit approval, verify the result, and undo file changes.

## Suggested launch order

1. Confirm the GitHub social preview, topics, README demo, release, and npm install.
2. Publish the Show HN post and stay available for technical questions.
3. Share a community-specific version on LocalLLaMA; ask for model-routing feedback.
4. Post the short visual version on X or Bluesky.
5. Share a more reflective build story on LinkedIn or a developer blog.

Avoid posting identical copy everywhere at once. Answer early questions with concrete
examples, disclose the pre-1.0 status, and never describe free-provider quotas as
guaranteed.
