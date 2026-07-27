import type { CredentialProvider, StoredCredential } from "./credentials/vault.js";
import { translate, type MessageKey, type SoleilLanguage } from "./i18n.js";

export interface FreeProviderOffer {
  id: CredentialProvider | "ollama";
  name: string;
  summary: string;
  signupUrl: string;
  docsUrl: string;
  tokenRequired: boolean;
  summaryKey: MessageKey;
}

export const FREE_PROVIDER_CATALOG: FreeProviderOffer[] = [
  {
    id: "groq",
    name: "Groq Free Plan",
    summary: "Fast coding models with model-specific RPM, RPD, and TPM limits.",
    summaryKey: "freeGroqSummary",
    signupUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/rate-limits",
    tokenRequired: true,
  },
  {
    id: "gemini",
    name: "Google Gemini Free Tier",
    summary: "Free input and output tokens on selected Flash models.",
    summaryKey: "freeGeminiSummary",
    signupUrl: "https://aistudio.google.com/app/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    tokenRequired: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter Free Router",
    summary: "Automatic routing across currently available free models.",
    summaryKey: "freeOpenRouterSummary",
    signupUrl: "https://openrouter.ai/settings/keys",
    docsUrl: "https://openrouter.ai/openrouter/free",
    tokenRequired: true,
  },
  {
    id: "ollama",
    name: "Ollama Local",
    summary: "Fully local models that need neither an API token nor internet access.",
    summaryKey: "freeOllamaSummary",
    signupUrl: "https://ollama.com/download",
    docsUrl: "https://docs.ollama.com/api/introduction",
    tokenRequired: false,
  },
];

export const FREE_CATALOG_VERIFIED_AT = "2026-07-27";

export function catalogLines(
  credentials: StoredCredential[],
  language: SoleilLanguage = "en",
): string[] {
  return FREE_PROVIDER_CATALOG.flatMap((offer, index) => {
    const connected =
      offer.id === "ollama"
        ? translate(language, "localInstall")
        : translate(language, "tokensConnected", {
            count: credentials.filter((item) => item.provider === offer.id).length,
          });
    return [
      `${index + 1}. ${offer.name} · ${connected}`,
      `   ${translate(language, offer.summaryKey)}`,
      `   ${translate(language, "signup", { url: offer.signupUrl })}`,
    ];
  });
}
