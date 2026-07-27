import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type CredentialProvider = "groq" | "gemini" | "openrouter";

export interface StoredCredential {
  id: string;
  provider: CredentialProvider;
  label: string;
  secret: string;
  createdAt: string;
}

interface VaultDocument {
  version: 1;
  credentials: StoredCredential[];
}

const PROVIDERS = new Set<CredentialProvider>(["groq", "gemini", "openrouter"]);

function isCredential(value: unknown): value is StoredCredential {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.provider === "string" &&
    PROVIDERS.has(item.provider as CredentialProvider) &&
    typeof item.label === "string" &&
    typeof item.secret === "string" &&
    typeof item.createdAt === "string"
  );
}

export function credentialFingerprint(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 8).toUpperCase();
}

export class CredentialVault {
  readonly directory: string;
  readonly filePath: string;

  constructor(
    directory =
      process.env.SOLEILCODE_HOME?.trim() || path.join(homedir(), ".soleilcode"),
  ) {
    this.directory = path.resolve(directory);
    this.filePath = path.join(this.directory, "credentials.json");
  }

  async list(): Promise<StoredCredential[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const document = JSON.parse(raw) as Partial<VaultDocument>;
      if (document.version !== 1 || !Array.isArray(document.credentials)) {
        throw new Error("The token vault format is not supported.");
      }
      if (!document.credentials.every(isCredential)) {
        throw new Error("The token vault contains an invalid record.");
      }
      return document.credentials.map((credential) => ({ ...credential }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error(
        `The Soleil token vault could not be read: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async add(
    provider: CredentialProvider,
    label: string,
    secret: string,
  ): Promise<{ credential: StoredCredential; added: boolean }> {
    const cleanSecret = secret.trim();
    if (cleanSecret.length < 12) throw new Error("The token appears shorter than expected.");
    const credentials = await this.list();
    const existing = credentials.find(
      (item) => item.provider === provider && item.secret === cleanSecret,
    );
    if (existing) return { credential: existing, added: false };

    const credential: StoredCredential = {
      id: randomUUID(),
      provider,
      label: label.trim().slice(0, 60) || `${provider} account`,
      secret: cleanSecret,
      createdAt: new Date().toISOString(),
    };
    credentials.push(credential);
    await this.save(credentials);
    return { credential, added: true };
  }

  async remove(id: string): Promise<boolean> {
    const credentials = await this.list();
    const next = credentials.filter((credential) => credential.id !== id);
    if (next.length === credentials.length) return false;
    await this.save(next);
    return true;
  }

  private async save(credentials: StoredCredential[]): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const document: VaultDocument = { version: 1, credentials };
    await writeFile(this.filePath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      await chmod(this.filePath, 0o600);
    } catch {
      // Some Windows filesystems ignore POSIX modes; the file remains under the user profile.
    }
  }
}
