import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

interface CheckpointEntry {
  path: string;
  existed: boolean;
  contentBase64?: string;
}

interface CheckpointDocument {
  version: 1;
  id: string;
  createdAt: string;
  label: string;
  entries: CheckpointEntry[];
}

export interface UndoResult {
  id: string;
  label: string;
  restored: string[];
}

const CHECKPOINT_SUFFIX = ".checkpoint.json";
const MAX_CHECKPOINT_FILE_BYTES = 512_000;

export class CheckpointManager {
  private active: CheckpointDocument | undefined;

  constructor(private readonly root: string) {}

  private get directory(): string {
    return path.join(this.root, ".soleil", "checkpoints");
  }

  begin(label: string): void {
    this.active = {
      version: 1,
      id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
      label: label.trim().slice(0, 500) || "SoleilCode change",
      entries: [],
    };
  }

  async captureFile(absolutePath: string): Promise<void> {
    if (!this.active) return;
    const absolute = path.resolve(absolutePath);
    const relative = path.relative(this.root, absolute);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Checkpoint target is outside the project.");
    }
    if (this.active.entries.some((entry) => entry.path === relative)) return;

    try {
      const content = await readFile(absolute);
      if (content.byteLength > MAX_CHECKPOINT_FILE_BYTES) {
        throw new Error(`Checkpoint refused a file larger than ${MAX_CHECKPOINT_FILE_BYTES} bytes.`);
      }
      this.active.entries.push({
        path: relative,
        existed: true,
        contentBase64: content.toString("base64"),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.active.entries.push({ path: relative, existed: false });
        return;
      }
      throw error;
    }
  }

  async complete(): Promise<string | undefined> {
    const checkpoint = this.active;
    this.active = undefined;
    if (!checkpoint?.entries.length) return undefined;
    await mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, `${checkpoint.id}${CHECKPOINT_SUFFIX}`);
    await writeFile(target, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    return checkpoint.id;
  }

  discard(): void {
    this.active = undefined;
  }

  async list(): Promise<Array<Pick<CheckpointDocument, "id" | "createdAt" | "label"> & { files: number }>> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const results = await Promise.all(
      names
        .filter((name) => name.endsWith(CHECKPOINT_SUFFIX))
        .sort()
        .reverse()
        .map(async (name) => {
          const document = await this.readDocument(path.join(this.directory, name));
          return {
            id: document.id,
            createdAt: document.createdAt,
            label: document.label,
            files: document.entries.length,
          };
        }),
    );
    return results;
  }

  async undoLatest(): Promise<UndoResult | undefined> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    const latest = names
      .filter((name) => name.endsWith(CHECKPOINT_SUFFIX))
      .sort()
      .at(-1);
    if (!latest) return undefined;

    const source = path.join(this.directory, latest);
    const checkpoint = await this.readDocument(source);
    const resolvedEntries = checkpoint.entries.map((entry) => {
      const absolute = path.resolve(this.root, entry.path);
      const relative = path.relative(this.root, absolute);
      const pieces = relative.split(path.sep);
      if (
        !relative ||
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        pieces.some(
          (piece) =>
            piece === ".git" ||
            piece === ".soleil" ||
            piece.toLowerCase().startsWith(".env") ||
            /\.(?:pem|key|p12|pfx)$/i.test(piece),
        )
      ) {
        throw new Error("Unsafe path found in checkpoint.");
      }
      return { entry, absolute };
    });
    const restored: string[] = [];
    for (const { entry, absolute } of resolvedEntries) {
      if (entry.existed) {
        await mkdir(path.dirname(absolute), { recursive: true });
        await writeFile(absolute, Buffer.from(entry.contentBase64 || "", "base64"));
      } else {
        try {
          await access(absolute);
          await unlink(absolute);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      restored.push(entry.path);
    }
    await rename(source, source.replace(CHECKPOINT_SUFFIX, ".undone.json"));
    return { id: checkpoint.id, label: checkpoint.label, restored };
  }

  private async readDocument(filePath: string): Promise<CheckpointDocument> {
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as CheckpointDocument;
    if (
      parsed.version !== 1 ||
      typeof parsed.id !== "string" ||
      typeof parsed.label !== "string" ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.some(
        (entry) =>
          !entry ||
          typeof entry.path !== "string" ||
          typeof entry.existed !== "boolean" ||
          (entry.existed && typeof entry.contentBase64 !== "string"),
      )
    ) {
      throw new Error("Unsupported checkpoint format.");
    }
    return parsed;
  }
}
