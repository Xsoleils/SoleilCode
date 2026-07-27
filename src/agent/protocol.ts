import type { AgentAction } from "../types.js";

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isAction(value: unknown): value is AgentAction {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.type === "final") return typeof item.message === "string";
  return (
    item.type === "tool" &&
    typeof item.tool === "string" &&
    Boolean(item.arguments) &&
    typeof item.arguments === "object" &&
    !Array.isArray(item.arguments)
  );
}

export function parseAgentAction(raw: string): AgentAction {
  const trimmed = raw.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ];

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (isAction(parsed)) return parsed;
  }

  return { type: "final", message: trimmed };
}
