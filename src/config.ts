import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CredentialVault, type StoredCredential } from "./credentials/vault.js";
import type {
  ModelDefinition,
  ProviderDefinition,
  ProviderKind,
  SoleilConfig,
  SoleilMode,
  TaskKind,
} from "./types.js";

interface PartialConfig {
  mode?: SoleilMode;
  approval?: "ask" | "always";
  maxAgentSteps?: number;
  commandTimeoutMs?: number;
  providers?: Array<{
    id: string;
    displayName?: string;
    kind: ProviderKind;
    baseUrl: string;
    apiKeyEnv?: string;
    enabled?: boolean;
    models: Array<{
      id: string;
      displayName?: string;
      cost?: "free" | "local";
      contextWindow?: number;
      priority?: number;
      capabilities?: ModelDefinition["capabilities"];
    }>;
  }>;
}

const DEFAULT_CONFIG: Omit<SoleilConfig, "providers"> = {
  mode: "auto",
  approval: "ask",
  maxAgentSteps: 12,
  commandTimeoutMs: 120_000,
};

function model(
  providerId: string,
  id: string,
  displayName: string,
  cost: "free" | "local",
  priority: number,
  strengths: TaskKind[] = [],
): ModelDefinition {
  return {
    id,
    displayName,
    providerId,
    cost,
    priority,
    capabilities: ["chat", "coding", "tools"],
    ...(strengths.length ? { strengths } : {}),
  };
}

function groqProvider(
  id: string,
  label: string,
  apiKey: string,
  requestedModel?: string,
): ProviderDefinition {
  const models = requestedModel
    ? [
        model(
          id,
          requestedModel,
          requestedModel,
          "free",
          95,
          ["chat", "explore", "edit", "debug", "review", "test"],
        ),
      ]
    : [
        model(id, "qwen/qwen3.6-27b", "Qwen 3.6 27B", "free", 95, [
          "edit",
          "debug",
          "test",
        ]),
        model(id, "openai/gpt-oss-120b", "GPT-OSS 120B", "free", 90, [
          "debug",
          "review",
          "explore",
          "long-context",
        ]),
        model(id, "openai/gpt-oss-20b", "GPT-OSS 20B", "free", 80, [
          "chat",
          "test",
          "edit",
        ]),
      ];
  return {
    id,
    displayName: `Groq · ${label}`,
    kind: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey,
    enabled: true,
    models,
  };
}

function geminiProvider(
  id: string,
  label: string,
  apiKey: string,
  requestedModel?: string,
): ProviderDefinition {
  const models = requestedModel
    ? [
        model(
          id,
          requestedModel,
          requestedModel,
          "free",
          92,
          ["chat", "explore", "edit", "debug", "review", "test", "long-context"],
        ),
      ]
    : [
        model(id, "gemini-3.6-flash", "Gemini 3.6 Flash", "free", 94, [
          "edit",
          "debug",
          "review",
          "long-context",
        ]),
        model(id, "gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", "free", 82, [
          "chat",
          "explore",
          "test",
        ]),
      ];
  return {
    id,
    displayName: `Gemini · ${label}`,
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey,
    enabled: true,
    models,
  };
}

function openRouterProvider(
  id: string,
  label: string,
  apiKey: string,
  requestedModel?: string,
): ProviderDefinition {
  const selectedModel = requestedModel || "openrouter/free";
  return {
    id,
    displayName: `OpenRouter · ${label}`,
    kind: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey,
    enabled: true,
    models: [
      model(
        id,
        selectedModel,
        selectedModel,
        "free",
        75,
        ["chat", "explore", "edit", "debug", "review", "test", "long-context"],
      ),
    ],
  };
}

