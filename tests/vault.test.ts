import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import {
  CredentialVault,
  credentialFingerprint,
} from "../src/credentials/vault.js";
import { tokenLines } from "../src/setup/setup-center.js";

test("vault supports multiple tokens and deduplicates exact secrets", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-vault-"));
  try {
    const vault = new CredentialVault(path.join(root, "vault"));
    const first = await vault.add("groq", "Groq bir", "fixture-token-111111111111");
    const second = await vault.add("groq", "Groq iki", "fixture-token-222222222222");
    const duplicate = await vault.add("groq", "Tekrar", "fixture-token-111111111111");

    assert.equal(first.added, true);
    assert.equal(second.added, true);
    assert.equal(duplicate.added, false);
    assert.equal((await vault.list()).length, 2);

    const lines = tokenLines(await vault.list()).join("\n");
    assert.doesNotMatch(lines, /fixture-token/);
    assert.match(lines, new RegExp(credentialFingerprint("fixture-token-111111111111")));

    const raw = await readFile(vault.filePath, "utf8");
    assert.match(raw, /"version": 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("saved tokens become independent SoleilRelay provider routes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-vault-config-"));
  try {
    const vault = new CredentialVault(path.join(root, "vault"));
    await vault.add("groq", "Birinci", "fixture-token-AAAAAAAAAAAA");
    await vault.add("groq", "İkinci", "fixture-token-BBBBBBBBBBBB");
    await vault.add("gemini", "Gemini", "fixture-token-CCCCCCCCCCCC");

    const config = await loadConfig(root, vault);
    const groqRoutes = config.providers.filter((provider) =>
      ["Groq · Birinci", "Groq · İkinci"].includes(provider.displayName),
    );
    const geminiRoutes = config.providers.filter(
      (provider) => provider.displayName === "Gemini · Gemini",
    );
    assert.equal(groqRoutes.length, 2);
    assert.equal(geminiRoutes.length, 1);
    assert.equal(new Set(groqRoutes.map((provider) => provider.id)).size, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
