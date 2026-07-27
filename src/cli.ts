#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { SoleilAgent } from "./agent/agent.js";
import { loadConfig } from "./config.js";
import { SoleilRelay } from "./relay/relay.js";
import { ToolManager } from "./tools/tool-manager.js";
import type { SoleilMode } from "./types.js";
import { TerminalUI } from "./ui.js";
import { CredentialVault } from "./credentials/vault.js";
import { catalogLines, FREE_CATALOG_VERIFIED_AT } from "./free-catalog.js";
import { runSetupCenter, tokenLines } from "./setup/setup-center.js";

const VERSION = "0.2.0";
const MODES = new Set<SoleilMode>(["auto", "free", "local", "private"]);

interface CliOptions {
  cwd: string;
  autoApprove: boolean;
  mode?: SoleilMode;
  command?: "help" | "version" | "doctor" | "setup";
}

function parseArguments(argv: string[]): CliOptions {
  let cwd = process.cwd();
  let autoApprove = false;
  let mode: SoleilMode | undefined;
  let command: CliOptions["command"];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") command = "help";
    else if (value === "--version" || value === "-v") command = "version";
    else if (value === "doctor") command = "doctor";
    else if (value === "setup") command = "setup";
    else if (value === "--yes" || value === "-y") autoApprove = true;
    else if (value === "--cwd") {
      const next = argv[index + 1];
      if (!next) throw new Error("--cwd için bir klasör gerekli.");
      cwd = path.resolve(next);
      index += 1;
    } else if (value === "--mode") {
      const next = argv[index + 1] as SoleilMode | undefined;
      if (!next || !MODES.has(next)) throw new Error("--mode: auto, free, local veya private olmalı.");
      mode = next;
      index += 1;
    }
  }
  return { cwd, autoApprove, ...(mode ? { mode } : {}), ...(command ? { command } : {}) };
}

function printHelp(): void {
  console.log(`SoleilCode ${VERSION}

Kullanım:
  soleil [--cwd KLASÖR] [--mode MOD] [--yes]
  soleil doctor
  soleil setup

Seçenekler:
  --cwd KLASÖR    Çalışılacak proje klasörü
  --mode MOD      auto, free, local veya private
  --yes, -y       Dosya ve komut işlemlerini otomatik onayla
  --version, -v   Sürümü göster
  --help, -h      Yardımı göster

Ortam değişkenleri:
  SOLEIL_BASE_URL, SOLEIL_API_KEY, SOLEIL_MODEL
  GROQ_API_KEY, GROQ_MODEL
  OPENROUTER_API_KEY, OPENROUTER_MODEL
  GEMINI_API_KEY, GEMINI_MODEL
  OLLAMA_BASE_URL, OLLAMA_MODEL`);
}

