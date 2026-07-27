import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentAction } from "../src/agent/protocol.js";

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
  const action = parseAgentAction("Dosyayı inceledim.");
  assert.deepEqual(action, { type: "final", message: "Dosyayı inceledim." });
});
