import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { SoleilRelay } from "../src/relay/relay.js";
import type { SoleilConfig } from "../src/types.js";

test("relay falls back from a failing free provider", async (context) => {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { model: string };
      response.setHeader("content-type", "application/json");
      if (payload.model === "broken-model") {
        response.statusCode = 503;
        response.end(JSON.stringify({ error: { message: "temporary failure" } }));
        return;
      }
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '{"type":"final","message":"çalıştı"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "ask",
    maxAgentSteps: 5,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "first",
        displayName: "First",
        kind: "openai-compatible",
        baseUrl,
        enabled: true,
        models: [
          {
            id: "broken-model",
            displayName: "Broken",
            providerId: "first",
            cost: "free",
            priority: 100,
            capabilities: ["chat", "coding"],
          },
        ],
      },
      {
        id: "second",
        displayName: "Second",
        kind: "openai-compatible",
        baseUrl,
        enabled: true,
        models: [
          {
            id: "working-model",
            displayName: "Working",
            providerId: "second",
            cost: "free",
            priority: 90,
            capabilities: ["chat", "coding"],
          },
        ],
      },
    ],
  };

  const relay = new SoleilRelay(config);
  const result = await relay.chat([{ role: "user", content: "test" }]);
  assert.equal(result.decision.model.id, "working-model");
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.ok, false);
  assert.equal(result.attempts[1]?.ok, true);
});

test("private mode refuses cloud-only models", async () => {
  const config: SoleilConfig = {
    language: "en",
    mode: "private",
    approval: "ask",
    maxAgentSteps: 5,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "cloud",
        displayName: "Cloud",
        kind: "openai-compatible",
        baseUrl: "http://127.0.0.1:1/v1",
        enabled: true,
        models: [
          {
            id: "cloud-model",
            displayName: "Cloud",
            providerId: "cloud",
            cost: "free",
            priority: 100,
            capabilities: ["chat"],
          },
        ],
      },
    ],
  };
  const relay = new SoleilRelay(config);
  await assert.rejects(
    relay.chat([{ role: "user", content: "test" }]),
    /No working local model/,
  );
});

test("relay respects short provider retry delay and retries once", async (context) => {
  let calls = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      calls += 1;
      response.setHeader("content-type", "application/json");
      if (calls === 1) {
        response.statusCode = 429;
        response.end(
          JSON.stringify({ error: { message: "Rate limit reached. Try again in 0.01s." } }),
        );
        return;
      }
      response.end(
        JSON.stringify({ choices: [{ message: { content: '{"type":"final","message":"ok"}' } }] }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "ask",
    maxAgentSteps: 3,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "limited",
        displayName: "Limited",
        kind: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        enabled: true,
        models: [
          {
            id: "free-model",
            displayName: "Free",
            providerId: "limited",
            cost: "free",
            priority: 100,
            capabilities: ["chat"],
          },
        ],
      },
    ],
  };
  const relay = new SoleilRelay(config);
  const result = await relay.chat([{ role: "user", content: "test" }]);
  assert.equal(calls, 2);
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]?.ok, false);
  assert.equal(result.attempts[1]?.ok, true);
});

test("relay changes model priority according to task strength", async (context) => {
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ choices: [{ message: { content: '{"type":"final","message":"ok"}' } }] }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "ask",
    maxAgentSteps: 3,
    commandTimeoutMs: 5_000,
    providers: [
      {
        id: "task-aware",
        displayName: "Task Aware",
        kind: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        enabled: true,
        models: [
          {
            id: "fast-chat",
            displayName: "Fast Chat",
            providerId: "task-aware",
            cost: "free",
            priority: 80,
            capabilities: ["chat"],
            strengths: ["chat"],
          },
          {
            id: "code-reviewer",
            displayName: "Code Reviewer",
            providerId: "task-aware",
            cost: "free",
            priority: 80,
            capabilities: ["chat", "coding"],
            strengths: ["review", "debug"],
          },
        ],
      },
    ],
  };
  const relay = new SoleilRelay(config);
  const result = await relay.chat([{ role: "user", content: "incele" }], undefined, "review");
  assert.equal(result.decision.model.id, "code-reviewer");
  assert.match(result.decision.reason, /code review/);
});
