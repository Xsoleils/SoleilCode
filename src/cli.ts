#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { SoleilAgent } from "./agent/agent.js";
import { loadConfig, saveGlobalLanguage } from "./config.js";
import { CredentialVault } from "./credentials/vault.js";
import { catalogLines, FREE_CATALOG_VERIFIED_AT } from "./free-catalog.js";
import {
  isSupportedLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  translate,
  type SoleilLanguage,
} from "./i18n.js";
import { SoleilRelay } from "./relay/relay.js";
import { runLanguagePicker } from "./setup/language-picker.js";
import { runSetupCenter, tokenLines } from "./setup/setup-center.js";
import { ToolManager } from "./tools/tool-manager.js";
import type { SoleilMode } from "./types.js";
import { TerminalUI } from "./ui.js";

const VERSION = "0.3.0";
const MODES = new Set<SoleilMode>(["auto", "free", "local", "private"]);

interface CliOptions {
  cwd: string;
  autoApprove: boolean;
  mode?: SoleilMode;
  language?: SoleilLanguage;
  command?: "help" | "version" | "doctor" | "setup" | "language";
}

function parseArguments(argv: string[]): CliOptions {
  let cwd = process.cwd();
  let autoApprove = false;
  let mode: SoleilMode | undefined;
  let language: SoleilLanguage | undefined;
  let command: CliOptions["command"];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") command = "help";
    else if (value === "--version" || value === "-v") command = "version";
    else if (value === "doctor") command = "doctor";
    else if (value === "setup") command = "setup";
    else if (value === "language" || value === "languages") command = "language";
    else if (value === "--yes" || value === "-y") autoApprove = true;
    else if (value === "--cwd") {
      const next = argv[index + 1];
      if (!next) throw new Error("--cwd requires a project directory.");
      cwd = path.resolve(next);
      index += 1;
    } else if (value === "--mode") {
      const next = argv[index + 1] as SoleilMode | undefined;
      if (!next || !MODES.has(next)) {
        throw new Error("--mode must be auto, free, local, or private.");
      }
      mode = next;
      index += 1;
    } else if (value === "--language" || value === "--lang") {
      const next = argv[index + 1]?.toLowerCase();
      if (!isSupportedLanguage(next)) {
        throw new Error(
          `--language must be one of: ${SUPPORTED_LANGUAGES.join(", ")}.`,
        );
      }
      language = next;
      index += 1;
    }
  }

  return {
    cwd,
    autoApprove,
    ...(mode ? { mode } : {}),
    ...(language ? { language } : {}),
    ...(command ? { command } : {}),
  };
}

function printHelp(language: SoleilLanguage): void {
  const tr = (
    key: Parameters<typeof translate>[1],
    variables: Record<string, string | number> = {},
  ): string => translate(language, key, variables);

  console.log(`SoleilCode ${VERSION}

Usage:
  soleil [--cwd DIRECTORY] [--mode MODE] [--language CODE] [--yes]
  soleil doctor
  soleil setup
  soleil language

Commands:
  doctor            Check providers and discovered models
  setup             Open the free-model and token center
  language          Choose and save the interface language

Options:
  --cwd DIRECTORY   Project directory to work in
  --mode MODE       auto, free, local, or private
  --language CODE   ${SUPPORTED_LANGUAGES.join(", ")}
  --yes, -y         Automatically approve file and command operations
  --version, -v     Show the version
  --help, -h        Show help

Interactive:
  /help             ${tr("helpCommands")}
  /models           ${tr("helpModels")}
  /status           ${tr("helpStatus")}
  /setup            ${tr("helpSetup")}
  /tokens           ${tr("helpTokens")}
  /free             ${tr("helpFree")}
  /language         ${tr("helpLanguage")}
  /mode MODE        ${tr("helpMode")}
  /clear            ${tr("helpClear")}
  /exit             ${tr("helpExit")}

Environment:
  SOLEIL_BASE_URL, SOLEIL_API_KEY, SOLEIL_MODEL
  GROQ_API_KEY, GROQ_MODEL
  OPENROUTER_API_KEY, OPENROUTER_MODEL
  GEMINI_API_KEY, GEMINI_MODEL
  OLLAMA_BASE_URL, OLLAMA_MODEL
  SOLEILCODE_HOME`);
}

