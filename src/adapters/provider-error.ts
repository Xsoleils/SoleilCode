function parseRetryAfterHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function parseRetryFromMessage(message: string): number | undefined {
  const match = message.match(
    /(?:try again in|retry(?:ing)? in|retryDelay["':\s]+)\s*([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec(?:onds?)?|m|min(?:utes?)?)/i,
  );
  if (!match?.[1]) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] || "s").toLocaleLowerCase();
  if (unit === "ms") return Math.ceil(amount);
  if (unit.startsWith("m")) return Math.ceil(amount * 60_000);
  return Math.ceil(amount * 1_000);
}

export class ProviderRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfter?: string | null) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
    const retryAfterMs =
      parseRetryAfterHeader(retryAfter ?? null) ?? parseRetryFromMessage(message);
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}
