import { GeminiAdapter } from "../adapters/gemini.js";
import { OllamaAdapter } from "../adapters/ollama.js";
import { OpenAICompatibleAdapter } from "../adapters/openai-compatible.js";
import { ProviderRequestError } from "../adapters/provider-error.js";
import { translate, type SoleilLanguage } from "../i18n.js";
import type {
  ChatResponse,
  ChatMessage,
  ModelRuntimeState,
  ProviderAdapter,
  ProviderDefinition,
  RelayDecision,
  RelayResult,
  SoleilConfig,
  SoleilMode,
  TaskKind,
  ToolDefinition,
} from "../types.js";
import { taskLabel } from "./task-classifier.js";

const COOLDOWN_MS = 45_000;
const MAX_AUTOMATIC_RATE_LIMIT_WAIT_MS = 30_000;

function outputTokenBudget(task: TaskKind): number {
  if (task === "edit" || task === "long-context") return 4_096;
  if (task === "debug" || task === "review" || task === "test") return 3_072;
  return 2_048;
}

async function waitFor(
  milliseconds: number,
  signal?: AbortSignal,
  language: SoleilLanguage = "en",
): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve, reject) => {
    let timeout: NodeJS.Timeout;
    const finish = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(new Error(translate(language, "requestStopped")));
    };
    if (signal?.aborted) return abort();
    timeout = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class SoleilRelay {
  private readonly adapters = new Map<string, ProviderAdapter>();
  private readonly runtime = new Map<string, ModelRuntimeState>();

  constructor(private readonly config: SoleilConfig) {
    const adapters: ProviderAdapter[] = [
      new OpenAICompatibleAdapter(),
      new GeminiAdapter(),
      new OllamaAdapter(),
    ];
    for (const adapter of adapters) this.adapters.set(adapter.kind, adapter);
  }

  async initialize(): Promise<void> {
    await Promise.all(
      this.config.providers.map(async (provider) => {
        if (!provider.enabled || provider.models.length > 0) return;
        const adapter = this.adapters.get(provider.kind);
        if (!adapter?.discoverModels) return;
        try {
          provider.models = await adapter.discoverModels(provider);
        } catch {
          provider.models = [];
        }
      }),
    );
  }

  getProviders(): ProviderDefinition[] {
    return this.config.providers;
  }

  getMode(): SoleilMode {
    return this.config.mode;
  }

  setMode(mode: SoleilMode): void {
    this.config.mode = mode;
  }

  setLanguage(language: SoleilLanguage): void {
    this.config.language = language;
  }

  getRuntimeState(providerId: string, modelId: string): ModelRuntimeState {
    return this.stateFor(providerId, modelId);
  }

  private stateKey(providerId: string, modelId: string): string {
    return `${providerId}:${modelId}`;
  }

  private stateFor(providerId: string, modelId: string): ModelRuntimeState {
    const key = this.stateKey(providerId, modelId);
    let state = this.runtime.get(key);
    if (!state) {
      state = { failures: 0, successes: 0, totalLatencyMs: 0, cooldownUntil: 0 };
      this.runtime.set(key, state);
    }
    return state;
  }

  private decisions(task: TaskKind): RelayDecision[] {
    const now = Date.now();
    const result: RelayDecision[] = [];

    for (const provider of this.config.providers) {
      if (!provider.enabled) continue;
      for (const model of provider.models) {
        if (this.config.mode === "local" && model.cost !== "local") continue;
        if (this.config.mode === "private" && model.cost !== "local") continue;
        if (model.cost !== "free" && model.cost !== "local") continue;

        const state = this.stateFor(provider.id, model.id);
        if (state.cooldownUntil > now) continue;

        const successRate =
          state.successes + state.failures === 0
            ? 1
            : state.successes / (state.successes + state.failures);
        const latencyPenalty =
          state.successes === 0 ? 0 : Math.min(state.totalLatencyMs / state.successes / 1_000, 20);
        const localBonus =
          (this.config.mode === "local" || this.config.mode === "private") && model.cost === "local"
            ? 30
            : 0;
        const taskBonus = model.strengths?.includes(task) ? 24 : 0;
        const score =
          model.priority + successRate * 20 + localBonus + taskBonus - latencyPenalty;
        const reason =
          model.cost === "local"
            ? translate(this.config.language, "localReason", {
                task: taskLabel(task, this.config.language),
              })
            : translate(this.config.language, "freeReason", {
                task: taskLabel(task, this.config.language),
              });
        result.push({ provider, model, score, reason });
      }
    }

    return result.sort((a, b) => b.score - a.score);
  }

  async chat(
    messages: ChatMessage[],
    signal?: AbortSignal,
    task: TaskKind = "chat",
    tools: ToolDefinition[] = [],
  ): Promise<RelayResult> {
    const candidates = this.decisions(task);
    if (candidates.length === 0) {
      throw new Error(
        this.config.mode === "local" || this.config.mode === "private"
          ? translate(this.config.language, "noLocalModel")
          : translate(this.config.language, "noFreeModel"),
      );
    }

    const attempts: RelayResult["attempts"] = [];
    let lastError: Error | undefined;
    let retryCandidate:
      | { decision: RelayDecision; readyAt: number }
      | undefined;

    const attempt = async (decision: RelayDecision): Promise<ChatResponse | undefined> => {
      const adapter = this.adapters.get(decision.provider.kind);
      if (!adapter) return undefined;
      const startedAt = Date.now();
      const state = this.stateFor(decision.provider.id, decision.model.id);
      try {
        const supportedTools = decision.model.capabilities.includes("tools")
          ? tools
          : [];
        const request = {
          model: decision.model,
          messages,
          ...(supportedTools.length
            ? { tools: supportedTools, toolChoice: "auto" as const }
            : {}),
          temperature: 0.15,
          maxTokens: outputTokenBudget(task),
          ...(signal ? { signal } : {}),
        };
        let response: ChatResponse;
        try {
          response = await adapter.chat(decision.provider, request);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (
            supportedTools.length &&
            /\b(tool|tools|function calling|parallel_tool|function declaration)\b/i.test(message)
          ) {
            const { tools: _tools, toolChoice: _toolChoice, ...fallbackRequest } = request;
            response = await adapter.chat(decision.provider, fallbackRequest);
          } else {
            throw error;
          }
        }
        state.successes += 1;
        state.totalLatencyMs += Date.now() - startedAt;
        delete state.lastError;
        attempts.push({
          providerId: decision.provider.id,
          modelId: decision.model.id,
          ok: true,
        });
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        state.failures += 1;
        state.lastError = lastError.message;
        const retryAfterMs =
          lastError instanceof ProviderRequestError && lastError.status === 429
            ? lastError.retryAfterMs
            : undefined;
        state.cooldownUntil = Date.now() + (retryAfterMs ?? COOLDOWN_MS);
        if (
          retryAfterMs !== undefined &&
          retryAfterMs <= MAX_AUTOMATIC_RATE_LIMIT_WAIT_MS &&
          (!retryCandidate || state.cooldownUntil < retryCandidate.readyAt)
        ) {
          retryCandidate = { decision, readyAt: state.cooldownUntil };
        }
        attempts.push({
          providerId: decision.provider.id,
          modelId: decision.model.id,
          ok: false,
          error: lastError.message,
        });
        return undefined;
      }
    };

    for (const decision of candidates) {
      const response = await attempt(decision);
      if (response) return { ...response, decision, attempts };
    }

    if (retryCandidate) {
      const candidate = retryCandidate;
      await waitFor(
        Math.max(0, candidate.readyAt - Date.now()) + 250,
        signal,
        this.config.language,
      );
      const state = this.stateFor(candidate.decision.provider.id, candidate.decision.model.id);
      state.cooldownUntil = 0;
      const response = await attempt(candidate.decision);
      if (response) return { ...response, decision: candidate.decision, attempts };
    }

    throw new Error(translate(this.config.language, "allModelsFailed", {
      error: lastError?.message || translate(this.config.language, "unknownError"),
    }));
  }
}
