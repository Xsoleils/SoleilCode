import type {
  ChatRequest,
  ChatResponse,
  NativeToolCall,
  ProviderAdapter,
  ProviderDefinition,
} from "../types.js";
import { ProviderRequestError } from "./provider-error.js";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
}

function requestMessage(message: ChatRequest["messages"][number]): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { name: message.name } : {}),
    };
  }
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function responseToolCalls(payload: OpenAIResponse): NativeToolCall[] {
  return (payload.choices?.[0]?.message?.tool_calls || []).flatMap((call, index) => {
    const name = call.function?.name;
    if (!name) return [];
    let arguments_: Record<string, unknown> = {};
    const raw = call.function?.arguments;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          arguments_ = parsed as Record<string, unknown>;
        }
      } catch {
        arguments_ = { __invalidJson: raw };
      }
    }
    return [{
      id: call.id || `tool-${Date.now()}-${index}`,
      name,
      arguments: arguments_,
    }];
  });
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly kind = "openai-compatible" as const;

  async chat(provider: ProviderDefinition, request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        "user-agent": "SoleilCode/0.5",
      },
      body: JSON.stringify({
        model: request.model.id,
        messages: request.messages.map(requestMessage),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: "function",
                function: tool,
              })),
              tool_choice: request.toolChoice || "auto",
              parallel_tool_calls: false,
            }
          : {}),
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096,
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });

    const raw = await response.text();
    let payload: OpenAIResponse;
    try {
      payload = JSON.parse(raw) as OpenAIResponse;
    } catch {
      throw new Error(`Invalid provider response (${response.status}): ${raw.slice(0, 300)}`);
    }

    if (!response.ok) {
      throw new ProviderRequestError(
        payload.error?.message || `HTTP ${response.status}`,
        response.status,
        response.headers.get("retry-after"),
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim() || "";
    const toolCalls = responseToolCalls(payload);
    if (!content && toolCalls.length === 0) {
      throw new Error("The model returned an empty response.");
    }

    const input = payload.usage?.prompt_tokens;
    const output = payload.usage?.completion_tokens;
    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(input !== undefined || output !== undefined
        ? { usage: { ...(input !== undefined ? { input } : {}), ...(output !== undefined ? { output } : {}) } }
        : {}),
    };
  }
}
