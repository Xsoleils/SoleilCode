import type { CredentialProvider, StoredCredential } from "./credentials/vault.js";

export interface FreeProviderOffer {
  id: CredentialProvider | "ollama";
  name: string;
  summary: string;
  signupUrl: string;
  docsUrl: string;
  tokenRequired: boolean;
}

export const FREE_PROVIDER_CATALOG: FreeProviderOffer[] = [
  {
    id: "groq",
    name: "Groq Free Plan",
    summary: "Çok hızlı kodlama modelleri; RPM, RPD ve TPM sınırları modele göre değişir.",
    signupUrl: "https://console.groq.com/keys",
    docsUrl: "https://console.groq.com/docs/rate-limits",
    tokenRequired: true,
  },
  {
    id: "gemini",
    name: "Google Gemini Free Tier",
    summary: "Seçili Flash modellerinde ücretsiz giriş ve çıkış tokenları.",
    signupUrl: "https://aistudio.google.com/app/apikey",
    docsUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    tokenRequired: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter Free Router",
    summary: "openrouter/free ile mevcut ücretsiz modeller arasında otomatik seçim.",
    signupUrl: "https://openrouter.ai/settings/keys",
    docsUrl: "https://openrouter.ai/openrouter/free",
    tokenRequired: true,
  },
  {
    id: "ollama",
    name: "Ollama Yerel",
    summary: "API tokenı ve internet gerektirmeden bilgisayarda çalışan tamamen yerel modeller.",
    signupUrl: "https://ollama.com/download",
    docsUrl: "https://docs.ollama.com/api/introduction",
    tokenRequired: false,
  },
];

export const FREE_CATALOG_VERIFIED_AT = "27 Temmuz 2026";

export function catalogLines(credentials: StoredCredential[]): string[] {
  return FREE_PROVIDER_CATALOG.flatMap((offer, index) => {
    const connected =
      offer.id === "ollama"
        ? "yerel kurulum"
        : `${credentials.filter((item) => item.provider === offer.id).length} token bağlı`;
    return [
      `${index + 1}. ${offer.name} · ${connected}`,
      `   ${offer.summary}`,
      `   Kayıt: ${offer.signupUrl}`,
    ];
  });
}