function modelLines(relay: SoleilRelay): string[] {
  const lines: string[] = [];
  for (const provider of relay.getProviders()) {
    if (!provider.models.length) {
      lines.push(`- ${provider.displayName}: model bulunamadı`);
      continue;
    }
    for (const model of provider.models) {
      const state = relay.getRuntimeState(provider.id, model.id);
      const health = state.cooldownUntil > Date.now() ? "dinleniyor" : "hazır";
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
  const relay = new SoleilRelay(config);
  await relay.initialize();
  console.log(`SoleilCode ${VERSION} sistem kontrolü`);
  console.log(`Proje: ${options.cwd}`);
  console.log(`Mod: ${relay.getMode()}`);
  console.log(modelLines(relay).join("\n"));
  const count = relay.getProviders().reduce((sum, provider) => sum + provider.models.length, 0);
  if (count === 0) {
    console.log("\nKullanılabilir model yok. Ollama başlatın veya ücretsiz sağlayıcı ayarlayın.");
    process.exitCode = 1;
  } else {
    console.log(`\n${count} model hazır.`);
  }
}

async function setup(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  const relay = new SoleilRelay(config);
  await relay.initialize();
  const modelCount = relay
    .getProviders()
    .reduce((sum, provider) => sum + provider.models.length, 0);
  const ui = new TerminalUI();
  ui.banner(options.cwd, config.mode, modelCount);
  try {
    const changed = await runSetupCenter(ui);
    if (changed) {
      ui.answer("Token kasası güncellendi. Yeni rotaları yüklemek için şimdi `soleil` çalıştırın.");
    }
  } finally {
    ui.close();
  }
}

async function interactive(options: CliOptions): Promise<void> {
  const config = await loadConfig(options.cwd);
  if (options.mode) config.mode = options.mode;
  const relay = new SoleilRelay(config);
  await relay.initialize();
  const ui = new TerminalUI();
  let activeController: AbortController | undefined;
  const tools = new ToolManager(
    options.cwd,
    (question, preview) => ui.confirm(question, preview),
    options.autoApprove || config.approval === "always",
    config.commandTimeoutMs,
  );
  const agent = new SoleilAgent(options.cwd, relay, tools, config.maxAgentSteps, {
    onThinking: () => ui.startThinking(),
    onModelSelected: (result) =>
      ui.model(
        result.decision.provider.displayName,
        result.decision.model.displayName,
        result.decision.reason,
      ),
    onTool: (name, reason) => ui.tool(name, reason),
    onToolResult: (_name, result) => ui.toolResult(result.ok, result.output),
  });

  const onSigint = (): void => {
    if (activeController) {
      activeController.abort();
      activeController = undefined;
      ui.info("\nAktif işlem durduruldu. Çıkmak için /exit yazın.");
    }
  };
  process.on("SIGINT", onSigint);
  const modelCount = relay
    .getProviders()
    .reduce((sum, provider) => sum + provider.models.length, 0);
  ui.banner(options.cwd, relay.getMode(), modelCount);
  if (modelCount === 0) {
    ui.info("Model bağlamak için README dosyasına bakın veya `soleil doctor` çalıştırın.");
  }

  try {
    while (true) {
      const input = await ui.prompt();
      if (!input) continue;
      if (input === "/exit" || input === "/quit") break;
      if (input === "/help") {
        ui.answer(`/help          Komutları göster
/models        Modelleri göster
/status        Relay durumunu göster
/setup         Token ekleme ve ücretsiz model merkezi
/tokens        Bağlı tokenları gizli kimlikleriyle göster
/free          Güncel ücretsiz seçenekleri öner
/mode MOD      auto, free, local veya private
/clear         Konuşma bağlamını temizle
/exit          SoleilCode'dan çık`);
        continue;
      }
      if (input === "/setup") {
        const changed = await runSetupCenter(ui);
        if (changed) {
          ui.info("Yeni tokenlar kaydedildi. Etkinleştirmek için /exit ile çıkıp `soleil` açın.");
        }
        continue;
      }
      if (input === "/tokens") {
        ui.section("Bağlı tokenlar", tokenLines(await new CredentialVault().list()));
        continue;
      }
      if (input === "/free") {
        const credentials = await new CredentialVault().list();
        ui.section(`Ücretsiz seçenekler · doğrulama ${FREE_CATALOG_VERIFIED_AT}`, [
          ...catalogLines(credentials),
          "",
          "Ücretsiz kotalar değişebilir; SoleilCode ücretli modele otomatik geçmez.",
        ]);
        continue;
      }
      if (input === "/models" || input === "/status") {
        ui.answer(`SoleilRelay · mod: ${relay.getMode()}\n${modelLines(relay).join("\n")}`);
        continue;
      }
      if (input === "/clear") {
        agent.clear();
        ui.info("Konuşma bağlamı temizlendi.");
        continue;
      }
      if (input.startsWith("/mode ")) {
        const requested = input.slice(6).trim() as SoleilMode;
        if (!MODES.has(requested)) {
          ui.error("Mod auto, free, local veya private olmalı.");
        } else {
          relay.setMode(requested);
          ui.updateMode(requested);
          ui.info(`Çalışma modu: ${requested}`);
        }
        continue;
      }
      if (input.startsWith("/")) {
        ui.error("Bilinmeyen komut. /help yazabilirsiniz.");
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
  if (options.command === "help") return printHelp();
  if (options.command === "version") return console.log(VERSION);
  if (options.command === "doctor") return doctor(options);
  if (options.command === "setup") return setup(options);
  await interactive(options);
}

main().catch((error) => {
  console.error(`SoleilCode başlatılamadı: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
