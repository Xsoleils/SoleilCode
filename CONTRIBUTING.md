# Contributing to SoleilCode

Thank you for helping make free-first coding tools better.

## Before you start

- Search existing issues before opening a new one.
- Use a focused issue for behavior changes or larger features.
- Never include real API keys, credentials, private source code, or provider
  account details in an issue, test, commit, or screenshot.
- Keep provider integrations compatible with the free-first policy. SoleilCode
  only accepts `free` and `local` model costs.

## Local development

Requirements:

- Node.js 22 or newer
- npm

Install and verify:

```bash
npm install
npm run check
```

Run the CLI from source:

```bash
npm run dev
```

## Pull requests

1. Create a branch from `main`.
2. Keep the change small and explain the user-facing outcome.
3. Add or update tests for changed behavior.
4. Run `npm run check`.
5. Update the README or changelog when commands, configuration, providers, or
   supported languages change.

Pull requests should not:

- introduce a paid fallback;
- weaken workspace or secret-file boundaries;
- print or log raw credentials;
- bypass approval for writes or commands by default;
- add generated build output to Git.

## Translations

Interface messages live in `src/i18n.ts`. English is the source language.

When adding or updating translations:

- preserve placeholders such as `{count}`, `{language}`, and `{url}`;
- keep command names and mode values unchanged;
- use natural UI language rather than word-for-word translation;
- add coverage in `tests/i18n.test.ts` for new languages.

## Coding style

- Prefer small TypeScript modules with explicit types.
- Keep user-facing errors actionable.
- Avoid adding runtime dependencies unless they materially improve the CLI.
- Preserve Windows, macOS, and Linux terminal compatibility.

By contributing, you agree that your contribution may be distributed under the
MIT License.
