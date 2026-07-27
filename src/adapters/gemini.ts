import type {
  ChatRequest,
  ChatResponse,
  NativeToolCall,
  ProviderAdapter,
  ProviderDefinition,
} from "../types.js";
import { ProviderRequestError } from "./provider-error.js";

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: { message?: string };
}

function cleanGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanGeminiSchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, item]) => [key, cleanGeminiSchema(item)]),
  );
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
      .map((message) => {
        if (message.role === "tool") {
          let response: unknown = message.content;
          try {
            response = JSON.parse(message.content) as unknown;
          } catch {
            // Gemini accepts a string result inside the response object.
          }
          return {
            role: "user",
            parts: [{
              functionResponse: {
                name: message.name || "tool",
                response: { output: response },
              },
            }],
          };
        }
        if (message.role === "assistant" && message.toolCalls?.length) {
          return {
            role: "model",
            parts: [
              ...(message.content ? [{ text: message.content }] : []),
              ...message.toolCalls.map((call) => ({
                functionCall: { name: call.name, args: call.arguments },
              })),
            ],
          };
        }
        return {
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        };
      });

    const url =
      `${provider.baseUrl}/models/${encodeURIComponent(request.model.id)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "SoleilCode/0.5",
        "x-goog-api-key": provider.apiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        ...(request.tools?.length
          ? {
              tools: [{
                functionDeclarations: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parameters: cleanGeminiSchema(tool.parameters),
                })),
              }],
              toolConfig: {
                functionCallingConfig: {
                  mode: request.toolChoice === "none" ? "NONE" : "AUTO",
                },
              },
            }
          : {}),
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 4096,
          ...(!request.tools?.length ? { responseMimeType: "application/json" } : {}),
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

    const parts = payload.candidates?.[0]?.content?.parts || [];
    const content = parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    const toolCalls: NativeToolCall[] = parts.flatMap((part, index) => {
      const name = part.functionCall?.name;
      if (!name) return [];
      return [{
        id: `gemini-${Date.now()}-${index}`,
        name,
        arguments: part.functionCall?.args || {},
      }];
    });
    if (!content && toolCalls.length === 0) throw new Error("Gemini returned an empty response.");

    const input = payload.usageMetadata?.promptTokenCount;
    const output = payload.usageMetadata?.candidatesTokenCount;
    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(input !== undefined || output !== undefined
        ? { usage: { ...(input !== undefined ? { input } : {}), ...(output !== undefined ? { output } : {}) } }
        : {}),
    };
  }
}
