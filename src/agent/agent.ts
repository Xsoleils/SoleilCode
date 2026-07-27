import path from "node:path";
import { buildSystemPrompt } from "./prompt.js";
import { parseAgentResponse } from "./protocol.js";
import type { ChatMessage, RelayResult, ToolResult } from "../types.js";
import { SoleilRelay } from "../relay/relay.js";
import { ToolManager } from "../tools/tool-manager.js";
import { classifyTask } from "../relay/task-classifier.js";
import { translate, type SoleilLanguage } from "../i18n.js";
import type { CheckpointManager } from "../checkpoints/checkpoint-manager.js";
import { TOOL_DEFINITIONS } from "../tools/definitions.js";
import type { ToolCall } from "../types.js";

export interface AgentEvents {
  onThinking?: () => void;
  onModelSelected?: (result: RelayResult) => void;
  onTool?: (name: string, reason?: string) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
  onProtocolRepair?: () => void;
}

export class SoleilAgent {
  private conversation: ChatMessage[] = [];

  constructor(
    private readonly root: string,
    private readonly relay: SoleilRelay,
    private readonly tools: ToolManager,
    private readonly maxSteps: number,
    private readonly events: AgentEvents = {},
    private language: SoleilLanguage = "en",
    private readonly checkpoints?: CheckpointManager,
  ) {}

  clear(): void {
    this.conversation = [];
  }

  setLanguage(language: SoleilLanguage): void {
    this.language = language;
  }

