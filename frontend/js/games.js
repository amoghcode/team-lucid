import { scoreSession } from "./analytics.js";
import { t } from "./i18n.js";

export const GAME_META = {
  memory: { get title() { return t("gameMemoryTitle"); }, icon: "🦏", get description() { return t("gameMemoryDescription"); } },
  objects: { get title() { return t("gameObjectsTitle"); }, icon: "🧺", get description() { return t("gameObjectsDescription"); } },
  routine: { get title() { return t("gameRoutineTitle"); }, icon: "🌤️", get description() { return t("gameRoutineDescription"); } },
  pattern: { get title() { return t("gamePatternTitle"); }, icon: "🧵", get description() { return t("gamePatternDescription"); } },
  family: { get title() { return t("gameFamilyTitle"); }, icon: "💛", get description() { return t("gameFamilyDescription"); } },
  // Keep the legacy `emotion` id for stored-result and API compatibility.
  emotion: { get title() { return t("gameSequenceTitle"); }, icon: "✨", get description() { return t("gameSequenceDescription"); } }
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
  ({ memory: memoryMatch, objects: objectRecall, routine: routineRecall, pattern: patternGame, family: familyGame, emotion: sequenceMemory }[game] || memoryMatch)(root, options.level, {
    hit() { correct++; attempts++; }, miss() { mistakes++; attempts++; }, finish
  }, options.family || []);
}

function memoryMatch(root, level, score) {
  const pool = [["🦏", "rhino"], ["🐘", "elephant"], ["🦋", "butterfly"], ["🍃", "teaLeaf"], ["🐦", "hornbill"], ["🎋", "bamboo"], ["🌺", "orchid"], ["🐒", "gibbon"], ["🦌", "deer"], ["🫖", "teaPot"]].map(([icon, key]) => [icon, t(key)]);
  const count = difficultyCount(level, [3, 6, 8]);
  const cards = shuffle(pool.slice(0, count).flatMap(([icon, label], pair) => [{ icon, label, pair }, { icon, label, pair }]));
  let first = null, locked = false, found = 0;
  root.innerHTML = `<p class="game-instruction">${t("memoryInstruction")}</p><div class="memory-grid" style="--columns:${count > 6 ? 4 : count > 3 ? 4 : 3}">${cards.map((c, i) => `<button class="memory-card" data-index="${i}" aria-label="${t("hiddenCard", { number: i + 1 })}"><span aria-hidden="true">?</span></button>`).join("")}</div>`;
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
  const objects = [["🧺", "caneBasket"], ["🫖", "teaPot"], ["☂️", "umbrella"], ["🔑", "keys"], ["🪔", "lamp"], ["🧣", "gamosa"], ["🥣", "riceBowl"]].map(([icon, key]) => [icon, t(key)]);
  const count = difficultyCount(level, [3, 4, 5]);
  const shown = shuffle(objects).slice(0, count);
  root.innerHTML = `<p class="game-instruction">${t("rememberObjects")}</p><div class="object-display">${shown.map(([icon, label]) => `<div><span>${icon}</span><b>${label}</b></div>`).join("")}</div><button class="primary-button" id="recall-ready">${t("iAmReady")}</button>`;
  root.querySelector("#recall-ready").onclick = () => {
    const choices = shuffle([...shown, ...objects.filter((o) => !shown.includes(o)).slice(0, count)]);
    const selected = new Set();
    root.innerHTML = `<p class="game-instruction">${t("whichObjects", { count })}</p><div class="choice-grid">${choices.map(([icon, label], i) => `<button class="choice-card" data-index="${i}"><span>${icon}</span>${label}</button>`).join("")}</div><button class="primary-button" id="check-recall" disabled>${t("checkAnswers")}</button>`;
    root.onclick = (event) => {
      const choice = event.target.closest(".choice-card");
      if (choice) { const i = Number(choice.dataset.index); selected.has(i) ? selected.delete(i) : selected.add(i); choice.classList.toggle("selected"); root.querySelector("#check-recall").disabled = selected.size !== count; }
      if (event.target.id === "check-recall") { for (const i of selected) shown.some((o) => o[1] === choices[i][1]) ? score.hit() : score.miss(); score.finish(count); }
    };
  };
}

function routineRecall(root, level, score) {
  const steps = ["wakeUp", "washDress", "eatBreakfast", "morningMedicine", "gardenWalk", "callFamily"].map(t);
  const count = difficultyCount(level, [3, 4, 6]);
  const ordered = steps.slice(0, count), choices = shuffle(ordered); let next = 0;
  root.innerHTML = `<p class="game-instruction">${t("routineInstruction")}</p><div class="sequence-progress" id="sequence-progress"></div><div class="choice-grid">${choices.map((label, i) => `<button class="choice-card routine-choice" data-value="${label}" data-index="${i}">${label}</button>`).join("")}</div>`;
  root.onclick = (event) => {
    const choice = event.target.closest(".routine-choice"); if (!choice || choice.disabled) return;
    if (choice.dataset.value === ordered[next]) { score.hit(); choice.disabled = true; choice.classList.add("correct"); next++; root.querySelector("#sequence-progress").textContent = ordered.slice(0, next).join("  →  "); if (next === count) score.finish(count); }
    else { score.miss(); choice.classList.add("shake"); setTimeout(() => choice.classList.remove("shake"), 400); }
  };
}

