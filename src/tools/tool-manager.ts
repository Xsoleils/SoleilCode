import { exec } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ToolCall, ToolResult } from "../types.js";

const execAsync = promisify(exec);
const IGNORED_NAMES = new Set([
  ".git",
  ".env",
  ".soleil",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "__pycache__",
]);
const MAX_FILE_BYTES = 512_000;
const MAX_TOOL_OUTPUT = 40_000;

type Confirm = (question: string, preview?: string) => Promise<boolean>;

function toInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

function clip(value: string, limit = MAX_TOOL_OUTPUT): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n\n… çıktı ${value.length - limit} karakter kısaltıldı`;
}

export class ToolManager {
  constructor(
    private readonly root: string,
    private readonly confirm: Confirm,
    private readonly autoApprove: boolean,
    private readonly commandTimeoutMs: number,
  ) {}

  async execute(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.tool) {
        case "list_files":
          return await this.listFiles(call.arguments);
        case "read_file":
          return await this.readFile(call.arguments);
        case "search_text":
          return await this.searchText(call.arguments);
        case "write_file":
          return await this.writeFile(call.arguments);
        case "replace_in_file":
          return await this.replaceInFile(call.arguments);
        case "run_command":
          return await this.runCommand(call.arguments);
        case "git_diff":
          return await this.gitDiff();
        default:
          return { ok: false, output: `Bilinmeyen araç: ${call.tool}` };
      }
    } catch (error) {
      return {
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveSafe(input: unknown): string {
    if (typeof input !== "string" || !input.trim()) throw new Error("Geçerli bir yol gerekli.");
    const absolute = path.resolve(this.root, input);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Proje klasörünün dışına erişim engellendi.");
    }
    const pieces = relative.split(path.sep);
    if (
      pieces.some(
        (piece) =>
          piece === ".git" ||
          piece.toLocaleLowerCase().startsWith(".env") ||
          /\.(?:pem|key|p12|pfx)$/i.test(piece),
      )
    ) {
      throw new Error("Gizli veya dahili dosyaya erişim engellendi.");
    }
    return absolute;
  }

  private async listFiles(args: Record<string, unknown>): Promise<ToolResult> {
    const start = this.resolveSafe(typeof args.path === "string" ? args.path : ".");
    const maxDepth = Math.max(0, Math.min(toInteger(args.maxDepth, 3), 8));
    const lines: string[] = [];

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (lines.length >= 800) return;
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        const relative = path.relative(this.root, absolute) || ".";
        lines.push(`${entry.isDirectory() ? "d" : "f"} ${relative}`);
        if (entry.isDirectory() && depth < maxDepth) await walk(absolute, depth + 1);
        if (lines.length >= 800) break;
      }
    };

    await walk(start, 0);
    if (lines.length >= 800) lines.push("… dosya listesi 800 öğede sınırlandı");
    return { ok: true, output: lines.join("\n") || "(klasör boş)" };
  }

  private async readFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("İstenen yol bir dosya değil.");
    if (info.size > MAX_FILE_BYTES) throw new Error("Dosya güvenli okuma sınırından büyük.");
    const content = await readFile(absolute, "utf8");
    if (content.includes("\u0000")) throw new Error("İkili dosya okunamaz.");
    const lines = content.split(/\r?\n/);
    const startLine = Math.max(1, toInteger(args.startLine, 1));
    const endLine = Math.min(
      lines.length,
      Math.max(startLine, toInteger(args.endLine, startLine + 249)),
    );
    const selected = lines
      .slice(startLine - 1, endLine)
      .map((line, index) => `${startLine + index}: ${line}`)
      .join("\n");
    return {
      ok: true,
      output: clip(`${path.relative(this.root, absolute)} (${lines.length} satır)\n${selected}`),
    };
  }

  private async searchText(args: Record<string, unknown>): Promise<ToolResult> {
    if (typeof args.query !== "string" || !args.query) throw new Error("Arama metni gerekli.");
    const start = this.resolveSafe(typeof args.path === "string" ? args.path : ".");
    const needle = args.query.toLocaleLowerCase();
    const matches: string[] = [];

    const walk = async (target: string): Promise<void> => {
      if (matches.length >= 200) return;
      const info = await stat(target);
      if (info.isDirectory()) {
        for (const entry of await readdir(target, { withFileTypes: true })) {
          if (IGNORED_NAMES.has(entry.name)) continue;
          await walk(path.join(target, entry.name));
          if (matches.length >= 200) return;
        }
        return;
      }
      if (info.size > MAX_FILE_BYTES) return;
      let content: string;
      try {
        content = await readFile(target, "utf8");
      } catch {
        return;
      }
      if (content.includes("\u0000")) return;
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || "";
        if (line.toLocaleLowerCase().includes(needle)) {
          matches.push(`${path.relative(this.root, target)}:${index + 1}: ${line.trim()}`);
        }
        if (matches.length >= 200) return;
      }
    };

    await walk(start);
    if (matches.length >= 200) matches.push("… sonuçlar 200 eşleşmede sınırlandı");
    return { ok: true, output: matches.join("\n") || "Eşleşme bulunamadı." };
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    if (typeof args.content !== "string") throw new Error("Dosya içeriği gerekli.");
    if (Buffer.byteLength(args.content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("Yazılacak dosya güvenli boyut sınırından büyük.");
    }
    const relative = path.relative(this.root, absolute);
    const approved =
      this.autoApprove ||
      (await this.confirm(
        `${relative} dosyası yazılsın mı?`,
        clip(args.content, 3_000),
      ));
    if (!approved) return { ok: false, denied: true, output: "Kullanıcı yazma işlemini reddetti." };
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, args.content, "utf8");
    return { ok: true, output: `${relative} yazıldı (${args.content.length} karakter).` };
  }

  private async replaceInFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    if (typeof args.oldText !== "string" || typeof args.newText !== "string") {
      throw new Error("oldText ve newText metinleri gerekli.");
    }
    const content = await readFile(absolute, "utf8");
    const occurrences = content.split(args.oldText).length - 1;
    if (occurrences === 0) throw new Error("Değiştirilecek tam metin dosyada bulunamadı.");
    if (occurrences > 1) {
      throw new Error(`Değiştirilecek metin ${occurrences} kez bulunuyor; daha özgün bağlam gerekli.`);
    }
    const relative = path.relative(this.root, absolute);
    const preview = `--- eski\n${clip(args.oldText, 1_500)}\n+++ yeni\n${clip(args.newText, 1_500)}`;
    const approved =
      this.autoApprove || (await this.confirm(`${relative} değiştirilsin mi?`, preview));
    if (!approved) {
      return { ok: false, denied: true, output: "Kullanıcı değiştirme işlemini reddetti." };
    }
    await writeFile(absolute, content.replace(args.oldText, args.newText), "utf8");
    return { ok: true, output: `${relative} güncellendi.` };
  }

  private async runCommand(args: Record<string, unknown>): Promise<ToolResult> {
    if (typeof args.command !== "string" || !args.command.trim()) {
      throw new Error("Çalıştırılacak komut gerekli.");
    }
    const approved =
      this.autoApprove || (await this.confirm("Bu komut çalıştırılsın mı?", args.command));
    if (!approved) return { ok: false, denied: true, output: "Kullanıcı komutu reddetti." };
    try {
      const result = await execAsync(args.command, {
        cwd: this.root,
        timeout: this.commandTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return {
        ok: true,
        output: clip([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "(çıktı yok)"),
      };
    } catch (error) {
      const detail = error as Error & { stdout?: string; stderr?: string; code?: number };
      return {
        ok: false,
        output: clip(
          [
            `Komut başarısız${detail.code !== undefined ? ` (kod ${detail.code})` : ""}.`,
            detail.stdout,
            detail.stderr,
            detail.message,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      };
    }
  }

  private async gitDiff(): Promise<ToolResult> {
    try {
      const result = await execAsync("git diff --no-ext-diff --", {
        cwd: this.root,
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return { ok: true, output: clip(result.stdout || "(değişiklik yok)") };
    } catch (error) {
      return {
        ok: false,
        output: `Git farkı alınamadı: ${error instanceof Error ? error.message : error}`,
      };
    }
  }
}
