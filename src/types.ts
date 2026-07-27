export type SoleilMode = "auto" | "free" | "local" | "private";

export type ProviderKind = "openai-compatible" | "gemini" | "ollama";

export type ModelCost = "free" | "local";

export type TaskKind =
  | "chat"
  | "explore"
  | "edit"
  | "debug"
  | "review"
  | "test"
  | "long-context";

export interface ModelDefinition {
  id: string;
  displayName: string;
  providerId: string;
  cost: ModelCost;
  contextWindow?: number;
  priority: number;
  capabilities: Array<"chat" | "coding" | "tools" | "long-context">;
  strengths?: TaskKind[];
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  models: ModelDefinition[];
  enabled: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: ModelDefinition;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  input?: number;
  output?: number;
}

export interface ChatResponse {
  content: string;
  usage?: TokenUsage;
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  chat(provider: ProviderDefinition, request: ChatRequest): Promise<ChatResponse>;
  discoverModels?(provider: ProviderDefinition): Promise<ModelDefinition[]>;
  healthcheck?(provider: ProviderDefinition): Promise<boolean>;
}

export interface ModelRuntimeState {
  failures: number;
  successes: number;
  totalLatencyMs: number;
  cooldownUntil: number;
  lastError?: string;
}

export interface RelayDecision {
  provider: ProviderDefinition;
  model: ModelDefinition;
  score: number;
  reason: string;
}

export interface RelayResult extends ChatResponse {
  decision: RelayDecision;
  attempts: Array<{
    providerId: string;
    modelId: string;
    ok: boolean;
    error?: string;
  }>;
}

export interface SoleilConfig {
  mode: SoleilMode;
  approval: "ask" | "always";
  maxAgentSteps: number;
  commandTimeoutMs: number;
  providers: ProviderDefinition[];
}

export interface ToolCall {
  type: "tool";
  tool: string;
  arguments: Record<string, unknown>;
  reason?: string;
}

export interface FinalAnswer {
  type: "final";
  message: string;
}

export type AgentAction = ToolCall | FinalAnswer;

export interface ToolResult {
  ok: boolean;
  output: string;
  denied?: boolean;
}