function patternGame(root, level, score) {
  const rounds = difficultyCount(level, [3, 4, 5]); let round = 0, accepting = true;
  const patterns = {
    easy: [
      { label: t("patternAlternating"), seq: ["◆", "●", "◆", "●"], answer: "◆", options: ["▲", "◆", "■"] },
      { label: t("patternColours"), seq: ["🟦", "🟦", "🟩", "🟦", "🟦"], answer: "🟩", options: ["🟨", "🟦", "🟩"] },
      { label: t("patternPlant"), seq: ["🌱", "🌿", "🌳", "🌱"], answer: "🌿", options: ["🌳", "🌱", "🌿"] }
    ],
    medium: [
      { label: t("patternCorners"), seq: ["◢", "◣", "◤", "◥"], answer: "◢", options: ["◥", "◢", "◣"] },
      { label: t("patternOneTwo"), seq: ["●", "◆", "◆", "●", "◆", "◆"], answer: "●", options: ["◆", "▲", "●"] },
      { label: t("patternSteps"), seq: ["1", "2", "4", "7"], answer: "11", options: ["9", "10", "11"] },
      { label: t("patternWoven"), seq: ["🟨", "🟪", "🟪", "🟨", "🟪", "🟪"], answer: "🟨", options: ["🟪", "🟨", "🟦"] }
    ],
    hard: [
      { label: t("patternDouble"), seq: ["2", "4", "8", "16"], answer: "32", options: ["24", "32", "20"] },
      { label: t("patternTwoPaths"), seq: ["▲1", "●2", "▲3", "●4", "▲5"], answer: "●6", options: ["▲6", "●6", "●5"] },
      { label: t("patternGaps"), seq: ["3", "5", "8", "12"], answer: "17", options: ["16", "18", "17"] },
      { label: t("patternMirror"), seq: ["◀", "▲", "▶", "▼", "◀"], answer: "▲", options: ["▼", "▲", "▶"] },
      { label: t("patternPairs"), seq: ["1", "1", "2", "2", "3", "3"], answer: "4", options: ["3", "4", "5"] }
    ]
  }[level] || [];
  const draw = () => {
    accepting = true;
    const p = patterns[round];
    root.innerHTML = `<div class="game-progress" aria-label="${t("roundOf", { current: round + 1, total: rounds })}"><span style="--progress:${((round + 1) / rounds) * 100}%"></span></div><p class="game-instruction">${t("completePath")}</p><p class="pattern-label">${p.label} · ${t("roundOf", { current: round + 1, total: rounds })}</p><div class="pattern-row" aria-label="${t("patternAria", { label: p.label, sequence: p.seq.join(", ") })}">${p.seq.map((x, index) => `<span><small>${index + 1}</small>${x}</span>`).join('<i aria-hidden="true">→</i>')}<i aria-hidden="true">→</i><span class="missing"><small>${p.seq.length + 1}</small>?</span></div><div class="answer-row" aria-label="${t("chooseNext")}">${p.options.map((x) => `<button class="choice-card pattern-choice" data-value="${x}" aria-label="${t("chooseValue", { value: x })}">${x}</button>`).join("")}</div><p class="game-feedback" role="status" aria-live="polite"></p>`;
  };
  root.onclick = (event) => {
    const choice = event.target.closest(".pattern-choice"); if (!choice || !accepting) return;
    const feedback = root.querySelector(".game-feedback");
    if (choice.dataset.value !== patterns[round].answer) {
      score.miss(); choice.classList.add("incorrect"); feedback.textContent = t("patternTryAgain"); return;
    }
    accepting = false; score.hit(); choice.classList.add("correct"); feedback.textContent = t("patternComplete"); round++;
    setTimeout(() => round >= rounds ? score.finish(rounds) : draw(), 650);
  };
  draw();
}

