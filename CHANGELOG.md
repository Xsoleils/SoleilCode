# Changelog

All notable changes to SoleilCode are documented here.

## [0.5.0] - 2026-07-27

### Added

- Provider-native function calling for OpenAI-compatible routes, Gemini, and
  supported Ollama models, with the existing JSON protocol retained as fallback.
- `soleil run "TASK" --yes --json` and `--prompt-file` for headless automation.
- `soleil bench` with isolated `smoke` and `core` suites, repetitions, JSON output,
  latency, token, tool, route, and protocol-repair metrics.
- Local file checkpoints for approved writes and replacements, plus `/checkpoints`
  and `/undo`.
- A real-browser `browser_test` tool using an installed Edge, Chrome, or Chromium
  executable, keyboard interaction, runtime error capture, and screenshots.
- End-to-end coverage for native tools, headless runs, benchmark reporting,
  checkpoint restoration, and real browser interaction.

### Security

- Browser verification blocks external requests, service workers, internal
  `.git`/`.soleil` paths, environment files, and private-key formats.
- Checkpoint restore validates every target before changing any file.
- Headless mutations remain denied unless approval is explicitly configured or
  `--yes` is supplied.

### Changed

- Version bumped to 0.5.0.
- Provider tool incompatibility automatically falls back to the text protocol.
- README and help now document automation, benchmarks, browser checks, and undo.

## [0.4.0] - 2026-07-27

### Added

- Automatic project snapshots before edit, debug, review, test, and long-context tasks.
- Recovery for open-weight models that emit `<think>` blocks or flattened tool calls.
- Automatic correction prompts for malformed and truncated tool JSON.
- Mandatory workspace tools for project tasks and mandatory successful file writes for edit tasks.
- Exact absolute file paths appended to final answers when the model omits them.
- Larger task-aware output budgets for coding, review, debugging, and test work.
- End-to-end coverage for a truncated snake-game response and nested project creation.

### Changed

- Requests such as “prepare/build me a game” are classified as coding tasks.
- SoleilCode no longer treats malformed tool output as a normal chat response.
- The agent prompt now explicitly requires project execution, verification, and path reporting.

## [0.3.0] - 2026-07-27

### Added

- Ten interface languages: English, Turkish, Spanish, French, German, Italian,
  Portuguese, Russian, Japanese, and Korean.
- Persistent language selection through `soleil language`, `/language`, and
  `/language CODE`.
- `--language` and `--lang` launch options.
- Language selection inside the setup center.
- Internationalization tests and global language preference persistence.
- GitHub Actions CI, contribution guidance, security policy, and issue templates.

### Changed

- English is now the source and default interface language.
- README and repository-facing documentation are fully English.
- Provider, tool, adapter, and vault messages use clear English defaults.
- Version bumped to 0.3.0.

## [0.2.0] - 2026-07-27

### Added

- Multi-token vault and guided free-provider setup.
- Task-aware SoleilRelay routing.
- Full-screen green terminal UI with the Soleil cat.
- Automatic short rate-limit retry and provider fallback.
