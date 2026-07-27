import assert from "node:assert/strict";
import test from "node:test";
import { classifyTask } from "../src/relay/task-classifier.js";

test("task classifier recognizes common coding intents", () => {
  assert.equal(classifyTask("Bu hatayı bul ve düzelt"), "debug");
  assert.equal(classifyTask("Kod güvenlik incelemesi yap"), "review");
  assert.equal(classifyTask("Yeni giriş ekranı ekle"), "edit");
  assert.equal(classifyTask("Testleri çalıştır ve doğrula"), "test");
  assert.equal(classifyTask("Tüm proje mimarisini çıkar"), "long-context");
  assert.equal(classifyTask("Bu fonksiyon ne yapıyor, açıkla"), "explore");
  assert.equal(classifyTask("Nasılsın?"), "chat");
});