function modelLines(
  relay: SoleilRelay,
  language: SoleilLanguage,
): string[] {
  const lines: string[] = [];
  for (const provider of relay.getProviders()) {
    if (!provider.models.length) {
      lines.push(
        `- ${provider.displayName}: ${translate(language, "noModelsFound")}`,
      );
      continue;
    }
    for (const model of provider.models) {
      const state = relay.getRuntimeState(provider.id, model.id);
      const health =
        state.cooldownUntil > Date.now()
          ? translate(language, "coolingDown")
          : translate(language, "ready");
      lines.push(
        `- ${provider.displayName} / ${model.displayName} · ${model.cost} · ${health}`,
      );
    }
  }
  return lines;
}

async function doctor(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  if (options.mode) config.mode = options.mode;
  if (options.language) config.language = options.language;
  const relay = new SoleilRelay(config);
  await relay.initialize();
  console.log(
    translate(config.language, "doctorTitle", { version: VERSION }),
  );
  console.log(
    `${translate(config.language, "projectLabel")}: ${options.cwd}`,
  );
  console.log(
    `${translate(config.language, "modeLabel")}: ${relay.getMode()}`,
  );
  console.log(modelLines(relay, config.language).join("\n"));
  const count = relay
    .getProviders()
    .reduce((sum, provider) => sum + provider.models.length, 0);
  if (count === 0) {
    console.log(`\n${translate(config.language, "noModels")}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${translate(config.language, "modelsReady", { count })}.`);
  }
}

async function setup(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  if (options.language) config.language = options.language;
  const relay = new SoleilRelay(config);
  await relay.initialize();
  const modelCount = relay
    .getProviders()
    .reduce((sum, provider) => sum + provider.models.length, 0);
  const ui = new TerminalUI(config.language);
  ui.banner(options.cwd, config.mode, modelCount);
  try {
    const changed = await runSetupCenter(ui);
    if (changed) ui.answer(ui.text("tokenVaultUpdated"));
  } finally {
    ui.close();
  }
}

async function language(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  const ui = new TerminalUI(options.language || config.language);
  ui.banner(options.cwd, config.mode, 0);
  try {
    await runLanguagePicker(ui);
  } finally {
    ui.close();
  }
}

