import { buildSystemPrompt } from "./prompt.js";
import { parseAgentAction } from "./protocol.js";
import type { ChatMessage, RelayResult, ToolResult } from "../types.js";
import { SoleilRelay } from "../relay/relay.js";
import { ToolManager } from "../tools/tool-manager.js";
import { classifyTask } from "../relay/task-classifier.js";

export interface AgentEvents {
  onThinking?: () => void;
  onModelSelected?: (result: RelayResult) => void;
  onTool?: (name: string, reason?: string) => void;
  onToolResult?: (name: string, result: ToolResult) => void;
}

export class SoleilAgent {
  private conversation: ChatMessage[] = [];

  constructor(
    private readonly root: string,
    private readonly relay: SoleilRelay,
    private readonly tools: ToolManager,
    private readonly maxSteps: number,
    private readonly events: AgentEvents = {},
  ) {}

  clear(): void {
    this.conversation = [];
  }

  async run(input: string, signal?: AbortSignal): Promise<string> {
    const normalized = input
      .trim()
      .toLocaleLowerCase("tr-TR")
      .replace(/[!?.…]+$/g, "");
    if (["selam", "merhaba", "hey", "hi", "hello", "sa", "selamlar"].includes(normalized)) {
      return "Selam! ☀ Bugün hangi proje veya kodlama görevi üzerinde çalışalım?";
    }
    const task = classifyTask(input);

    const working: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(this.root) },
      ...this.conversation,
      { role: "user", content: input },
    ];

    for (let step = 1; step <= this.maxSteps; step += 1) {
      this.events.onThinking?.();
      const response = await this.relay.chat(working, signal, task);
      this.events.onModelSelected?.(response);
      const action = parseAgentAction(response.content);
      working.push({ role: "assistant", content: response.content });

      if (action.type === "final") {
        this.conversation.push(
          { role: "user", content: input },
          { role: "assistant", content: action.message },
        );
        if (this.conversation.length > 20) this.conversation.splice(0, this.conversation.length - 20);
        return action.message;
      }

      this.events.onTool?.(action.tool, action.reason);
      const result = await this.tools.execute(action);
      this.events.onToolResult?.(action.tool, result);
      working.push({
        role: "user",
        content: `TOOL_RESULT ${action.tool}\n${JSON.stringify(result)}`,
      });
    }

    throw new Error(
      `Ajan ${this.maxSteps} adım sınırına ulaştı. Görevi daha küçük bir parçaya bölmeyi deneyin.`,
    );
  }
}
