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
import { translate, type SoleilLanguage } from "../i18n.js";
import { TerminalUI } from "../ui.js";
import { runLanguagePicker } from "./language-picker.js";

const PROVIDER_NAMES: Record<CredentialProvider, string> = {
  groq: "Groq",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

export function tokenLines(
  credentials: StoredCredential[],
  language: SoleilLanguage = "en",
): string[] {
  if (!credentials.length) return [translate(language, "noTokens")];
  return credentials.map(
    (credential, index) =>
      `${index + 1}. ${PROVIDER_NAMES[credential.provider]} · ${credential.label} · ${translate(language, "fingerprint")} ${credentialFingerprint(credential.secret)}`,
  );
}

async function addToken(ui: TerminalUI, vault: CredentialVault): Promise<boolean> {
  const supported = FREE_PROVIDER_CATALOG.filter(
    (offer): offer is typeof offer & { id: CredentialProvider } =>
      offer.tokenRequired && offer.id !== "ollama",
  );
  const selected = await ui.choose(
    ui.text("chooseProvider"),
    supported.map((offer) => `${offer.name} — ${ui.text(offer.summaryKey)}`),
  );
  if (selected === undefined) return false;
  const offer = supported[selected];
  if (!offer) return false;

  ui.section(ui.text("tokenFor", { provider: offer.name }), [
    ui.text(offer.summaryKey),
    ui.text("tokenUrl", { url: offer.signupUrl }),
    ui.text("tokenOwnerNotice"),
    ui.text("tokenHiddenNotice"),
  ]);
  const label = await ui.ask(ui.text("accountLabel"));
  const secret = await ui.secret(ui.text("pasteToken"));
  if (!secret) {
    ui.error(ui.text("emptyToken"));
    return false;
  }

  const result = await vault.add(offer.id, label, secret);
  if (result.added) {
    ui.info(
      ui.text("tokenAdded", {
        provider: offer.name,
        fingerprint: credentialFingerprint(result.credential.secret),
      }),
    );
    return true;
  }
  ui.info(ui.text("tokenDuplicate"));
  return false;
}

async function removeToken(ui: TerminalUI, vault: CredentialVault): Promise<boolean> {
  const credentials = await vault.list();
  if (!credentials.length) {
    ui.info(ui.text("noTokenToRemove"));
    return false;
  }
  const selected = await ui.choose(
    ui.text("chooseTokenToRemove"),
    tokenLines(credentials, ui.getLanguage()),
  );
  if (selected === undefined) return false;
  const credential = credentials[selected];
  if (!credential) return false;
  const approved = await ui.confirm(
    ui.text("confirmTokenRemove", {
      provider: PROVIDER_NAMES[credential.provider],
      label: credential.label,
    }),
  );
  if (!approved) return false;
  const removed = await vault.remove(credential.id);
  if (removed) ui.info(ui.text("tokenRemoved"));
  return removed;
}

export async function runSetupCenter(
  ui: TerminalUI,
  vault = new CredentialVault(),
): Promise<boolean> {
  let changed = false;
  while (true) {
    const selected = await ui.choose(ui.text("setupTitle"), [
      ui.text("addApiToken"),
      ui.text("showTokens"),
      ui.text("recommendFree"),
      ui.text("removeToken"),
      ui.text("helpLanguage"),
    ]);
    if (selected === undefined) return changed;

    if (selected === 0) {
      changed = (await addToken(ui, vault)) || changed;
    } else if (selected === 1) {
      ui.section(
        ui.text("connectedTokens"),
        tokenLines(await vault.list(), ui.getLanguage()),
      );
    } else if (selected === 2) {
      const credentials = await vault.list();
      ui.section(ui.text("freeOptions", { date: FREE_CATALOG_VERIFIED_AT }), [
        ...catalogLines(credentials, ui.getLanguage()),
        "",
        ui.text("quotaNotice"),
      ]);
    } else if (selected === 3) {
      changed = (await removeToken(ui, vault)) || changed;
    } else if (selected === 4) {
      await runLanguagePicker(ui);
    }
  }
}
