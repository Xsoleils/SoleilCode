import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SoleilAgent } from "../src/agent/agent.js";
import { SoleilRelay } from "../src/relay/relay.js";
import { ToolManager } from "../src/tools/tool-manager.js";
import type { SoleilConfig } from "../src/types.js";

test("simple greeting consumes no model request", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "soleil-greeting-"));
  try {
    const config: SoleilConfig = {
      language: "en",
      mode: "free",
      approval: "ask",
      maxAgentSteps: 3,
      commandTimeoutMs: 5_000,
      providers: [],
    };
    const relay = new SoleilRelay(config);
    const tools = new ToolManager(root, async () => true, true, 5_000);
    const agent = new SoleilAgent(root, relay, tools, 3);
    assert.match(await agent.run("hello"), /Hello!/);
    agent.setLanguage("tr");
    assert.match(await agent.run("selam"), /Selam!/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
