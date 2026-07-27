import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SoleilAgent } from "../src/agent/agent.js";
import { SoleilRelay } from "../src/relay/relay.js";
import { ToolManager } from "../src/tools/tool-manager.js";
import type { SoleilConfig } from "../src/types.js";

test("agent completes a tool loop through SoleilRelay", async (context) => {
  let callCount = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      callCount += 1;
      response.setHeader("content-type", "application/json");
      const content =
        callCount === 1
          ? JSON.stringify({
              type: "tool",
              tool: "write_file",
              arguments: { path: "hello.txt", content: "Soleil was born.\n" },
              reason: "Creating the requested file",
            })
          : JSON.stringify({
              type: "final",
              message: "hello.txt created.",
            });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const root = await mkdtemp(path.join(tmpdir(), "soleil-agent-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "ask",
    maxAgentSteps: 4,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "mock",
        displayName: "Mock Free LLM",
        kind: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        enabled: true,
        models: [
          {
            id: "mock-coder",
            displayName: "Mock Coder",
            providerId: "mock",
            cost: "free",
            priority: 100,
            capabilities: ["chat", "coding", "tools"],
          },
        ],
      },
    ],
  };

  const relay = new SoleilRelay(config);
  const tools = new ToolManager(root, async () => true, false, 5_000);
  const agent = new SoleilAgent(root, relay, tools, 4);
  const result = await agent.run("create hello.txt");

  assert.equal(result, "hello.txt created.");
  assert.equal(await readFile(path.join(root, "hello.txt"), "utf8"), "Soleil was born.\n");
  assert.equal(callCount, 2);
});

test("agent repairs a truncated response, creates a project file, and reports its path", async (context) => {
  let callCount = 0;
  const requests: Array<{
    max_tokens?: number;
    messages?: Array<{ role: string; content: string }>;
  }> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      callCount += 1;
      requests.push(JSON.parse(body) as (typeof requests)[number]);
      response.setHeader("content-type", "application/json");
      const content =
        callCount === 1
          ? '<think>Building the game.</think>\n{"type":"write_file","path":"snake-game/index.html","content":"<html>'
          : callCount === 2
            ? JSON.stringify({
                type: "write_file",
                path: "snake-game/index.html",
                content: "<!doctype html><title>Snake</title><canvas id=\"game\"></canvas>\n",
                reason: "Create a complete compact game entry file",
              })
            : JSON.stringify({
                type: "final",
                message: "The snake game is ready.",
              });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const root = await mkdtemp(path.join(tmpdir(), "soleil-project-agent-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "ask",
    maxAgentSteps: 6,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "mock",
        displayName: "Mock Free LLM",
        kind: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        enabled: true,
        models: [
          {
            id: "mock-coder",
            displayName: "Mock Coder",
            providerId: "mock",
            cost: "free",
            priority: 100,
            capabilities: ["chat", "coding", "tools"],
            strengths: ["edit"],
          },
        ],
      },
    ],
  };

  const relay = new SoleilRelay(config);
  const tools = new ToolManager(root, async () => true, true, 5_000);
  const agent = new SoleilAgent(root, relay, tools, 6);
  const result = await agent.run("Bana basit bir yılan oyunu hazırla");
  const createdPath = path.join(root, "snake-game", "index.html");

  assert.equal(callCount, 3);
  assert.equal(requests[0]?.max_tokens, 4_096);
  assert.match(
    requests[0]?.messages?.at(-1)?.content || "",
    /PROJECT_SNAPSHOT/,
  );
  assert.match(
    requests[1]?.messages?.at(-1)?.content || "",
    /PROTOCOL_ERROR/,
  );
  assert.match(await readFile(createdPath, "utf8"), /<canvas/);
  assert.match(result, new RegExp(createdPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
