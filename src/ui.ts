import { createInterface, type Interface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";

const ansi = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  accent: "\u001b[38;2;74;222;128m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  gray: "\u001b[38;5;245m",
};

const HEADER_HEIGHT = 7;

function paint(code: string, value: string): string {
  return stdout.isTTY ? `${code}${value}${ansi.reset}` : value;
}

class PromptOutput extends Writable {
  muted = false;

  override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) stdout.write(chunk, encoding);
    callback();
  }
}

interface HeaderState {
  root: string;
  mode: string;
  modelCount: number;
}

export class TerminalUI {
  private readonly promptOutput = new PromptOutput();
  private readonly rl: Interface = createInterface({
    input: stdin,
    output: this.promptOutput,
    terminal: Boolean(stdin.isTTY && stdout.isTTY),
  });
  private readonly fullScreen = Boolean(stdin.isTTY && stdout.isTTY);
  private spinner: NodeJS.Timeout | undefined;
  private spinnerIndex = 0;
  private header?: HeaderState;
  private screenActive = false;

  private readonly handleResize = (): void => {
    if (!this.screenActive) return;
    this.configureScrollRegion();
    this.renderPersistentHeader(true);
  };

  private readonly handleProcessExit = (): void => {
    this.restoreScreen();
  };

  private fit(value: string, width: number): string {
    if (value.length <= width) return value.padEnd(width);
    if (width <= 1) return value.slice(0, width);
    return `${value.slice(0, width - 1)}…`;
  }

  private boxRow(content: string, innerWidth: number): void {
    console.log(
      `${paint(ansi.accent, "│")}${this.fit(content, innerWidth)}${paint(ansi.accent, "│")}`,
    );
  }

  private headerLines(): string[] {
    const header = this.header;
    if (!header) return [];
    const totalWidth = this.fullScreen
      ? Math.max(38, (stdout.columns || 80) - 1)
      : Math.max(38, Math.min(76, (stdout.columns || 80) - 2));
    const innerWidth = totalWidth - 2;
    const top = `╭${"─".repeat(innerWidth)}╮`;
    const bottom = `╰${"─".repeat(innerWidth)}╯`;
    const row = (content: string): string =>
      `${paint(ansi.accent, "│")}${this.fit(content, innerWidth)}${paint(ansi.accent, "│")}`;
    const status = `SoleilRelay · ${header.mode} · ${header.modelCount} model hazır`;
    const help = `${paint(ansi.gray, "/help")} komutlar  ${paint(ansi.gray, "·")}  ${paint(ansi.gray, "Ctrl+C")} durdur  ${paint(ansi.gray, "·")}  ${paint(ansi.gray, "/exit")} çıkış`;
    return [
      paint(ansi.accent, top),
      row("   /\\_/\\      SoleilCode · Free-first AI coding agent"),
      row(`  ( •.• )     ${status}`),
      row(`  / >☀        ${header.root}`),
      paint(ansi.accent, bottom),
      `  ${help}`,
      paint(ansi.accent, "─".repeat(Math.max(1, totalWidth))),
    ];
  }

  private renderPersistentHeader(preserveCursor: boolean): void {
    const lines = this.headerLines();
    if (!lines.length) return;
    if (preserveCursor) stdout.write("\u001b7");
    for (let index = 0; index < HEADER_HEIGHT; index += 1) {
      stdout.write(`\u001b[${index + 1};1H\u001b[2K${lines[index] || ""}`);
    }
    if (preserveCursor) stdout.write("\u001b8");
  }

  private configureScrollRegion(): void {
    const rows = Math.max(HEADER_HEIGHT + 2, stdout.rows || 24);
    stdout.write(`\u001b[${HEADER_HEIGHT + 1};${rows}r`);
  }

  private enterFullScreen(): void {
    if (!this.fullScreen || this.screenActive) return;
    this.screenActive = true;
    stdout.write("\u001b[?1049h\u001b[2J\u001b[H");
    this.renderPersistentHeader(false);
    this.configureScrollRegion();
    stdout.write(`\u001b[${HEADER_HEIGHT + 1};1H`);
    stdout.on("resize", this.handleResize);
    process.on("exit", this.handleProcessExit);
  }

  private restoreScreen(): void {
    if (!this.screenActive) return;
    this.stopSpinner();
    stdout.off("resize", this.handleResize);
    process.off("exit", this.handleProcessExit);
    stdout.write("\u001b[r\u001b[?1049l");
    this.screenActive = false;
  }

  banner(root: string, mode: string, modelCount: number): void {
    this.header = { root, mode, modelCount };
    if (this.fullScreen) {
      this.enterFullScreen();
      return;
    }

    console.log("");
    for (const line of this.headerLines()) console.log(line);
    console.log("");
  }

