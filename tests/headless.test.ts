import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("soleil run --json executes a non-interactive task", async (context) => {
  let calls = 0;
  const server = createServer((request, response) => {
    if (request.url?.endsWith("/api/tags")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ models: [] }));
      return;
    }
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
                id: "headless-write",
                type: "function",
                function: {
                  name: "write_file",
                  arguments: JSON.stringify({
                    path: "headless.txt",
                    content: "automation ready\n",
                  }),
                },
              }],
            },
          }],
        }));
        return;
      }
      response.end(JSON.stringify({
        choices: [{ message: { content: "headless.txt created." } }],
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const address = server.address() as AddressInfo;
  const testRoot = await mkdtemp(path.join(tmpdir(), "soleil-headless-test-"));
  const project = path.join(testRoot, "project");
  const home = path.join(testRoot, "home");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  context.after(() => rm(testRoot, { recursive: true, force: true }));
  await writeFile(
    path.join(home, "config.json"),
    `${JSON.stringify({
      providers: [{
        id: "headless-mock",
        displayName: "Headless Mock",
        kind: "openai-compatible",
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        enabled: true,
        models: [{
          id: "headless-model",
          cost: "free",
          priority: 1000,
          capabilities: ["chat", "coding", "tools"],
        }],
      }],
    })}\n`,
    "utf8",
  );

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    SOLEILCODE_HOME: home,
    OLLAMA_BASE_URL: `http://127.0.0.1:${address.port}/ollama`,
  };
  for (const key of [
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "SOLEIL_API_KEY",
    "SOLEIL_BASE_URL",
    "SOLEIL_MODEL",
  ]) {
    delete environment[key];
  }

  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.resolve("src/cli.ts"),
      "run",
      "create headless.txt",
      "--cwd",
      project,
      "--yes",
      "--json",
    ],
    {
      cwd: path.resolve("."),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("exit", resolve);
  });

  assert.equal(exitCode, 0, stderr);
  const payload = JSON.parse(stdout) as {
    success: boolean;
    answer: string;
    tools: Array<{ name: string }>;
    checkpoint?: { files: number };
  };
  assert.equal(payload.success, true);
  assert.match(payload.answer, /headless\.txt/);
  assert.deepEqual(payload.tools.map((item) => item.name), ["list_files", "write_file"]);
  assert.equal(payload.checkpoint?.files, 1);
  assert.equal(await readFile(path.join(project, "headless.txt"), "utf8"), "automation ready\n");
});
