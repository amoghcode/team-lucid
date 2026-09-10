const clamp = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export function scoreSession({ correct = 0, attempts = 1, responseTime = 0, targetTime = 30, completed = true }) {
  const accuracy = clamp((correct / Math.max(attempts, 1)) * 100);
  const speed = clamp((targetTime / Math.max(responseTime, 1)) * 100);
  const completion = completed ? 100 : 0;
  return { accuracy, speed, completion, score: clamp(accuracy * .65 + speed * .2 + completion * .15) };
}

export function adaptDifficulty(results, current = "easy") {
  const ordered = [...results].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const recent = ordered.slice(0, 2);
  const levels = ["easy", "medium", "hard"];
  let index = levels.indexOf(current);
  let reason = "Difficulty stayed steady to support confidence.";
  if (recent.length === 2 && recent.every((r) => r.accuracy >= 85 && r.speed >= 70 && r.completed !== false)) {
    index = Math.min(index + 1, 2); reason = "Increased after two accurate, confident rounds.";
  } else if (recent.some((r) => r.accuracy < 60 || r.completed === false || (r.mistakes || 0) >= 4)) {
    index = Math.max(index - 1, 0); reason = "Reduced after a difficult round to keep play comfortable.";
  }
  return { level: levels[index], reason };
}

function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function gameAverage(results, names) { return average(results.filter((r) => names.includes(r.game)).map((r) => r.score)); }

export function calculateAnalytics(results = [], moods = [], reminders = []) {
  const active = results.filter((r) => !r.deletedAt);
  const memory = clamp(gameAverage(active, ["memory", "objects", "family"]));
  const recall = clamp(gameAverage(active, ["objects", "routine", "family"]));
  const attention = clamp(gameAverage(active, ["pattern", "emotion", "memory"]));
  const mood = clamp(average(moods.filter((m) => !m.deletedAt).map((m) => m.value * 20)) || 60);
  const overall = clamp(memory * .3 + recall * .3 + attention * .25 + mood * .15);
  const completed = reminders.filter((r) => r.completedAt).length;
  const adherence = reminders.length ? clamp((completed / reminders.length) * 100) : 100;
  return { memory, recall, attention, mood, overall, adherence, attempts: active.length };
}

export function trendSeries(results, days = 7) {
  const output = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const day = results.filter((r) => new Date(r.createdAt) >= d && new Date(r.createdAt) < next);
    output.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), value: clamp(average(day.map((r) => r.score))) });
  }
  return output;
}

export function detectAlerts(results, reminders, lastActiveAt) {
  const alerts = [];
  if (Date.now() - new Date(lastActiveAt || 0).getTime() > 72 * 3600_000) alerts.push({ type: "inactive", message: "No activity has been recorded for 3 days." });
  const analytics = calculateAnalytics(results, [], reminders);
  if (reminders.length && analytics.adherence < 50) alerts.push({ type: "adherence", message: "Reminder adherence is below 50% this week." });
  const sorted = [...results].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const cutoff7 = Date.now() - 7 * 86400_000, cutoff30 = Date.now() - 30 * 86400_000;
  const avg7 = average(sorted.filter((r) => new Date(r.createdAt).getTime() >= cutoff7).map((r) => r.score));
  const avg30 = average(sorted.filter((r) => { const t = new Date(r.createdAt).getTime(); return t >= cutoff30 && t < cutoff7; }).map((r) => r.score));
  if (avg30 && avg7 < avg30 * .85) alerts.push({ type: "trend", message: "The 7-day engagement score is over 15% below the 30-day baseline." });
  return alerts;
}

export function achievementState({ results, reminders, streak }) {
  const completed = reminders.filter((r) => r.completedAt).length;
  return [
    ["first-step", "First Step", true], ["first-game", "First Game", results.length >= 1],
    ["seven-day", "7-Day Streak", streak >= 7], ["memory-master", "Memory Master", results.some((r) => r.game === "memory" && r.accuracy >= 90)],
    ["reminder-champion", "Reminder Champion", completed >= 7], ["consistency-hero", "Consistency Hero", results.length >= 10]
  ].map(([id, name, unlocked]) => ({ id, name, unlocked }));
}
