import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { saveGlobalLanguage } from "../src/config.js";
import {
  LANGUAGE_NAMES,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
  translate,
} from "../src/i18n.js";

test("SoleilCode exposes ten selectable interface languages", () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 10);
  assert.deepEqual(SUPPORTED_LANGUAGES, [
    "en",
    "tr",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ru",
    "ja",
    "ko",
  ]);

  for (const language of SUPPORTED_LANGUAGES) {
    assert.ok(LANGUAGE_NAMES[language]);
    assert.doesNotMatch(translate(language, "greeting"), /\{.+\}/);
  }
});

test("translations interpolate values and normalize regional language tags", () => {
  assert.equal(normalizeLanguage("pt-BR"), "pt");
  assert.equal(normalizeLanguage("TR_tr"), "tr");
  assert.equal(normalizeLanguage("unknown"), undefined);
  assert.match(translate("ja", "modelsReady", { count: 4 }), /4/);
});

test("global language persistence preserves existing settings", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-language-"));
  try {
    await writeFile(
      path.join(root, "config.json"),
      `${JSON.stringify({ mode: "private", maxAgentSteps: 7 }, null, 2)}\n`,
      "utf8",
    );
    await saveGlobalLanguage("fr", root);
    const saved = JSON.parse(
      await readFile(path.join(root, "config.json"), "utf8"),
    ) as Record<string, unknown>;
    assert.equal(saved.language, "fr");
    assert.equal(saved.mode, "private");
    assert.equal(saved.maxAgentSteps, 7);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
