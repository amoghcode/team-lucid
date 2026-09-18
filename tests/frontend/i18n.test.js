import { describe, expect, it } from "vitest";
import { dictionaries } from "../../frontend/js/i18n.js";

const companionKeys = [
  "listeningSpace", "companionLead", "memoryPrompts", "festivalPrompt",
  "childhoodPrompt", "laughPrompt", "mealPrompt", "story", "supportive",
  "shareMemoryQ", "companionPrompt", "send", "storyRequest", "storyResponse",
  "comfortResponse", "festivalResponse", "childhoodResponse", "listeningResponse",
];

describe("companion translations", () => {
  it.each(Object.entries(dictionaries))("has specific copy for %s", (_, dictionary) => {
    for (const key of companionKeys) {
      expect(dictionary[key], `${key} should be translated`).toBeTruthy();
      expect(dictionary[key]).not.toBe(dictionary.companion);
    }
  });
});
