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
import { BrowserVerifier } from "../browser/browser-verifier.js";
import type { CheckpointManager } from "../checkpoints/checkpoint-manager.js";
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
    : `${value.slice(0, limit)}\n\n… output truncated by ${value.length - limit} characters`;
}

export class ToolManager {
  constructor(
    private readonly root: string,
    private readonly confirm: Confirm,
    private readonly autoApprove: boolean,
    private readonly commandTimeoutMs: number,
    private readonly checkpoints?: CheckpointManager,
    private readonly browser = new BrowserVerifier(root),
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
        case "browser_test":
          return await this.browserTest(call.arguments);
        default:
          return { ok: false, output: `Unknown tool: ${call.tool}` };
      }
    } catch (error) {
      return {
        ok: false,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveSafe(input: unknown): string {
    if (typeof input !== "string" || !input.trim()) throw new Error("A valid path is required.");
    const absolute = path.resolve(this.root, input);
    const relative = path.relative(this.root, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Access outside the project directory is blocked.");
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
      throw new Error("Access to secret or internal files is blocked.");
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
    if (lines.length >= 800) lines.push("… file list limited to 800 entries");
    return { ok: true, output: lines.join("\n") || "(empty directory)" };
  }

  private async readFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error("The requested path is not a file.");
    if (info.size > MAX_FILE_BYTES) throw new Error("The file exceeds the safe read limit.");
    const content = await readFile(absolute, "utf8");
    if (content.includes("\u0000")) throw new Error("Binary files cannot be read.");
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
      output: clip(`${path.relative(this.root, absolute)} (${lines.length} lines)\n${selected}`),
    };
  }

  private async searchText(args: Record<string, unknown>): Promise<ToolResult> {
    if (typeof args.query !== "string" || !args.query) throw new Error("A search query is required.");
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
    if (matches.length >= 200) matches.push("… results limited to 200 matches");
    return { ok: true, output: matches.join("\n") || "No matches found." };
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    if (typeof args.content !== "string") throw new Error("File content is required.");
    if (Buffer.byteLength(args.content, "utf8") > MAX_FILE_BYTES) {
      throw new Error("The file exceeds the safe write limit.");
    }
    const relative = path.relative(this.root, absolute);
    const approved =
      this.autoApprove ||
      (await this.confirm(
        `Write ${relative}?`,
        clip(args.content, 3_000),
      ));
    if (!approved) return { ok: false, denied: true, output: "The user denied the write operation." };
    await this.checkpoints?.captureFile(absolute);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, args.content, "utf8");
    return { ok: true, output: `${relative} written (${args.content.length} characters).` };
  }

  private async replaceInFile(args: Record<string, unknown>): Promise<ToolResult> {
    const absolute = this.resolveSafe(args.path);
    if (typeof args.oldText !== "string" || typeof args.newText !== "string") {
      throw new Error("oldText and newText are required.");
    }
    const content = await readFile(absolute, "utf8");
    const occurrences = content.split(args.oldText).length - 1;
    if (occurrences === 0) throw new Error("The exact text to replace was not found.");
    if (occurrences > 1) {
      throw new Error(`The text appears ${occurrences} times; provide more specific context.`);
    }
    const relative = path.relative(this.root, absolute);
    const preview = `--- old\n${clip(args.oldText, 1_500)}\n+++ new\n${clip(args.newText, 1_500)}`;
    const approved =
      this.autoApprove || (await this.confirm(`Update ${relative}?`, preview));
    if (!approved) {
      return { ok: false, denied: true, output: "The user denied the edit operation." };
    }
    await this.checkpoints?.captureFile(absolute);
    await writeFile(absolute, content.replace(args.oldText, args.newText), "utf8");
    return { ok: true, output: `${relative} updated.` };
  }

  private async runCommand(args: Record<string, unknown>): Promise<ToolResult> {
    if (typeof args.command !== "string" || !args.command.trim()) {
      throw new Error("A command is required.");
    }
    const approved =
      this.autoApprove || (await this.confirm("Run this command?", args.command));
    if (!approved) return { ok: false, denied: true, output: "The user denied the command." };
    try {
      const result = await execAsync(args.command, {
        cwd: this.root,
        timeout: this.commandTimeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      return {
        ok: true,
        output: clip([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || "(no output)"),
      };
    } catch (error) {
      const detail = error as Error & { stdout?: string; stderr?: string; code?: number };
      return {
        ok: false,
        output: clip(
          [
            `Command failed${detail.code !== undefined ? ` (code ${detail.code})` : ""}.`,
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
      return { ok: true, output: clip(result.stdout || "(no changes)") };
    } catch (error) {
      return {
        ok: false,
        output: `Could not read the Git diff: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  private async browserTest(args: Record<string, unknown>): Promise<ToolResult> {
    if (typeof args.path !== "string") throw new Error("An HTML file path is required.");
    const keys = Array.isArray(args.keys)
      ? args.keys.filter((item): item is string => typeof item === "string")
      : [];
    const waitMs = Math.max(0, Math.min(toInteger(args.waitMs, 300), 5_000));
    const result = await this.browser.verify(args.path, keys, waitMs);
    return { ok: result.ok, output: clip(JSON.stringify(result, null, 2)) };
  }
}
