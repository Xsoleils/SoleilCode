import type {
  ChatRequest,
  ChatResponse,
  ModelDefinition,
  NativeToolCall,
  ProviderAdapter,
  ProviderDefinition,
} from "../types.js";

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: Array<{
      function?: { name?: string; arguments?: Record<string, unknown> | string };
    }>;
  };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string; model?: string }>;
}

export class OllamaAdapter implements ProviderAdapter {
  readonly kind = "ollama" as const;

  async chat(provider: ProviderDefinition, request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${provider.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model.id,
        messages: request.messages.map((message) => {
          if (message.role === "assistant" && message.toolCalls?.length) {
            return {
              role: "assistant",
              content: message.content,
              tool_calls: message.toolCalls.map((call) => ({
                function: { name: call.name, arguments: call.arguments },
              })),
            };
          }
          return {
            role: message.role,
            content: message.content,
            ...(message.name ? { tool_name: message.name } : {}),
          };
        }),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: "function",
                function: tool,
              })),
            }
          : {}),
        stream: false,
        ...(!request.tools?.length ? { format: "json" } : {}),
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxTokens ?? 4096,
        },
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const raw = await response.text();
    let payload: OllamaChatResponse;
    try {
      payload = JSON.parse(raw) as OllamaChatResponse;
    } catch {
      throw new Error(`Invalid Ollama response (${response.status}): ${raw.slice(0, 300)}`);
    }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const content = payload.message?.content?.trim() || "";
    const toolCalls: NativeToolCall[] = (payload.message?.tool_calls || []).flatMap(
      (call, index) => {
        const name = call.function?.name;
        if (!name) return [];
        let arguments_: Record<string, unknown> = {};
        const raw = call.function?.arguments;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              arguments_ = parsed as Record<string, unknown>;
            }
          } catch {
            arguments_ = { __invalidJson: raw };
          }
        } else if (raw) {
          arguments_ = raw;
        }
        return [{
          id: `ollama-${Date.now()}-${index}`,
          name,
          arguments: arguments_,
        }];
      },
    );
    if (!content && toolCalls.length === 0) {
      throw new Error("The local model returned an empty response.");
    }
    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      usage: {
        ...(payload.prompt_eval_count !== undefined ? { input: payload.prompt_eval_count } : {}),
        ...(payload.eval_count !== undefined ? { output: payload.eval_count } : {}),
      },
    };
  }

  async discoverModels(provider: ProviderDefinition): Promise<ModelDefinition[]> {
    const response = await fetch(`${provider.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const payload = (await response.json()) as OllamaTagsResponse;
    return (payload.models || [])
      .map((item) => item.name || item.model)
      .filter((id): id is string => Boolean(id))
      .map((id, index) => ({
        id,
        displayName: id,
        providerId: provider.id,
        cost: "local" as const,
        priority: 70 - Math.min(index, 20),
        capabilities: ["chat", "coding", "tools"] as ModelDefinition["capabilities"],
      }));
  }

  async healthcheck(provider: ProviderDefinition): Promise<boolean> {
    try {
      const response = await fetch(`${provider.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(1_500),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
