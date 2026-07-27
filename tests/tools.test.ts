import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ToolManager } from "../src/tools/tool-manager.js";

test("tools stay inside project and can edit with approval", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-tools-"));
  try {
    await writeFile(path.join(root, "hello.txt"), "merhaba dünya\n", "utf8");
    const manager = new ToolManager(root, async () => true, false, 5_000);

    const read = await manager.execute({
      type: "tool",
      tool: "read_file",
      arguments: { path: "hello.txt" },
    });
    assert.equal(read.ok, true);
    assert.match(read.output, /merhaba dünya/);

    const edit = await manager.execute({
      type: "tool",
      tool: "replace_in_file",
      arguments: {
        path: "hello.txt",
        oldText: "merhaba",
        newText: "selam",
      },
    });
    assert.equal(edit.ok, true);
    assert.equal(await readFile(path.join(root, "hello.txt"), "utf8"), "selam dünya\n");

    const escape = await manager.execute({
      type: "tool",
      tool: "read_file",
      arguments: { path: "../outside.txt" },
    });
    assert.equal(escape.ok, false);
    assert.match(escape.output, /dışına erişim engellendi/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("secret files are blocked", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-secrets-"));
  try {
    await writeFile(path.join(root, ".env.local"), "TOKEN=secret", "utf8");
    const manager = new ToolManager(root, async () => true, true, 5_000);
    const result = await manager.execute({
      type: "tool",
      tool: "read_file",
      arguments: { path: ".env.local" },
    });
    assert.equal(result.ok, false);
    assert.match(result.output, /Gizli/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
