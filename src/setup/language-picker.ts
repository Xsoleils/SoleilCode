import { saveGlobalLanguage } from "../config.js";
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  type SoleilLanguage,
} from "../i18n.js";
import { TerminalUI } from "../ui.js";

export async function runLanguagePicker(
  ui: TerminalUI,
): Promise<SoleilLanguage | undefined> {
  const selected = await ui.choose(
    ui.text("languageTitle"),
    SUPPORTED_LANGUAGES.map(
      (language) =>
        `${LANGUAGE_NAMES[language]} · ${language.toUpperCase()}`,
    ),
  );
  if (selected === undefined) return undefined;

  const language = SUPPORTED_LANGUAGES[selected];
  if (!language) return undefined;
  await saveGlobalLanguage(language);
  ui.setLanguage(language);
  ui.info(
    ui.text("languageChanged", {
      language: LANGUAGE_NAMES[language],
    }),
  );
  ui.info(ui.text("languageSaved"));
  return language;
}