function familyGame(root, level, score, family) {
  if (!family.length) { root.innerHTML = `<div class="empty-state"><span>💛</span><h3>${t("addFamilyFirst")}</h3><p>${t("caregiverCanAdd")}</p></div>`; return; }
  const rounds = Math.min(difficultyCount(level, [2, 3, 4]), family.length); const people = shuffle(family).slice(0, rounds); let round = 0, stage = "name";
  const draw = () => {
    const person = people[round]; const field = stage === "name" ? "name" : "relationship";
    const alternatives = family.map((p) => p[field]).filter((v) => v !== person[field]);
    const fallback = field === "name" ? ["Mili", "Ranjit", "Ananya", "Bina"] : ["Daughter", "Son", "Grandchild", "Sister"];
    const options = shuffle([person[field], ...shuffle([...new Set([...alternatives, ...fallback])]).filter((v) => v !== person[field]).slice(0, 3)]);
    root.innerHTML = `<p class="game-instruction">${stage === "name" ? t("who") : t("relationshipQ")}</p><img class="family-game-photo" src="${person.photoUrl || person.photoData}" alt="${t("familyMember")}"><div class="answer-row">${options.map((x) => `<button class="choice-card family-choice" data-value="${x}">${t(`relationship${x}`, {}, x)}</button>`).join("")}</div>`;
  };
  root.onclick = (event) => { const choice = event.target.closest(".family-choice"); if (!choice) return; const person = people[round]; const expected = stage === "name" ? person.name : person.relationship; choice.dataset.value === expected ? score.hit() : score.miss(); if (stage === "name") stage = "relationship"; else { stage = "name"; round++; } round >= rounds ? score.finish(rounds * 2) : draw(); };
  draw();
}

function sequenceMemory(root, level, score) {
  const tiles = [
    { id: "leaf", icon: "🍃", label: t("tileLeaf") },
    { id: "sun", icon: "☀️", label: t("tileSun") },
    { id: "drop", icon: "💧", label: t("tileWater") },
    { id: "flower", icon: "🌼", label: t("tileFlower") },
    { id: "bird", icon: "🐦", label: t("tileBird") },
    { id: "moon", icon: "🌙", label: t("tileMoon") },
    { id: "tree", icon: "🌳", label: t("tileTree") },
    { id: "star", icon: "⭐", label: t("tileStar") },
    { id: "home", icon: "🏠", label: t("tileHome") }
  ];
  const rounds = difficultyCount(level, [3, 4, 5]);
  const startingLength = difficultyCount(level, [2, 3, 4]);
  const sequences = Array.from({ length: rounds }, (_, index) => Array.from({ length: startingLength + index }, () => tiles[Math.floor(Math.random() * tiles.length)].id));
  let round = 0, input = [], accepting = false, timer;

  const buttons = () => tiles.map(({ id, icon, label }) => `<button class="sequence-tile" data-value="${id}" aria-label="${label}" disabled><span aria-hidden="true">${icon}</span><small>${label}</small></button>`).join("");
  const setControls = (enabled) => root.querySelectorAll(".sequence-tile").forEach((button) => { button.disabled = !enabled; });
  const showSequence = () => {
    const sequence = sequences[round]; let index = 0;
    accepting = false; input = []; setControls(false);
    root.querySelector(".sequence-status").textContent = t("watchSequence");
    root.querySelector(".sequence-progress").textContent = "";
    const reveal = () => {
      root.querySelectorAll(".sequence-tile").forEach((button) => button.classList.remove("active"));
      if (index >= sequence.length) {
        accepting = true; setControls(true); root.querySelector(".sequence-status").textContent = t("repeatSequence"); return;
      }
      const active = root.querySelector(`[data-value="${sequence[index]}"]`); active.classList.add("active");
      index++; timer = setTimeout(() => { active.classList.remove("active"); timer = setTimeout(reveal, 260); }, 620);
    };
    timer = setTimeout(reveal, 500);
  };
  const draw = () => {
    const length = sequences[round].length;
    root.innerHTML = `<div class="game-progress" aria-label="${t("roundOf", { current: round + 1, total: rounds })}"><span style="--progress:${((round + 1) / rounds) * 100}%"></span></div><p class="game-instruction">${t("rememberSteps", { count: length })} · ${t("roundOf", { current: round + 1, total: rounds })}</p><h2 class="sequence-status" aria-live="polite">${t("getReady")}</h2><div class="sequence-board">${buttons()}</div><div class="sequence-progress" aria-label="${t("yourProgress")}"></div><p class="game-feedback" role="status" aria-live="polite"></p>`;
    showSequence();
  };
  root.onclick = (event) => {
    const choice = event.target.closest(".sequence-tile"); if (!choice || !accepting) return;
    const sequence = sequences[round], position = input.length;
    if (choice.dataset.value !== sequence[position]) {
      accepting = false; score.miss(); choice.classList.add("incorrect"); root.querySelector(".game-feedback").textContent = t("sequenceTryAgain");
      timer = setTimeout(() => { choice.classList.remove("incorrect"); showSequence(); }, 900); return;
    }
    input.push(choice.dataset.value); choice.classList.add("correct"); setTimeout(() => choice.classList.remove("correct"), 260);
    root.querySelector(".sequence-progress").textContent = input.map(() => "●").join("  ");
    if (input.length === sequence.length) {
      accepting = false; score.hit(); setControls(false); root.querySelector(".game-feedback").textContent = t("sequenceRemembered"); round++;
      timer = setTimeout(() => round >= rounds ? score.finish(rounds) : draw(), 700);
    }
  };
  draw();
}
