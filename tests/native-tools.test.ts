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

test("agent executes OpenAI-compatible native tool calls", async (context) => {
  const requests: Array<Record<string, unknown>> = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      requests.push(JSON.parse(body) as Record<string, unknown>);
      response.setHeader("content-type", "application/json");
      if (requests.length === 1) {
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "call_write",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: JSON.stringify({
                    path: "native.txt",
                    content: "native tools work\n",
                  }),
                },
              }],
            },
          }],
        }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{ message: { content: "native.txt created." } }],
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const root = await mkdtemp(path.join(tmpdir(), "soleil-native-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "always",
    maxAgentSteps: 4,
    commandTimeoutMs: 5_000,
    providers: [{
      id: "native-mock",
      displayName: "Native Mock",
      kind: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      enabled: true,
      models: [{
        id: "native-model",
        displayName: "Native Model",
        providerId: "native-mock",
        cost: "free",
        priority: 100,
        capabilities: ["chat", "coding", "tools"],
        strengths: ["edit"],
      }],
    }],
  };

  const relay = new SoleilRelay(config);
  const agent = new SoleilAgent(
    root,
    relay,
    new ToolManager(root, async () => true, true, 5_000),
    4,
  );
  const answer = await agent.run("create native.txt");
  assert.equal(await readFile(path.join(root, "native.txt"), "utf8"), "native tools work\n");
  assert.match(answer, /native\.txt/);
  assert.ok(Array.isArray(requests[0]?.tools));
  const secondMessages = requests[1]?.messages as Array<Record<string, unknown>>;
  assert.equal(secondMessages.at(-1)?.role, "tool");
  assert.equal(secondMessages.at(-1)?.tool_call_id, "call_write");
});
