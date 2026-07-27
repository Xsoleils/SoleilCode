import type { AgentAction } from "../types.js";

const TOOL_NAMES = new Set([
  "list_files",
  "read_file",
  "search_text",
  "write_file",
  "replace_in_file",
  "run_command",
  "git_diff",
]);

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function normalizeAction(value: unknown): AgentAction | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (item.type === "final" && typeof item.message === "string") {
    return { type: "final", message: item.message };
  }
  if (
    item.type === "tool" &&
    typeof item.tool === "string" &&
    Boolean(item.arguments) &&
    typeof item.arguments === "object" &&
    !Array.isArray(item.arguments)
  ) {
    return {
      type: "tool",
      tool: item.tool,
      arguments: item.arguments as Record<string, unknown>,
      ...(typeof item.reason === "string" ? { reason: item.reason } : {}),
    };
  }

  // Some open-weight models flatten the tool name into `type`. Accept that
  // recoverable shape instead of printing the JSON to the user.
  if (typeof item.type === "string" && TOOL_NAMES.has(item.type)) {
    const { type, reason, ...arguments_ } = item;
    return {
      type: "tool",
      tool: type,
      arguments: arguments_,
      ...(typeof reason === "string" ? { reason } : {}),
    };
  }
  return undefined;
}

function stripReasoning(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

export interface ParsedAgentResponse {
  action?: AgentAction;
  invalidToolAction: boolean;
  sanitized: string;
}

export function parseAgentResponse(raw: string): ParsedAgentResponse {
  const sanitized = stripReasoning(raw);
  const candidates = [
    sanitized,
    sanitized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];

  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(sanitized.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const action = normalizeAction(tryParse(candidate));
    if (action) return { action, invalidToolAction: false, sanitized };
  }

  const invalidToolAction =
    /^\s*\{/.test(sanitized) ||
    /"(?:type|tool)"\s*:\s*"(?:tool|list_files|read_file|search_text|write_file|replace_in_file|run_command|git_diff)"/i.test(
      sanitized,
    ) ||
    /<\/?think>/i.test(raw);
  return { invalidToolAction, sanitized };
}

export function parseAgentAction(raw: string): AgentAction {
  const parsed = parseAgentResponse(raw);
  return parsed.action || { type: "final", message: parsed.sanitized };
}