async function interactive(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  if (options.mode) config.mode = options.mode;
  if (options.language) config.language = options.language;

  const relay = new SoleilRelay(config);
  await relay.initialize();
  const ui = new TerminalUI(config.language);
  let activeController: AbortController | undefined;
  const tools = new ToolManager(
    options.cwd,
    (question, preview) => ui.confirm(question, preview),
    options.autoApprove || config.approval === "always",
    config.commandTimeoutMs,
  );
  const agent = new SoleilAgent(
    options.cwd,
    relay,
    tools,
    config.maxAgentSteps,
    {
      onThinking: () => ui.startThinking(),
      onModelSelected: (result) =>
        ui.model(
          result.decision.provider.displayName,
          result.decision.model.displayName,
          result.decision.reason,
        ),
      onTool: (name, reason) => ui.tool(name, reason),
      onToolResult: (_name, result) => ui.toolResult(result.ok, result.output),
    },
    config.language,
  );

  const syncLanguage = (next: SoleilLanguage): void => {
    config.language = next;
    relay.setLanguage(next);
    agent.setLanguage(next);
  };

  const onSigint = (): void => {
    if (activeController) {
      activeController.abort();
      activeController = undefined;
      ui.info(`\n${ui.text("operationStopped")}`);
    }
  };
  process.on("SIGINT", onSigint);

  const modelCount = relay
    .getProviders()
    .reduce((sum, provider) => sum + provider.models.length, 0);
  ui.banner(options.cwd, relay.getMode(), modelCount);
  if (modelCount === 0) ui.info(ui.text("connectModel"));

  try {
    while (true) {
      const input = await ui.prompt();
      if (!input) continue;
      if (input === "/exit" || input === "/quit") break;

      if (input === "/help") {
        ui.answer(`/help          ${ui.text("helpCommands")}
/models        ${ui.text("helpModels")}
/status        ${ui.text("helpStatus")}
/setup         ${ui.text("helpSetup")}
/tokens        ${ui.text("helpTokens")}
/free          ${ui.text("helpFree")}
/language      ${ui.text("helpLanguage")}
/mode MODE      ${ui.text("helpMode")}
/clear         ${ui.text("helpClear")}
/exit          ${ui.text("helpExit")}`);
        continue;
      }

      if (input === "/language") {
        const selected = await runLanguagePicker(ui);
        if (selected) syncLanguage(selected);
        continue;
      }

      if (input.startsWith("/language ")) {
        const requested = input.slice(10).trim().toLowerCase();
        if (!isSupportedLanguage(requested)) {
          ui.error(
            ui.text("languageCodeInvalid", {
              codes: SUPPORTED_LANGUAGES.join(", "),
            }),
          );
        } else {
          await saveGlobalLanguage(requested);
          ui.setLanguage(requested);
          syncLanguage(requested);
          ui.info(
            ui.text("languageChanged", {
              language: LANGUAGE_NAMES[requested],
            }),
          );
          ui.info(ui.text("languageSaved"));
        }
        continue;
      }

      if (input === "/setup") {
        const changed = await runSetupCenter(ui);
        syncLanguage(ui.getLanguage());
        if (changed) ui.info(ui.text("reloadTokens"));
        continue;
      }

      if (input === "/tokens") {
        ui.section(
          ui.text("connectedTokens"),
          tokenLines(await new CredentialVault().list(), ui.getLanguage()),
        );
        continue;
      }

      if (input === "/free") {
        const credentials = await new CredentialVault().list();
        ui.section(
          ui.text("freeOptions", { date: FREE_CATALOG_VERIFIED_AT }),
          [
            ...catalogLines(credentials, ui.getLanguage()),
            "",
            ui.text("quotaNotice"),
          ],
        );
        continue;
      }

      if (input === "/models" || input === "/status") {
        ui.answer(
          `SoleilRelay · ${ui.text("modeLabel").toLowerCase()}: ${relay.getMode()}\n${modelLines(relay, ui.getLanguage()).join("\n")}`,
        );
        continue;
      }

      if (input === "/clear") {
        agent.clear();
        ui.info(ui.text("conversationCleared"));
        continue;
      }

      if (input.startsWith("/mode ")) {
        const requested = input.slice(6).trim() as SoleilMode;
        if (!MODES.has(requested)) {
          ui.error(ui.text("invalidMode"));
        } else {
          relay.setMode(requested);
          ui.updateMode(requested);
          ui.info(ui.text("modeChanged", { mode: requested }));
        }
        continue;
      }

      if (input.startsWith("/")) {
        ui.error(ui.text("unknownCommand"));
        continue;
      }

      try {
        activeController = new AbortController();
        const answer = await agent.run(input, activeController.signal);
        activeController = undefined;
        ui.answer(answer);
      } catch (error) {
        activeController = undefined;
        ui.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    process.off("SIGINT", onSigint);
    ui.close();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "version") return console.log(VERSION);

  const config = await loadConfig(options.cwd);
  const selectedLanguage = options.language || config.language;
  if (options.command === "help") return printHelp(selectedLanguage);
  if (options.command === "doctor") return doctor(options);
  if (options.command === "setup") return setup(options);
  if (options.command === "language") return language(options);
  await interactive(options);
}

main().catch((error) => {
  console.error(
    `SoleilCode could not start: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
