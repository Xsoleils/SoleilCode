import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverBrowserExecutable,
} from "../src/browser/browser-verifier.js";
import { ToolManager } from "../src/tools/tool-manager.js";

test("browser verifier runs a real page and keyboard interaction", async (context) => {
  if (!(await discoverBrowserExecutable())) {
    context.skip("No installed Chromium browser");
    return;
  }
  const root = await mkdtemp(path.join(tmpdir(), "soleil-browser-test-"));
  try {
    await writeFile(
      path.join(root, "index.html"),
      `<!doctype html><title>Browser Test</title>
<button>Count</button><output>0</output>
<script>
const button = document.querySelector("button");
const output = document.querySelector("output");
button.addEventListener("click", () => { output.textContent = "1"; });
</script>`,
      "utf8",
    );
    const manager = new ToolManager(root, async () => true, true, 5_000);
    const toolResult = await manager.execute({
      type: "tool",
      tool: "browser_test",
      arguments: {
        path: "index.html",
        keys: ["Tab", "Enter"],
        waitMs: 100,
      },
    });
    assert.equal(toolResult.ok, true, toolResult.output);
    const result = JSON.parse(toolResult.output) as {
      bodyText?: string;
      screenshot?: string;
    };
    assert.match(result.bodyText || "", /1/);
    assert.ok(result.screenshot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