  updateMode(mode: string): void {
    if (!this.header) return;
    this.header.mode = mode;
    if (this.screenActive) this.renderPersistentHeader(true);
  }

  updateModelCount(modelCount: number): void {
    if (!this.header) return;
    this.header.modelCount = modelCount;
    if (this.screenActive) this.renderPersistentHeader(true);
  }

  async prompt(): Promise<string> {
    return (await this.rl.question(paint(ansi.bold + ansi.accent, "❯ "))).trim();
  }

  async ask(question: string): Promise<string> {
    this.stopSpinner();
    return (await this.rl.question(paint(ansi.accent, `${question} ❯ `))).trim();
  }

  async secret(question: string): Promise<string> {
    this.stopSpinner();
    stdout.write(paint(ansi.accent, `${question} ❯ `));
    this.promptOutput.muted = true;
    try {
      return (await this.rl.question("")).trim();
    } finally {
      this.promptOutput.muted = false;
      stdout.write("\n");
    }
  }

  async choose(title: string, options: string[]): Promise<number | undefined> {
    this.stopSpinner();
    console.log("");
    console.log(paint(ansi.bold + ansi.accent, title));
    for (let index = 0; index < options.length; index += 1) {
      console.log(`  ${paint(ansi.accent, String(index + 1))}  ${options[index]}`);
    }
    console.log(`  ${paint(ansi.gray, "0")}  Geri dön`);
    const answer = await this.ask("Seçim");
    const selected = Number(answer);
    if (!Number.isInteger(selected) || selected <= 0 || selected > options.length) {
      return undefined;
    }
    return selected - 1;
  }

  section(title: string, lines: string[]): void {
    this.stopSpinner();
    console.log("");
    console.log(paint(ansi.bold + ansi.accent, title));
    for (const line of lines) console.log(line);
    console.log("");
  }

  async confirm(question: string, preview?: string): Promise<boolean> {
    this.stopSpinner();
    console.log("");
    console.log(paint(ansi.accent, `╭─ İzin gerekli`));
    console.log(`${paint(ansi.accent, "│")} ${question}`);
    if (preview) {
      const previewLines = preview.split(/\r?\n/);
      for (const line of previewLines) console.log(`${paint(ansi.accent, "│")} ${paint(ansi.dim, line)}`);
    }
    console.log(paint(ansi.accent, "╰─"));
    const answer = (await this.rl.question(paint(ansi.bold + ansi.accent, "Uygula? [e/H] ❯ ")))
      .trim()
      .toLocaleLowerCase("tr-TR");
    return answer === "e" || answer === "evet" || answer === "y" || answer === "yes";
  }

  startThinking(): void {
    if (!stdout.isTTY || this.spinner) return;
    const frames = ["✻", "✽", "✶", "✳", "✢"];
    this.spinner = setInterval(() => {
      const frame = frames[this.spinnerIndex % frames.length];
      this.spinnerIndex += 1;
      stdout.write(`\r${paint(ansi.accent, `${frame} Soleil düşünüyor…`)}`);
    }, 120);
  }

  stopSpinner(): void {
    if (!this.spinner) return;
    clearInterval(this.spinner);
    this.spinner = undefined;
    stdout.write("\r\u001b[2K");
  }

  model(provider: string, model: string, reason: string): void {
    this.stopSpinner();
    console.log(
      `${paint(ansi.gray, "  ⎿")} ${paint(ansi.dim, `SoleilRelay: ${provider} / ${model} · ${reason}`)}`,
    );
  }

  tool(name: string, reason?: string): void {
    this.stopSpinner();
    console.log(
      `${paint(ansi.accent, "●")} ${paint(ansi.bold, name)}${reason ? paint(ansi.dim, ` · ${reason}`) : ""}`,
    );
  }

  toolResult(ok: boolean, output: string): void {
    const firstLine = output.split(/\r?\n/)[0] || "";
    console.log(
      `  ${paint(ansi.gray, "⎿")} ${paint(ok ? ansi.green : ansi.red, ok ? "✓" : "✗")} ${paint(ansi.dim, firstLine)}`,
    );
  }

  answer(value: string): void {
    this.stopSpinner();
    console.log("");
    console.log(value);
    console.log("");
  }

  info(value: string): void {
    this.stopSpinner();
    console.log(`${paint(ansi.gray, "  ⎿")} ${paint(ansi.dim, value)}`);
  }

  error(value: string): void {
    this.stopSpinner();
    console.error(`${paint(ansi.red, "  ⎿ Hata:")} ${value}`);
  }

  close(): void {
    this.stopSpinner();
    this.rl.close();
    this.restoreScreen();
  }
}
