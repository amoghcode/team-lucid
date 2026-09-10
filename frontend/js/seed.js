import { db, timestamp, uid } from "./db.js";
import { saveSession } from "./api.js";

const daysAgo = (days, hour = 9) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

export async function seedDemo(force = false) {
  if (force) await db.clearAll();
  if (await db.setting("seeded")) return;
  const now = timestamp();
  const common = { familyAccountId: "demo-family", deviceId: "demo-device", demoOnly: true, syncStatus: "local", updatedAt: now };
  await db.put("profiles", { ...common, id: "demo-profile", patientName: "Aita", caregiverName: "Ananya", caregiverPinVerifier: "demo:2468", createdAt: now, lastActiveAt: now });
  const family = [
    ["demo-ananya", "Ananya", "Daughter", "./assets/images/demo-ananya.png"],
    ["demo-ranjit", "Ranjit", "Son", "./assets/images/demo-ranjit.png"],
    ["demo-mili", "Mili", "Granddaughter", "./assets/images/demo-mili.png"]
  ];
  for (const [id, name, relationship, photoUrl] of family) await db.put("familyMembers", { ...common, id, name, relationship, photoUrl, createdAt: now });
  const reminders = [
    ["morning-medicine", "Morning medicine", "medication", "08:00", true],
    ["water", "Drink a glass of water", "hydration", "10:30", true],
    ["walk", "Garden walk", "exercise", "17:00", false],
    ["call", "Call Mili", "daily", "19:00", false]
  ];
  for (const [id, title, category, time, complete] of reminders) await db.put("reminders", { ...common, id, title, category, time, date: daysAgo(0).slice(0, 10), completedAt: complete ? now : null, createdAt: now });
  const games = ["memory", "objects", "routine", "pattern", "family", "emotion"];
  for (let day = 13; day >= 0; day--) {
    const count = day % 3 === 0 ? 2 : 1;
    for (let n = 0; n < count; n++) {
      const score = Math.max(54, 82 - day + ((day + n) % 7));
      await db.put("gameResults", { ...common, id: uid("demo-result"), game: games[(day + n) % games.length], difficulty: day < 4 ? "medium" : "easy", score, accuracy: Math.min(98, score + 4), speed: Math.max(45, score - 8), mistakes: score > 75 ? 1 : 3, responseTime: 32, completed: true, createdAt: daysAgo(day, 11 + n) });
    }
  }
  for (let day = 5; day >= 0; day--) await db.put("moods", { ...common, id: uid("demo-mood"), value: day % 3 === 0 ? 4 : 5, createdAt: daysAgo(day, 18) });
  await db.setSetting("seeded", true);
  await db.setSetting("demoMode", true);
  saveSession({ demo: true, profileId: "demo-profile" });
}

export async function resetDemo() { await seedDemo(true); }
