import { createServer, type Server } from "node:http";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

export interface BrowserVerification {
  ok: boolean;
  browser?: string;
  title?: string;
  bodyText?: string;
  consoleErrors: string[];
  pageErrors: string[];
  screenshot?: string;
  error?: string;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function discoverBrowserExecutable(): Promise<string | undefined> {
  const configured = process.env.SOLEIL_BROWSER_PATH?.trim();
  const candidates = [
    configured,
    process.platform === "win32"
      ? "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
      : undefined,
    process.platform === "win32"
      ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      : undefined,
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : undefined,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : undefined,
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined,
    process.platform === "darwin"
      ? "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      : undefined,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

export class BrowserVerifier {
  constructor(private readonly root: string) {}

  async verify(
    relativePath: string,
    keys: string[] = [],
    waitMs = 300,
  ): Promise<BrowserVerification> {
    const absolute = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, absolute);
    if (
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      path.extname(absolute).toLowerCase() !== ".html"
    ) {
      return {
        ok: false,
        consoleErrors: [],
        pageErrors: [],
        error: "browser_test requires a project-relative HTML file.",
      };
    }
    if (!(await exists(absolute))) {
      return {
        ok: false,
        consoleErrors: [],
        pageErrors: [],
        error: `HTML file not found: ${relative}`,
      };
    }
    const executablePath = await discoverBrowserExecutable();
    if (!executablePath) {
      return {
        ok: false,
        consoleErrors: [],
        pageErrors: [],
        error:
          "No Chrome, Edge, or Chromium installation was found. Set SOLEIL_BROWSER_PATH.",
      };
    }

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let server: Server | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const hosted = await this.startServer();
      server = hosted.server;
      browser = await chromium.launch({ executablePath, headless: true });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "127.0.0.1") await route.continue();
        else await route.abort("blockedbyclient");
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const urlPath = relative.split(path.sep).map(encodeURIComponent).join("/");
      const response = await page.goto(`${hosted.origin}/${urlPath}`, {
        waitUntil: "load",
        timeout: 15_000,
      });
      await page.waitForTimeout(Math.max(0, Math.min(waitMs, 5_000)));
      for (const key of keys.slice(0, 12)) {
        await page.keyboard.press(key);
        await page.waitForTimeout(80);
      }
      if (keys.length) {
        await page.waitForTimeout(Math.max(0, Math.min(waitMs, 5_000)));
      }
      const artifactDirectory = path.join(this.root, ".soleil", "artifacts");
      await mkdir(artifactDirectory, { recursive: true });
      const screenshot = path.join(
        artifactDirectory,
        `browser-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
      );
      await page.screenshot({ path: screenshot, fullPage: true });
      const title = await page.title();
      const bodyText = (await page.locator("body").innerText()).trim().slice(0, 4_000);
      const httpOk = response?.ok() ?? false;
      return {
        ok: httpOk && consoleErrors.length === 0 && pageErrors.length === 0,
        browser: path.basename(executablePath),
        title,
        bodyText,
        consoleErrors,
        pageErrors,
        screenshot,
        ...(!httpOk ? { error: `Page returned HTTP ${response?.status() || "unknown"}.` } : {}),
      };
    } catch (error) {
      return {
        ok: false,
        browser: path.basename(executablePath),
        consoleErrors,
        pageErrors,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await browser?.close().catch(() => undefined);
      await new Promise<void>((resolve) => server?.close(() => resolve()) || resolve());
    }
  }

  private async startServer(): Promise<{ server: Server; origin: string }> {
    const server = createServer(async (request, response) => {
      try {
        const rawPath = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
        if (rawPath === "/favicon.ico") {
          response.writeHead(204).end();
          return;
        }
        const absolute = path.resolve(this.root, `.${rawPath}`);
        const relative = path.relative(this.root, absolute);
        const pieces = relative.split(path.sep);
        if (
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
          response.writeHead(403).end("Forbidden");
          return;
        }
        const content = await readFile(absolute);
        response.writeHead(200, {
          "content-type": MIME_TYPES[path.extname(absolute).toLowerCase()] || "application/octet-stream",
        });
        response.end(content);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        response.writeHead(code === "ENOENT" ? 404 : 400).end(
          code === "ENOENT" ? "Not found" : "Bad request",
        );
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not start browser server.");
    return { server, origin: `http://127.0.0.1:${address.port}` };
  }
}
