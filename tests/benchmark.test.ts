import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  formatBenchmarkReport,
  runBenchmark,
} from "../src/benchmark/runner.js";
import type { SoleilConfig } from "../src/types.js";

test("SoleilBench runs an isolated smoke task and reports metrics", async (context) => {
  let calls = 0;
  const server = createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      calls += 1;
      response.setHeader("content-type", "application/json");
      if (calls === 1) {
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "bench-write",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: JSON.stringify({
                    path: "answer.txt",
                    content: "SoleilBench OK\n",
                  }),
                },
              }],
            },
          }],
        }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{ message: { content: "The exact file was created." } }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const config: SoleilConfig = {
    language: "en",
    mode: "free",
    approval: "always",
    maxAgentSteps: 4,
    commandTimeoutMs: 5_000,
    providers: [{
      id: "bench-mock",
      displayName: "Bench Mock",
      kind: "openai-compatible",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      enabled: true,
      models: [{
        id: "bench-model",
        displayName: "Bench Model",
        providerId: "bench-mock",
        cost: "free",
        priority: 100,
        capabilities: ["chat", "coding", "tools"],
        strengths: ["edit"],
      }],
    }],
  };

  const report = await runBenchmark(config, { suite: "smoke", runs: 1 });
  assert.equal(report.passed, 1);
  assert.equal(report.failed, 0);
  assert.equal(report.passRate, 1);
  assert.deepEqual(report.cases[0]?.tools, ["list_files", "write_file"]);
  assert.match(formatBenchmarkReport(report), /1\/1 passed/);
});
