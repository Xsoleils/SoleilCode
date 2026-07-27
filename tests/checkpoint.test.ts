import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { CheckpointManager } from "../src/checkpoints/checkpoint-manager.js";
import { ToolManager } from "../src/tools/tool-manager.js";

test("checkpoint restores edited files and removes files created by the agent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-checkpoint-test-"));
  try {
    await writeFile(path.join(root, "existing.txt"), "before\n", "utf8");
    const checkpoints = new CheckpointManager(root);
    const tools = new ToolManager(root, async () => true, true, 5_000, checkpoints);
    checkpoints.begin("change two files");

    assert.equal((await tools.execute({
      type: "tool",
      tool: "replace_in_file",
      arguments: { path: "existing.txt", oldText: "before", newText: "after" },
    })).ok, true);
    assert.equal((await tools.execute({
      type: "tool",
      tool: "write_file",
      arguments: { path: "created.txt", content: "new\n" },
    })).ok, true);
    await checkpoints.complete();

    const undone = await checkpoints.undoLatest();
    assert.deepEqual(undone?.restored.sort(), ["created.txt", "existing.txt"]);
    assert.equal(await readFile(path.join(root, "existing.txt"), "utf8"), "before\n");
    await assert.rejects(readFile(path.join(root, "created.txt"), "utf8"), /ENOENT/);
    assert.equal((await checkpoints.list()).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
