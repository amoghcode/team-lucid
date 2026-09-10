import { describe, expect, it } from "vitest";
import { adaptDifficulty, calculateAnalytics, scoreSession } from "../../frontend/js/analytics.js";

describe("cognitive analytics", () => {
  it("weights session accuracy, speed and completion", () => {
    expect(scoreSession({ correct: 8, attempts: 10, responseTime: 30, targetTime: 30 })).toEqual({ accuracy: 80, speed: 100, completion: 100, score: 87 });
  });

  it("raises difficulty after two strong rounds", () => {
    const rounds = [{ accuracy: 92, speed: 80, completed: true, createdAt: "2026-09-09" }, { accuracy: 90, speed: 76, completed: true, createdAt: "2026-09-08" }];
    expect(adaptDifficulty(rounds, "easy").level).toBe("medium");
  });

  it("uses the documented domain weights", () => {
    const base = { createdAt: "2026-09-09", score: 80 };
    const results = ["memory", "objects", "routine", "pattern", "family", "emotion"].map((game) => ({ ...base, game }));
    const analytics = calculateAnalytics(results, [{ value: 4 }], [{ completedAt: "now" }]);
    expect(analytics).toMatchObject({ memory: 80, recall: 80, attention: 80, mood: 80, overall: 80, adherence: 100 });
  });
});
