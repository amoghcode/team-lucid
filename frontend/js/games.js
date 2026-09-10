import { scoreSession } from "./analytics.js";

export const GAME_META = {
  memory: { title: "Memory Match", icon: "🦏", description: "Find matching wildlife and tea-garden cards." },
  objects: { title: "Object Recall", icon: "🧺", description: "Remember familiar objects from home." },
  routine: { title: "Daily Routine", icon: "🌤️", description: "Put a gentle daily routine in order." },
  pattern: { title: "Pattern Paths", icon: "🧵", description: "Complete patterns inspired by woven motifs." },
  family: { title: "Family Faces", icon: "💛", description: "Recall the names and relationships of loved ones." },
  emotion: { title: "Emotion Match", icon: "😊", description: "Recognise feelings in friendly expressions." }
};

const shuffle = (items) => [...items].sort(() => Math.random() - .5);
const difficultyCount = (level, values) => values[{ easy: 0, medium: 1, hard: 2 }[level] ?? 0];

export function startGame(game, root, options) {
  const started = performance.now();
  let correct = 0, attempts = 0, mistakes = 0;
  const finish = (total, extra = {}) => {
    const responseTime = Math.max(1, (performance.now() - started) / 1000);
    const metrics = scoreSession({ correct, attempts: Math.max(attempts, total), responseTime, targetTime: difficultyCount(options.level, [80, 65, 50]), completed: true });
    options.onComplete({ ...metrics, mistakes, responseTime: Math.round(responseTime), ...extra });
  };
  ({ memory: memoryMatch, objects: objectRecall, routine: routineRecall, pattern: patternGame, family: familyGame, emotion: emotionGame }[game] || memoryMatch)(root, options.level, {
    hit() { correct++; attempts++; }, miss() { mistakes++; attempts++; }, finish
  }, options.family || []);
}

function memoryMatch(root, level, score) {
  const pool = [["🦏", "Rhino"], ["🐘", "Elephant"], ["🦋", "Butterfly"], ["🍃", "Tea leaf"], ["🐦", "Hornbill"], ["🎋", "Bamboo"], ["🌺", "Orchid"], ["🐒", "Hoolock gibbon"], ["🦌", "Deer"], ["🫖", "Tea pot"]];
  const count = difficultyCount(level, [3, 6, 8]);
  const cards = shuffle(pool.slice(0, count).flatMap(([icon, label], pair) => [{ icon, label, pair }, { icon, label, pair }]));
  let first = null, locked = false, found = 0;
  root.innerHTML = `<p class="game-instruction">Choose two cards. Find every matching pair.</p><div class="memory-grid" style="--columns:${count > 6 ? 4 : count > 3 ? 4 : 3}">${cards.map((c, i) => `<button class="memory-card" data-index="${i}" aria-label="Hidden card ${i + 1}"><span aria-hidden="true">?</span></button>`).join("")}</div>`;
  root.onclick = (event) => {
    const button = event.target.closest(".memory-card"); if (!button || locked || button.classList.contains("matched") || button === first) return;
    const card = cards[Number(button.dataset.index)]; button.innerHTML = `<span aria-hidden="true">${card.icon}</span><small>${card.label}</small>`; button.classList.add("flipped");
    if (!first) { first = button; return; }
    const firstCard = cards[Number(first.dataset.index)];
    if (firstCard.pair === card.pair) {
      score.hit(); first.classList.add("matched"); button.classList.add("matched"); first = null; found++;
      if (found === count) setTimeout(() => score.finish(count), 450);
    } else {
      score.miss(); locked = true; const previous = first; first = null;
      setTimeout(() => { for (const el of [previous, button]) { el.innerHTML = "<span aria-hidden='true'>?</span>"; el.classList.remove("flipped"); } locked = false; }, 800);
    }
  };
}

function objectRecall(root, level, score) {
  const objects = [["🧺", "Cane basket"], ["🫖", "Tea pot"], ["☂️", "Umbrella"], ["🔑", "Keys"], ["🪔", "Lamp"], ["🧣", "Gamosa"], ["🥣", "Rice bowl"]];
  const count = difficultyCount(level, [3, 4, 5]);
  const shown = shuffle(objects).slice(0, count);
  root.innerHTML = `<p class="game-instruction">Take a moment to remember these objects.</p><div class="object-display">${shown.map(([icon, label]) => `<div><span>${icon}</span><b>${label}</b></div>`).join("")}</div><button class="primary-button" id="recall-ready">I am ready</button>`;
  root.querySelector("#recall-ready").onclick = () => {
    const choices = shuffle([...shown, ...objects.filter((o) => !shown.includes(o)).slice(0, count)]);
    const selected = new Set();
    root.innerHTML = `<p class="game-instruction">Which objects did you see? Choose ${count}.</p><div class="choice-grid">${choices.map(([icon, label], i) => `<button class="choice-card" data-index="${i}"><span>${icon}</span>${label}</button>`).join("")}</div><button class="primary-button" id="check-recall" disabled>Check my answers</button>`;
    root.onclick = (event) => {
      const choice = event.target.closest(".choice-card");
      if (choice) { const i = Number(choice.dataset.index); selected.has(i) ? selected.delete(i) : selected.add(i); choice.classList.toggle("selected"); root.querySelector("#check-recall").disabled = selected.size !== count; }
      if (event.target.id === "check-recall") { for (const i of selected) shown.some((o) => o[1] === choices[i][1]) ? score.hit() : score.miss(); score.finish(count); }
    };
  };
}

