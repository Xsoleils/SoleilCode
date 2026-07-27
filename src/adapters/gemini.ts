import type {
  ChatRequest,
  ChatResponse,
  ProviderAdapter,
  ProviderDefinition,
} from "../types.js";
import { ProviderRequestError } from "./provider-error.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

export class GeminiAdapter implements ProviderAdapter {
  readonly kind = "gemini" as const;

  async chat(provider: ProviderDefinition, request: ChatRequest): Promise<ChatResponse> {
    if (!provider.apiKey) throw new Error("Gemini API key is missing.");

    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const url =
      `${provider.baseUrl}/models/${encodeURIComponent(request.model.id)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "SoleilCode/0.4",
        "x-goog-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 4096,
          responseMimeType: "application/json",
        },
      }),
      ...(request.signal ? { signal: request.signal } : {}),
    });

    const raw = await response.text();
    let payload: GeminiResponse;
    try {
      payload = JSON.parse(raw) as GeminiResponse;
    } catch {
      throw new Error(`Invalid Gemini response (${response.status}): ${raw.slice(0, 300)}`);
    }
    if (!response.ok) {
      throw new ProviderRequestError(
        payload.error?.message || `HTTP ${response.status}`,
        response.status,
        response.headers.get("retry-after"),
      );
    }

    const content = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!content) throw new Error("Gemini returned an empty response.");

    const input = payload.usageMetadata?.promptTokenCount;
    const output = payload.usageMetadata?.candidatesTokenCount;
    return {
      content,
      ...(input !== undefined || output !== undefined
        ? { usage: { ...(input !== undefined ? { input } : {}), ...(output !== undefined ? { output } : {}) } }
        : {}),
    };
  }
}
