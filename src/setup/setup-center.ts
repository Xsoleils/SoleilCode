import {
  CredentialVault,
  credentialFingerprint,
  type CredentialProvider,
  type StoredCredential,
} from "../credentials/vault.js";
import {
  catalogLines,
  FREE_CATALOG_VERIFIED_AT,
  FREE_PROVIDER_CATALOG,
} from "../free-catalog.js";
import { TerminalUI } from "../ui.js";

const PROVIDER_NAMES: Record<CredentialProvider, string> = {
  groq: "Groq",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

export function tokenLines(credentials: StoredCredential[]): string[] {
  if (!credentials.length) return ["Henüz kasaya eklenmiş token yok."];
  return credentials.map(
    (credential, index) =>
      `${index + 1}. ${PROVIDER_NAMES[credential.provider]} · ${credential.label} · kimlik ${credentialFingerprint(credential.secret)}`,
  );
}

async function addToken(ui: TerminalUI, vault: CredentialVault): Promise<boolean> {
  const supported = FREE_PROVIDER_CATALOG.filter(
    (offer): offer is typeof offer & { id: CredentialProvider } =>
      offer.tokenRequired && offer.id !== "ollama",
  );
  const selected = await ui.choose(
    "Ücretsiz sağlayıcı seç",
    supported.map((offer) => `${offer.name} — ${offer.summary}`),
  );
  if (selected === undefined) return false;
  const offer = supported[selected];
  if (!offer) return false;

  ui.section(`${offer.name} tokenı`, [
    offer.summary,
    `Token alma adresi: ${offer.signupUrl}`,
    "Yalnızca sahibi olduğunuz ve sağlayıcı koşullarına uygun tokenları ekleyin.",
    "Girilen değer ekranda gösterilmeyecek.",
  ]);
  const label = await ui.ask("Bu hesaba kısa bir ad ver");
  const secret = await ui.secret("API tokenını yapıştır");
  if (!secret) {
    ui.error("Boş token kaydedilmedi.");
    return false;
  }

  const result = await vault.add(offer.id, label, secret);
  if (result.added) {
    ui.info(
      `${offer.name} tokenı güvenli kasaya eklendi · kimlik ${credentialFingerprint(result.credential.secret)}`,
    );
    return true;
  }
  ui.info("Bu token daha önce eklenmiş; ikinci kez kaydedilmedi.");
  return false;
}

async function removeToken(ui: TerminalUI, vault: CredentialVault): Promise<boolean> {
  const credentials = await vault.list();
  if (!credentials.length) {
    ui.info("Silinecek token yok.");
    return false;
  }
  const selected = await ui.choose("Silinecek tokenı seç", tokenLines(credentials));
  if (selected === undefined) return false;
  const credential = credentials[selected];
  if (!credential) return false;
  const approved = await ui.confirm(
    `${PROVIDER_NAMES[credential.provider]} · ${credential.label} tokenı kasadan silinsin mi?`,
  );
  if (!approved) return false;
  const removed = await vault.remove(credential.id);
  if (removed) ui.info("Token kasadan silindi.");
  return removed;
}

export async function runSetupCenter(
  ui: TerminalUI,
  vault = new CredentialVault(),
): Promise<boolean> {
  let changed = false;
  while (true) {
    const selected = await ui.choose("SoleilCode ücretsiz model merkezi", [
      "Yeni API tokenı ekle",
      "Bağlı tokenları göster",
      "Ücretsiz seçenekleri öner",
      "Token sil",
    ]);
    if (selected === undefined) return changed;

    if (selected === 0) {
      changed = (await addToken(ui, vault)) || changed;
    } else if (selected === 1) {
      ui.section("Bağlı tokenlar", tokenLines(await vault.list()));
    } else if (selected === 2) {
      const credentials = await vault.list();
      ui.section(`Ücretsiz seçenekler · doğrulama ${FREE_CATALOG_VERIFIED_AT}`, [
        ...catalogLines(credentials),
        "",
        "Ücretsiz kotalar değişebilir. SoleilCode ücretli modele otomatik geçmez.",
      ]);
    } else if (selected === 3) {
      changed = (await removeToken(ui, vault)) || changed;
    }
  }
}