  async run(input: string, signal?: AbortSignal): Promise<string> {
    const normalized = input
      .trim()
      .toLocaleLowerCase()
      .replace(/[!?.…]+$/g, "");
    if (
      [
        "selam",
        "merhaba",
        "hey",
        "hi",
        "hello",
        "sa",
        "selamlar",
        "hola",
        "bonjour",
        "salut",
        "hallo",
        "ciao",
        "olá",
        "ola",
        "привет",
        "здравствуйте",
        "こんにちは",
        "안녕하세요",
      ].includes(normalized)
    ) {
      return translate(this.language, "greeting");
    }
    const task = classifyTask(input);
    this.checkpoints?.begin(input);
    const projectTask = new Set([
      "edit",
      "debug",
      "review",
      "test",
      "long-context",
    ]).has(task);
    let projectSnapshot = "";
    if (projectTask) {
      const snapshotCall = {
        type: "tool" as const,
        tool: "list_files",
        arguments: { path: ".", maxDepth: 2 },
        reason: "Inspect project structure before acting",
      };
      this.events.onTool?.(snapshotCall.tool, snapshotCall.reason);
      const snapshot = await this.tools.execute(snapshotCall);
      this.events.onToolResult?.(snapshotCall.tool, snapshot);
      projectSnapshot = snapshot.output.slice(0, 12_000);
    }

    const working: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(this.root) },
      ...this.conversation,
      {
        role: "user",
        content: projectSnapshot
          ? `${input}\n\nPROJECT_SNAPSHOT\n${projectSnapshot}`
          : input,
      },
    ];
    const changedFiles = new Set<string>();
    let toolCalls = 0;
    let writeDenied = false;
    let protocolFailures = 0;

    try {
      for (let step = 1; step <= this.maxSteps; step += 1) {
        this.events.onThinking?.();
        const response = await this.relay.chat(
          working,
          signal,
          task,
          TOOL_DEFINITIONS,
        );
        this.events.onModelSelected?.(response);

        if (response.toolCalls?.length) {
          working.push({
            role: "assistant",
            content: response.content,
            toolCalls: response.toolCalls,
          });
          for (const nativeCall of response.toolCalls) {
            const action: ToolCall = {
              type: "tool",
              tool: nativeCall.name,
              arguments: nativeCall.arguments,
              reason: `Native tool call: ${nativeCall.name}`,
            };
            toolCalls += 1;
            this.events.onTool?.(action.tool, action.reason);
            const result = await this.tools.execute(action);
            this.events.onToolResult?.(action.tool, result);
            if (
              result.ok &&
              (action.tool === "write_file" || action.tool === "replace_in_file") &&
              typeof action.arguments.path === "string"
            ) {
              changedFiles.add(action.arguments.path);
            }
            if (
              result.denied &&
              (action.tool === "write_file" || action.tool === "replace_in_file")
            ) {
              writeDenied = true;
            }
            working.push({
              role: "tool",
              content: JSON.stringify(result),
              toolCallId: nativeCall.id,
              name: nativeCall.name,
            });
          }
          continue;
        }

        const parsed = parseAgentResponse(response.content);
        const parsedAction =
          parsed.action ||
          (!parsed.invalidToolAction && parsed.sanitized
            ? { type: "final" as const, message: parsed.sanitized }
            : undefined);
        if (parsed.invalidToolAction || !parsedAction) {
          protocolFailures += 1;
          this.events.onProtocolRepair?.();
          working.push({
            role: "assistant",
            content: parsed.sanitized.slice(0, 1_200),
          });
          working.push({
            role: "user",
            content:
              "PROTOCOL_ERROR: Your previous response was not one complete valid JSON action. " +
              "Use the native function tools if available. Otherwise do not explain, emit <think>, or use Markdown. " +
              'Reply with exactly {"type":"tool","tool":"TOOL_NAME","arguments":{...},"reason":"..."} ' +
              'or {"type":"final","message":"..."}. If a file was too large, produce a smaller complete implementation.',
          });
          if (protocolFailures >= 3) {
            throw new Error(
              "The selected model repeatedly returned an invalid or truncated tool action. Try another model or a smaller request.",
            );
          }
          continue;
        }

        const action = parsedAction;
        working.push({ role: "assistant", content: response.content });

        if (action.type === "final") {
          if (projectTask && toolCalls === 0) {
            working.push({
              role: "user",
              content:
                "ACTION_REQUIRED: This is a project task, not a chat-only request. " +
                "Inspect or modify the project with an available tool before giving the final answer.",
            });
            continue;
          }
          if (task === "edit" && changedFiles.size === 0 && !writeDenied) {
            working.push({
              role: "user",
              content:
                "WRITE_REQUIRED: The user asked you to create or change code, but no file was written. " +
                "Use write_file or replace_in_file now. For a new standalone app in a general workspace, " +
                "create a descriptive subdirectory and place the entry file inside it.",
            });
            continue;
          }

          let finalMessage = action.message;
          const missingPaths = [...changedFiles]
            .map((file) => path.resolve(this.root, file))
            .filter(
              (absolute) =>
                !finalMessage.includes(absolute) &&
                !finalMessage.includes(path.relative(this.root, absolute)),
            );
          if (missingPaths.length) {
            finalMessage += `\n\nFiles:\n${missingPaths.map((file) => `- ${file}`).join("\n")}`;
          }
          this.conversation.push(
            { role: "user", content: input },
            { role: "assistant", content: finalMessage },
          );
          if (this.conversation.length > 20) this.conversation.splice(0, this.conversation.length - 20);
          return finalMessage;
        }

        toolCalls += 1;
        this.events.onTool?.(action.tool, action.reason);
        const result = await this.tools.execute(action);
        this.events.onToolResult?.(action.tool, result);
        if (
          result.ok &&
          (action.tool === "write_file" || action.tool === "replace_in_file") &&
          typeof action.arguments.path === "string"
        ) {
          changedFiles.add(action.arguments.path);
        }
        if (
          result.denied &&
          (action.tool === "write_file" ||
            action.tool === "replace_in_file")
        ) {
          writeDenied = true;
        }
        working.push({
          role: "user",
          content: `TOOL_RESULT ${action.tool}\n${JSON.stringify(result)}`,
        });
      }

      throw new Error(translate(this.language, "maxSteps", { count: this.maxSteps }));
    } finally {
      await this.checkpoints?.complete();
    }
  }
}