function routineRecall(root, level, score) {
  const steps = ["Wake up", "Wash and dress", "Eat breakfast", "Take morning medicine", "Walk in the garden", "Call family"];
  const count = difficultyCount(level, [3, 4, 6]);
  const ordered = steps.slice(0, count), choices = shuffle(ordered); let next = 0;
  root.innerHTML = `<p class="game-instruction">Tap the activities in the order you would do them.</p><div class="sequence-progress" id="sequence-progress"></div><div class="choice-grid">${choices.map((label, i) => `<button class="choice-card routine-choice" data-value="${label}" data-index="${i}">${label}</button>`).join("")}</div>`;
  root.onclick = (event) => {
    const choice = event.target.closest(".routine-choice"); if (!choice || choice.disabled) return;
    if (choice.dataset.value === ordered[next]) { score.hit(); choice.disabled = true; choice.classList.add("correct"); next++; root.querySelector("#sequence-progress").textContent = ordered.slice(0, next).join("  →  "); if (next === count) score.finish(count); }
    else { score.miss(); choice.classList.add("shake"); setTimeout(() => choice.classList.remove("shake"), 400); }
  };
}

function patternGame(root, level, score) {
  const rounds = difficultyCount(level, [3, 4, 5]); let round = 0;
  const patterns = [
    { seq: ["◆", "●", "◆", "●"], answer: "◆", options: ["◆", "▲", "■"] },
    { seq: ["🟦", "🟦", "🟩", "🟦", "🟦"], answer: "🟩", options: ["🟩", "🟨", "🟦"] },
    { seq: ["◢", "◣", "◤", "◥"], answer: "◢", options: ["◥", "◢", "◣"] },
    { seq: ["🌱", "🌿", "🌳", "🌱"], answer: "🌿", options: ["🌳", "🌿", "🌱"] },
    { seq: ["1", "2", "4", "7"], answer: "11", options: ["9", "10", "11"] }
  ];
  const draw = () => {
    const p = patterns[round]; root.innerHTML = `<p class="game-instruction">What comes next? Round ${round + 1} of ${rounds}</p><div class="pattern-row">${p.seq.map((x) => `<span>${x}</span>`).join("")}<span class="missing">?</span></div><div class="answer-row">${p.options.map((x) => `<button class="choice-card pattern-choice" data-value="${x}">${x}</button>`).join("")}</div>`;
  };
  root.onclick = (event) => { const choice = event.target.closest(".pattern-choice"); if (!choice) return; choice.dataset.value === patterns[round].answer ? score.hit() : score.miss(); round++; round >= rounds ? score.finish(rounds) : draw(); };
  draw();
}

function familyGame(root, level, score, family) {
  if (!family.length) { root.innerHTML = `<div class="empty-state"><span>💛</span><h3>Add family memories first</h3><p>A caregiver can add a photo, name and relationship.</p></div>`; return; }
  const rounds = Math.min(difficultyCount(level, [2, 3, 4]), family.length); const people = shuffle(family).slice(0, rounds); let round = 0, stage = "name";
  const draw = () => {
    const person = people[round]; const field = stage === "name" ? "name" : "relationship";
    const alternatives = family.map((p) => p[field]).filter((v) => v !== person[field]);
    const fallback = field === "name" ? ["Mili", "Ranjit", "Ananya", "Bina"] : ["Daughter", "Son", "Grandchild", "Sister"];
    const options = shuffle([person[field], ...shuffle([...new Set([...alternatives, ...fallback])]).filter((v) => v !== person[field]).slice(0, 3)]);
    root.innerHTML = `<p class="game-instruction">${stage === "name" ? "Who is this?" : "How are they related to you?"}</p><img class="family-game-photo" src="${person.photoUrl || person.photoData}" alt="Family member"><div class="answer-row">${options.map((x) => `<button class="choice-card family-choice" data-value="${x}">${x}</button>`).join("")}</div>`;
  };
  root.onclick = (event) => { const choice = event.target.closest(".family-choice"); if (!choice) return; const person = people[round]; const expected = stage === "name" ? person.name : person.relationship; choice.dataset.value === expected ? score.hit() : score.miss(); if (stage === "name") stage = "relationship"; else { stage = "name"; round++; } round >= rounds ? score.finish(rounds * 2) : draw(); };
  draw();
}

function emotionGame(root, level, score) {
  const emotions = [["😊", "Happy"], ["😌", "Calm"], ["😟", "Worried"], ["😢", "Sad"], ["😮", "Surprised"]];
  const rounds = difficultyCount(level, [3, 4, 5]); const questions = shuffle(emotions).slice(0, rounds); let round = 0;
  const draw = () => { const [face, answer] = questions[round]; const options = shuffle([answer, ...shuffle(emotions.map((x) => x[1]).filter((x) => x !== answer)).slice(0, 3)]); root.innerHTML = `<p class="game-instruction">How does this person feel? Round ${round + 1} of ${rounds}</p><div class="emotion-face" role="img" aria-label="Expression to recognise">${face}</div><div class="answer-row">${options.map((x) => `<button class="choice-card emotion-choice" data-value="${x}">${x}</button>`).join("")}</div>`; };
  root.onclick = (event) => { const choice = event.target.closest(".emotion-choice"); if (!choice) return; choice.dataset.value === questions[round][1] ? score.hit() : score.miss(); round++; round >= rounds ? score.finish(rounds) : draw(); };
  draw();
}