function providerFromEnvironment(credentials: StoredCredential[]): ProviderDefinition[] {
  const providers: ProviderDefinition[] = [];
  const seenSecrets = new Set<string>();

  const genericModel = process.env.SOLEIL_MODEL?.trim();
  const genericBaseUrl = process.env.SOLEIL_BASE_URL?.trim();
  if (genericModel && genericBaseUrl) {
    providers.push({
      id: "custom",
      displayName: "Özel OpenAI Uyumlu Sunucu",
      kind: "openai-compatible",
      baseUrl: genericBaseUrl,
      ...(process.env.SOLEIL_API_KEY?.trim()
        ? { apiKey: process.env.SOLEIL_API_KEY.trim() }
        : {}),
      enabled: true,
      models: [
        model(
          "custom",
          genericModel,
          genericModel,
          "free",
          80,
          ["chat", "explore", "edit", "debug", "review", "test", "long-context"],
        ),
      ],
    });
  }

  const environmentProviders: Array<{
    provider: StoredCredential["provider"];
    secret: string | undefined;
    factory: (id: string, label: string, secret: string) => ProviderDefinition;
  }> = [
    {
      provider: "groq",
      secret: process.env.GROQ_API_KEY?.trim(),
      factory: (id, label, secret) =>
        groqProvider(id, label, secret, process.env.GROQ_MODEL?.trim()),
    },
    {
      provider: "gemini",
      secret: process.env.GEMINI_API_KEY?.trim(),
      factory: (id, label, secret) =>
        geminiProvider(id, label, secret, process.env.GEMINI_MODEL?.trim()),
    },
    {
      provider: "openrouter",
      secret: process.env.OPENROUTER_API_KEY?.trim(),
      factory: (id, label, secret) =>
        openRouterProvider(id, label, secret, process.env.OPENROUTER_MODEL?.trim()),
    },
  ];

  for (const entry of environmentProviders) {
    if (!entry.secret) continue;
    seenSecrets.add(entry.secret);
    providers.push(entry.factory(`${entry.provider}-env`, "CMD ortamı", entry.secret));
  }

  for (const credential of credentials) {
    if (seenSecrets.has(credential.secret)) continue;
    seenSecrets.add(credential.secret);
    const id = `${credential.provider}-${credential.id}`;
    if (credential.provider === "groq") {
      providers.push(groqProvider(id, credential.label, credential.secret));
    } else if (credential.provider === "gemini") {
      providers.push(geminiProvider(id, credential.label, credential.secret));
    } else {
      providers.push(openRouterProvider(id, credential.label, credential.secret));
    }
  }

  const ollamaModel = process.env.OLLAMA_MODEL?.trim();
  providers.push({
    id: "ollama",
    displayName: "Ollama Yerel",
    kind: "ollama",
    baseUrl: process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
    enabled: true,
    models: ollamaModel
      ? [
          model(
            "ollama",
            ollamaModel,
            ollamaModel,
            "local",
            70,
            ["chat", "explore", "edit", "debug", "review", "test", "long-context"],
          ),
        ]
      : [],
  });

  return providers;
}

async function readJsonConfig(filePath: string): Promise<PartialConfig | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as PartialConfig;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw new Error(`${filePath} okunamadı: ${error instanceof Error ? error.message : error}`);
  }
}

function normalizeProvider(
  input: NonNullable<PartialConfig["providers"]>[number],
): ProviderDefinition {
  const apiKey = input.apiKeyEnv ? process.env[input.apiKeyEnv]?.trim() : undefined;
  return {
    id: input.id,
    displayName: input.displayName || input.id,
    kind: input.kind,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    ...(apiKey ? { apiKey } : {}),
    enabled: input.enabled !== false,
    models: input.models.map((item) => ({
      id: item.id,
      displayName: item.displayName || item.id,
      providerId: input.id,
      cost: item.cost || (input.kind === "ollama" ? "local" : "free"),
      priority: item.priority ?? 50,
      capabilities: item.capabilities || ["chat", "coding", "tools"],
      ...(item.contextWindow ? { contextWindow: item.contextWindow } : {}),
    })),
  };
}

function mergeProviders(
  base: ProviderDefinition[],
  configured: PartialConfig["providers"],
): ProviderDefinition[] {
  if (!configured?.length) return base;
  const merged = new Map(base.map((item) => [item.id, item]));
  for (const input of configured) merged.set(input.id, normalizeProvider(input));
  return [...merged.values()];
}

export async function loadConfig(
  cwd: string,
  vault = new CredentialVault(),
): Promise<SoleilConfig> {
  const globalPath = path.join(homedir(), ".soleilcode", "config.json");
  const projectPath = path.join(cwd, ".soleilcode.json");
  const globalConfig = await readJsonConfig(globalPath);
  const projectConfig = await readJsonConfig(projectPath);
  const combined = { ...globalConfig, ...projectConfig };

  const credentials = await vault.list();
  let providers = providerFromEnvironment(credentials);
  providers = mergeProviders(providers, globalConfig?.providers);
  providers = mergeProviders(providers, projectConfig?.providers);

  return {
    mode: combined.mode || DEFAULT_CONFIG.mode,
    approval: combined.approval || DEFAULT_CONFIG.approval,
    maxAgentSteps: combined.maxAgentSteps || DEFAULT_CONFIG.maxAgentSteps,
    commandTimeoutMs: combined.commandTimeoutMs || DEFAULT_CONFIG.commandTimeoutMs,
    providers,
  };
}
