import type { TaskKind } from "../types.js";

const RULES: Array<{ kind: TaskKind; patterns: RegExp[] }> = [
  {
    kind: "debug",
    patterns: [
      /(hata|bug|çök|crash|exception|stack trace|neden çalışm|bozuk|fix)/iu,
      /\b(failing|failure|undefined|null pointer|traceback)\b/i,
    ],
  },
  {
    kind: "review",
    patterns: [
      /\b(review|incele|denetle|audit|güvenlik|security|vulnerability|zafiyet)\b/i,
      /\b(code quality|kalite|riskleri bul)\b/i,
    ],
  },
  {
    kind: "test",
    patterns: [/\b(test|doğrula|verify|coverage|spec|smoke|kontrol et)\b/i],
  },
  {
    kind: "long-context",
    patterns: [
      /\b(tüm proje|bütün proje|whole project|codebase|repo genelinde|uzun belge)\b/i,
      /\b(mimariyi çıkar|architecture map|proje haritası)\b/i,
    ],
  },
  {
    kind: "edit",
    patterns: [
      /\b(ekle|oluştur|yaz|değiştir|düzelt|uygula|implement|refactor|rename|sil)\b/i,
      /\b(build|create|update|modify|migrate)\b/i,
    ],
  },
  {
    kind: "explore",
    patterns: [
      /\b(açıkla|anlat|bul|ara|analiz|özetle|ne yapıyor|explain|find|search|summarize)\b/i,
    ],
  },
];

export function classifyTask(input: string): TaskKind {
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(input))) return rule.kind;
  }
  return "chat";
}

export function taskLabel(task: TaskKind): string {
  const labels: Record<TaskKind, string> = {
    chat: "sohbet",
    explore: "inceleme",
    edit: "kod yazma",
    debug: "hata ayıklama",
    review: "kod inceleme",
    test: "test",
    "long-context": "uzun bağlam",
  };
  return labels[task];
}
