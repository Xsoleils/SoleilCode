import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAgentAction,
  parseAgentResponse,
} from "../src/agent/protocol.js";

test("JSON tool action parses", () => {
  const action = parseAgentAction(
    '{"type":"tool","tool":"read_file","arguments":{"path":"README.md"}}',
  );
  assert.equal(action.type, "tool");
  if (action.type === "tool") assert.equal(action.tool, "read_file");
});

test("fenced JSON parses", () => {
  const action = parseAgentAction(
    '```json\n{"type":"final","message":"Tamamlandı."}\n```',
  );
  assert.deepEqual(action, { type: "final", message: "Tamamlandı." });
});

test("plain model text becomes final answer", () => {
  const action = parseAgentAction("I inspected the file.");
  assert.deepEqual(action, { type: "final", message: "I inspected the file." });
});

test("reasoning text and flattened tool actions are recovered", () => {
  const action = parseAgentAction(
    '<think>I should create the file.</think>\n{"type":"write_file","path":"snake-game/index.html","content":"<h1>Snake</h1>","reason":"Create the game"}',
  );
  assert.deepEqual(action, {
    type: "tool",
    tool: "write_file",
    arguments: {
      path: "snake-game/index.html",
      content: "<h1>Snake</h1>",
    },
    reason: "Create the game",
  });
});

test("truncated tool JSON is marked invalid instead of becoming user-facing text", () => {
  const parsed = parseAgentResponse(
    '{"type":"write_file","path":"snake-game/index.html","content":"<html>',
  );
  assert.equal(parsed.action, undefined);
  assert.equal(parsed.invalidToolAction, true);
});
