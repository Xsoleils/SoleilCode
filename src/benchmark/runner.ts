import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SoleilAgent, type AgentEvents } from "../agent/agent.js";
import { BrowserVerifier } from "../browser/browser-verifier.js";
import { CheckpointManager } from "../checkpoints/checkpoint-manager.js";
import { SoleilRelay } from "../relay/relay.js";
import { ToolManager } from "../tools/tool-manager.js";
import type { SoleilConfig, TokenUsage } from "../types.js";

export type BenchmarkSuite = "smoke" | "core";

interface BenchmarkTask {
  id: string;
  prompt: string;
  setup?: (root: string) => Promise<void>;
  verify: (root: string) => Promise<{ pass: boolean; detail: string }>;
}

export interface BenchmarkCaseResult {
  task: string;
  run: number;
  pass: boolean;
  latencyMs: number;
  detail: string;
  answer?: string;
  error?: string;
  models: string[];
  tools: string[];
  protocolRepairs: number;
  usage: TokenUsage;
}

export interface BenchmarkReport {
  version: 1;
  suite: BenchmarkSuite;
  runs: number;
  startedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  passRate: number;
  cases: BenchmarkCaseResult[];
}

const tasks: BenchmarkTask[] = [
  {
    id: "create-file",
    prompt:
      "Create answer.txt containing exactly `SoleilBench OK` followed by one newline. Then read it back.",
    verify: async (root) => {
      try {
        const content = await readFile(path.join(root, "answer.txt"), "utf8");
        return {
          pass: content === "SoleilBench OK\n",
          detail: content === "SoleilBench OK\n" ? "Exact file content matched." : "File content did not match.",
        };
      } catch {
        return { pass: false, detail: "answer.txt was not created." };
      }
    },
  },
  {
    id: "repair-code",
    prompt:
      "Fix calculator.js so add(2, 3) returns 5. Keep the exported function and run a focused verification.",
    setup: async (root) => {
      await writeFile(
        path.join(root, "calculator.js"),
        "export function add(a, b) {\n  return a - b;\n}\n",
        "utf8",
      );
    },
    verify: async (root) => {
      try {
        const moduleUrl = `${pathToFileURL(path.join(root, "calculator.js")).href}?t=${Date.now()}`;
        const loaded = await import(moduleUrl) as { add?: (a: number, b: number) => number };
        const pass = loaded.add?.(2, 3) === 5;
        return { pass, detail: pass ? "add(2, 3) returned 5." : "The repaired function returned the wrong value." };
      } catch (error) {
        return { pass: false, detail: `calculator.js could not be executed: ${error instanceof Error ? error.message : error}` };
      }
    },
  },
  {
    id: "browser-runtime",
    prompt:
      "Create index.html in the project root with a button labelled Count and visible count 0. Clicking the button must increment the visible count. Use browser_test with Tab and Enter after editing.",
    verify: async (root) => {
      const verification = await new BrowserVerifier(root).verify(
        "index.html",
        ["Tab", "Enter"],
        200,
      );
      const incremented = /1/.test(verification.bodyText || "");
      return {
        pass: verification.ok && incremented,
        detail: verification.ok
          ? incremented
            ? "Browser loaded without runtime errors and the interaction incremented the count."
            : "Browser loaded, but the count did not increment."
          : verification.error || [...verification.consoleErrors, ...verification.pageErrors].join("; "),
      };
    },
  },
];

function selectedTasks(suite: BenchmarkSuite): BenchmarkTask[] {
  return suite === "smoke" ? tasks.slice(0, 1) : tasks;
}

async function removeBenchmarkRoot(root: string): Promise<void> {
  const temporaryRoot = path.resolve(tmpdir());
  const resolved = path.resolve(root);
  if (
    path.dirname(resolved) !== temporaryRoot ||
    !path.basename(resolved).startsWith("soleil-bench-")
  ) {
    throw new Error("Refusing to clean an unexpected benchmark directory.");
  }
  await rm(resolved, { recursive: true, force: true });
}

export async function runBenchmark(
  config: SoleilConfig,
  options: { suite?: BenchmarkSuite; runs?: number } = {},
): Promise<BenchmarkReport> {
  const suite = options.suite || "core";
  const runs = Math.max(1, Math.min(Math.trunc(options.runs || 1), 10));
  const startedAt = new Date().toISOString();
  const benchmarkStarted = Date.now();
  const results: BenchmarkCaseResult[] = [];
  const relay = new SoleilRelay(config);
  await relay.initialize();

  for (let run = 1; run <= runs; run += 1) {
    for (const task of selectedTasks(suite)) {
      const root = await mkdtemp(path.join(tmpdir(), "soleil-bench-"));
      const models: string[] = [];
      const usedTools: string[] = [];
      const usage: TokenUsage = {};
      let protocolRepairs = 0;
      const caseStarted = Date.now();
      try {
        await mkdir(root, { recursive: true });
        await task.setup?.(root);
        const checkpoints = new CheckpointManager(root);
        const tools = new ToolManager(root, async () => true, true, config.commandTimeoutMs, checkpoints);
        const events: AgentEvents = {
          onModelSelected: (result) => {
            models.push(`${result.decision.provider.id}/${result.decision.model.id}`);
            usage.input = (usage.input || 0) + (result.usage?.input || 0);
            usage.output = (usage.output || 0) + (result.usage?.output || 0);
          },
          onTool: (name) => usedTools.push(name),
          onProtocolRepair: () => {
            protocolRepairs += 1;
          },
        };
        const agent = new SoleilAgent(
          root,
          relay,
          tools,
          config.maxAgentSteps,
          events,
          config.language,
          checkpoints,
        );
        const answer = await agent.run(task.prompt);
        const verification = await task.verify(root);
        results.push({
          task: task.id,
          run,
          pass: verification.pass,
          latencyMs: Date.now() - caseStarted,
          detail: verification.detail,
          answer,
          models,
          tools: usedTools,
          protocolRepairs,
          usage,
        });
      } catch (error) {
        results.push({
          task: task.id,
          run,
          pass: false,
          latencyMs: Date.now() - caseStarted,
          detail: "The agent run failed before verification completed.",
          error: error instanceof Error ? error.message : String(error),
          models,
          tools: usedTools,
          protocolRepairs,
          usage,
        });
      } finally {
        await removeBenchmarkRoot(root);
      }
    }
  }

  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  return {
    version: 1,
    suite,
    runs,
    startedAt,
    durationMs: Date.now() - benchmarkStarted,
    passed,
    failed,
    passRate: results.length ? passed / results.length : 0,
    cases: results,
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines = [
    `SoleilBench · ${report.suite} · ${report.passed}/${report.cases.length} passed · ${(report.passRate * 100).toFixed(0)}%`,
    "",
  ];
  for (const result of report.cases) {
    lines.push(
      `${result.pass ? "PASS" : "FAIL"}  ${result.task} #${result.run}  ${result.latencyMs}ms`,
      `      ${result.detail}`,
      `      tools: ${result.tools.join(", ") || "none"} · repairs: ${result.protocolRepairs} · tokens: ${(result.usage.input || 0) + (result.usage.output || 0)}`,
    );
    if (result.error) lines.push(`      error: ${result.error}`);
  }
  lines.push("", `Total: ${report.durationMs}ms`);
  return lines.join("\n");
}
