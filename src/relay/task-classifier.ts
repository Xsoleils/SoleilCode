import type { TaskKind } from "../types.js";
import { translate, type MessageKey, type SoleilLanguage } from "../i18n.js";

const RULES: Array<{ kind: TaskKind; patterns: RegExp[] }> = [
  {
    kind: "debug",
    patterns: [
      /(hata|bug|çök|crash|exception|stack trace|neden çalışm|bozuk|fix)/iu,
      /\b(failing|failure|undefined|null pointer|traceback)\b/i,
      /(error|erreur|fehler|errore|ошибка|исправ|エラー|修正|오류|수정)/iu,
    ],
  },
  {
    kind: "review",
    patterns: [
      /\b(review|incele|denetle|audit|güvenlik|security|vulnerability|zafiyet)\b/i,
      /\b(code quality|kalite|riskleri bul)\b/i,
      /(revisar|réviser|prüfen|revisione|revisar|провер|レビュー|검토)/iu,
    ],
  },
  {
    kind: "test",
    patterns: [
      /\b(test|doğrula|verify|coverage|spec|smoke|kontrol et)\b/i,
      /(prueba|tester|testen|prova|тест|テスト|테스트)/iu,
    ],
  },
  {
    kind: "long-context",
    patterns: [
      /\b(tüm proje|bütün proje|whole project|codebase|repo genelinde|uzun belge)\b/i,
      /\b(mimariyi çıkar|architecture map|proje haritası)\b/i,
      /(todo el proyecto|projet entier|gesamtes projekt|intero progetto|projeto inteiro|весь проект|プロジェクト全体|전체 프로젝트)/iu,
    ],
  },
  {
    kind: "edit",
    patterns: [
      /\b(ekle|oluştur|yaz|değiştir|düzelt|uygula|implement|refactor|rename|sil)\b/i,
      /\b(build|create|update|modify|migrate)\b/i,
      /(crear|actualizar|modifier|créer|ändern|erstellen|creare|aggiornare|criar|atualizar|создать|изменить|作成|変更|생성|변경)/iu,
    ],
  },
  {
    kind: "explore",
    patterns: [
      /\b(açıkla|anlat|bul|ara|analiz|özetle|ne yapıyor|explain|find|search|summarize)\b/i,
      /(explicar|buscar|expliquer|chercher|erklären|suchen|spiegare|cercare|explicar|procurar|объясни|найди|説明|検索|설명|찾아)/iu,
    ],
  },
];

export function classifyTask(input: string): TaskKind {
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(input))) return rule.kind;
  }
  return "chat";
}

export function taskLabel(
  task: TaskKind,
  language: SoleilLanguage = "en",
): string {
  const labels: Record<TaskKind, MessageKey> = {
    chat: "taskChat",
    explore: "taskExplore",
    edit: "taskEdit",
    debug: "taskDebug",
    review: "taskReview",
    test: "taskTest",
    "long-context": "taskLongContext",
  };
  return translate(language, labels[task]);
}
