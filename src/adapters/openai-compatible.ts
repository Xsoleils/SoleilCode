import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderDefinition,
} from "../types.js";
import { ProviderRequestError } from "./provider-error.js";

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly kind = "openai-compatible" as const;

  async chat(provider: ProviderDefinition, request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
        "user-agent": "SoleilCode/0.3",
      },
      body: JSON.stringify({
        model: request.model.id,
        messages: request.messages,
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

    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("The model returned an empty response.");

    const input = payload.usage?.prompt_tokens;
    const output = payload.usage?.completion_tokens;
    return {
      content,
      ...(input !== undefined || output !== undefined
        ? { usage: { ...(input !== undefined ? { input } : {}), ...(output !== undefined ? { output } : {}) } }
        : {}),
    };
  }
}
