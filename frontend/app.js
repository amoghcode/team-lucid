import { db, active, timestamp, uid, tombstone } from "./js/db.js";
import { languages, t, setLanguage, getLanguage, locale } from "./js/i18n.js";
import { seedDemo, resetDemo } from "./js/seed.js";
import { api, authenticate, getSession, logout, syncNow } from "./js/api.js";
import { calculateAnalytics, adaptDifficulty, trendSeries, detectAlerts, achievementState } from "./js/analytics.js";
import { GAME_META, startGame } from "./js/games.js";

const main = document.querySelector("#app-main");
const header = document.querySelector("#app-header");
const bottomNav = document.querySelector("#bottom-nav");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");
const offlineBanner = document.querySelector("#offline-banner");
let appState = {};
let activeChart;
let installEvent;

const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const session = () => getSession();
const formatDate = (date) => new Intl.DateTimeFormat(locale(), { weekday: "long", day: "numeric", month: "long" }).format(date);
const iconFor = (category) => ({ medication: "💊", hydration: "💧", exercise: "🌿", appointment: "📅", daily: "☀️" })[category] || "◷";

async function loadState() {
  const [profiles, reminders, moods, results, family] = await Promise.all(["profiles", "reminders", "moods", "gameResults", "familyMembers"].map((s) => db.all(s)));
  appState = { profile: active(profiles)[0], reminders: active(reminders), moods: active(moods), results: active(results), family: active(family) };
  appState.analytics = calculateAnalytics(appState.results, appState.moods, appState.reminders);
  appState.streak = calculateStreak(appState.results);
  appState.achievements = achievementState({ results: appState.results, reminders: appState.reminders, streak: appState.streak });
  appState.alerts = detectAlerts(appState.results, appState.reminders, appState.profile?.lastActiveAt || timestamp());
}

function calculateStreak(results) {
  const days = new Set(results.map((r) => r.createdAt.slice(0, 10))); let streak = 0; const cursor = new Date();
  for (let i = 0; i < 365; i++) { const key = cursor.toISOString().slice(0, 10); if (days.has(key)) streak++; else if (i > 0) break; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function showChrome(show = true, caregiver = false) {
  const headerLanguage = document.querySelector("#header-language-select"); if (headerLanguage) headerLanguage.value = getLanguage();
  header.hidden = !show; bottomNav.hidden = !show || caregiver;
  document.body.classList.toggle("caregiver-mode", caregiver);
  document.body.classList.toggle("patient-mode", show && !caregiver);
  document.querySelector("#role-button").textContent = caregiver ? "Patient" : "Caregiver";
  document.querySelector("#role-button").setAttribute("aria-label", caregiver ? "Return to patient view" : t("caregiver"));
}

function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", route.startsWith(link.dataset.nav)));
}

function toast(message) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = message; document.querySelector("#toast-region").append(el); setTimeout(() => el.remove(), 3500);
}

function openDialog(html) { dialogContent.innerHTML = `<div class="dialog-body">${html}</div>`; dialog.showModal(); dialog.querySelector("input,button")?.focus(); }
function closeDialog() { dialog.close(); dialogContent.innerHTML = ""; }

function landingPage() {
  showChrome(false);
  main.innerHTML = `<section class="landing">
    <nav class="landing-nav"><a class="brand" href="#/"><span class="brand-mark">S</span><span><strong>SmritiAI</strong><small>स्मृति · Memory</small></span></a>${languageSelect()}</nav>
    <div class="hero"><div class="hero-copy"><span class="tag">● Built for gentle daily support</span><h1>Every memory deserves a <em>familiar path home.</em></h1><p class="lead">Simple games, family moments, reminders and reassuring companionship — designed for older adults and the people who care for them.</p><div class="button-row"><button class="primary-button" id="demo-start">${t("demo")}</button><a class="secondary-button" href="#/auth">${t("login")}</a><button class="secondary-button" id="install-app" ${installEvent ? "" : "hidden"}>${t("install")}</button></div><div class="trust-row"><span>Works offline</span><span>Large, clear controls</span><span>Private family space</span></div></div>
    <div class="memory-window" aria-label="A sample family memory"><div class="sun-disc"></div><article class="memory-card-hero"><div class="family-collage"><img src="./assets/images/demo-ananya.png" alt="Fictional daughter Ananya"><img src="./assets/images/demo-ranjit.png" alt="Fictional son Ranjit"><img src="./assets/images/demo-mili.png" alt="Fictional granddaughter Mili"></div><blockquote>“These are the faces that make every day feel like home.”</blockquote><small>Fictional demo family</small></article></div></div></section>`;
  document.querySelector("#demo-start").onclick = async () => { await seedDemo(); await loadState(); location.hash = "#/patient"; };
  document.querySelector("#install-app").onclick = async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; document.querySelector("#install-app").hidden = true; } };
  bindLanguageSelect();
}

function languageOptions() { return Object.entries(languages).map(([code, name]) => `<option value="${code}" ${getLanguage() === code ? "selected" : ""}>${name}</option>`).join(""); }
function languageSelect() { return `<select class="language-select" id="language-select" aria-label="Language">${languageOptions()}</select>`; }
function bindLanguageSelect() { document.querySelectorAll(".language-select").forEach((select) => select.addEventListener("change", (event) => { setLanguage(event.target.value); render(); })); }

function authPage() {
  showChrome(false); let mode = "login";
  const draw = () => {
    main.innerHTML = `<section class="landing"><nav class="landing-nav"><a class="brand" href="#/"><span class="brand-mark">S</span><span><strong>SmritiAI</strong><small>स्मृति · Memory</small></span></a>${languageSelect()}</nav><div class="auth-panel"><p class="eyebrow">One family space</p><h1>${mode === "login" ? t("login") : t("register")}</h1><p class="muted">${mode === "login" ? "Welcome back. Your family space stays available on this device." : "Set up one shared account. The caregiver area is protected by a separate PIN."}</p><div class="auth-tabs"><button data-mode="login" class="${mode === "login" ? "active" : ""}">${t("login")}</button><button data-mode="register" class="${mode === "register" ? "active" : ""}">${t("register")}</button></div><form id="auth-form">
      ${mode === "register" ? `<div class="field"><label for="patient-name">${t("patientName")}</label><input id="patient-name" name="patientName" required maxlength="80" autocomplete="name"></div><div class="field"><label for="caregiver-name">Caregiver name</label><input id="caregiver-name" name="caregiverName" required maxlength="80"></div>` : ""}
      <div class="field"><label for="email">${t("email")}</label><input id="email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="password">${t("password")}</label><input id="password" name="password" type="password" required minlength="8" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></div>
      ${mode === "register" ? `<div class="field"><label for="pin">${t("pin")}</label><input class="pin-input" id="pin" name="caregiverPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="new-password"><small class="form-help">Use 4–8 digits. This keeps caregiver information away from accidental taps.</small></div>` : ""}
      <button class="primary-button" type="submit">${mode === "login" ? t("login") : t("register")}</button></form><p id="auth-error" class="tiny-note" role="alert"></p><hr><button class="text-button" id="demo-start">No account? ${t("demo")}</button></div></section>`;
    bindLanguageSelect(); document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { mode = b.dataset.mode; draw(); });
    document.querySelector("#demo-start").onclick = async () => { await seedDemo(); await loadState(); location.hash = "#/patient"; };
    document.querySelector("#auth-form").onsubmit = async (event) => {
      event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const error = document.querySelector("#auth-error"); error.textContent = "Connecting securely…";
      try {
        const data = await authenticate(mode, form);
        await db.clearAll();
        sessionStorage.removeItem("caregiver_unlocked");
        if (data.profile) {
          await db.save("profiles", {
            ...data.profile,
            caregiverPinVerifier: mode === "register" ? await createPinVerifier(form.caregiverPin) : data.profile.caregiverPinVerifier
          }, false);
        }
        try { await syncNow(); } catch { /* first login still works offline after this */ }
        await loadState();
        location.hash = "#/patient";
      }
      catch (err) { error.textContent = navigator.onLine ? err.message : "Internet is needed for the first sign-in. The demo remains available offline."; }
    };
  }; draw();
}

function patientPage() {
  showChrome(true); setActiveNav("patient"); const a = appState.analytics; const name = appState.profile?.patientName || "Friend";
  const routines = [
    ["medicine", t("medicine"), "💊"], ["water", t("water"), "💧"], ["exercise", t("exercise"), "🌿"], ["activity", t("activity"), "☀️"]
  ];
  const today = new Date().toISOString().slice(0, 10);
  const nextReminder = [...appState.reminders].filter((r)=>!r.completedAt).sort((x,y)=>(x.time||"").localeCompare(y.time||""))[0];
  main.innerHTML = `<section class="page patient-page"><div class="simple-greeting"><div><p class="eyebrow">${formatDate(new Date())}</p><h1>Namaste, ${escapeHTML(name)}.</h1><p>What would you like to do?</p></div><div class="calm-score" aria-label="Cognitive wellness score ${a.overall||74} out of 100"><strong>${a.overall || 74}</strong><span>Wellness</span></div></div>
    <div class="patient-primary-actions"><a class="big-action play-action" href="#/games"><span aria-hidden="true">🎮</span><div><b>Play a game</b><small>Simple and enjoyable</small></div><strong aria-hidden="true">→</strong></a><a class="big-action" href="#/reminders"><span aria-hidden="true">🕘</span><div><b>${nextReminder?escapeHTML(nextReminder.title):"See reminders"}</b><small>${nextReminder?.time?`Today at ${escapeHTML(nextReminder.time)}`:"Nothing due right now"}</small></div><strong aria-hidden="true">→</strong></a></div>
    <article class="card simple-section"><h2>${t("dailyTasks")}</h2><p>Tap each one when it is done.</p><ul class="routine-list">${routines.map(([id,label,icon]) => { const saved = appState.reminders.find((r) => r.id === `routine-${today}-${id}`); return `<li><label><input type="checkbox" data-routine="${id}" ${saved?.completedAt ? "checked" : ""}><span>${icon} ${label}</span></label></li>`; }).join("")}</ul></article>
    <article class="card simple-section"><div class="simple-section-title"><div><h2>${t("mood")}</h2><p>Tap one face.</p></div><strong>${appState.streak} ${t("streak")}</strong></div><div class="mood-options" role="group" aria-label="Mood"><button class="mood-button" data-mood="1" aria-label="Very low">😢</button><button class="mood-button" data-mood="2" aria-label="Low">😟</button><button class="mood-button" data-mood="3" aria-label="Okay">😐</button><button class="mood-button" data-mood="4" aria-label="Good">🙂</button><button class="mood-button" data-mood="5" aria-label="Very good">😊</button></div></article>
    <article class="card sos-card simple-section"><div><h2>${t("emergency")}</h2><p>Press only when you need your caregiver now.</p><p class="tiny-note">${t("emergencyNote")}</p></div><button class="sos-button" id="sos-button">SOS</button></article><p class="tiny-note patient-disclaimer">${t("notDiagnosis")}</p></section>`;
  document.querySelectorAll("[data-routine]").forEach((box) => box.onchange = async () => { const id = `routine-${today}-${box.dataset.routine}`; await db.save("reminders", { id, title: box.parentElement.innerText.trim(), category: box.dataset.routine, date: today, time: "", completedAt: box.checked ? timestamp() : null, demoOnly: !!session()?.demo }, !session()?.demo); await refresh("Routine updated."); });
  document.querySelectorAll("[data-mood]").forEach((button) => button.onclick = async () => { document.querySelectorAll("[data-mood]").forEach((b) => b.classList.remove("selected")); button.classList.add("selected"); await db.save("moods", { value: Number(button.dataset.mood), demoOnly: !!session()?.demo }, !session()?.demo); await refresh("Thank you for sharing how you feel.", false); });
  document.querySelector("#sos-button").onclick = confirmSOS;
}

function gamesPage() {
  showChrome(true); setActiveNav("games");
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">A little play every day</p><h1>${t("games")}</h1><p class="lead">Choose anything that feels enjoyable. There is no rush.</p></div><span class="date-chip">${appState.results.length} games played</span></div><div class="game-grid">${Object.entries(GAME_META).map(([id,g]) => `<a class="game-card" href="#/game/${id}"><span class="game-icon">${g.icon}</span><h2>${g.title}</h2><p>${g.description}</p><strong>${t("play")} →</strong></a>`).join("")}</div></section>`;
}

async function gamePage(id) {
  const meta = GAME_META[id]; if (!meta) { location.hash = "#/games"; return; }
  showChrome(true); setActiveNav("games"); let level = await db.setting(`difficulty-${id}`, "easy");
  const drawIntro = () => {
    main.innerHTML = `<section class="page game-shell"><a class="text-button" href="#/games">← ${t("back")}</a><div class="game-toolbar"><div><p class="eyebrow">${meta.icon} Cognitive activity</p><h1>${meta.title}</h1></div><div class="difficulty" aria-label="Difficulty">${["easy","medium","hard"].map((x) => `<button data-level="${x}" class="${x === level ? "active" : ""}">${t(x)}</button>`).join("")}</div></div><div class="game-stage" id="game-stage"><div><span class="game-icon" style="margin-inline:auto">${meta.icon}</span><h2>${meta.description}</h2><p class="muted">Take your time. You can stop whenever you like.</p><button class="primary-button" id="start-game">${t("start")}</button></div></div></section>`;
    document.querySelectorAll("[data-level]").forEach((b) => b.onclick = async () => { level = b.dataset.level; await db.setSetting(`difficulty-${id}`, level); drawIntro(); });
    document.querySelector("#start-game").onclick = () => startGame(id, document.querySelector("#game-stage"), { level, family: appState.family, onComplete: (result) => finishGame(id, meta, level, result) });
  }; drawIntro();
}

async function finishGame(id, meta, level, result) {
  const record = await db.save("gameResults", { game: id, difficulty: level, ...result, completed: true, demoOnly: !!session()?.demo }, !session()?.demo);
  const next = adaptDifficulty([...appState.results.filter((r) => r.game === id), record], level); await db.setSetting(`difficulty-${id}`, next.level); await loadState();
  document.querySelector("#game-stage").innerHTML = `<article class="result-card"><p class="eyebrow">Well done</p><h2>You completed ${meta.title}</h2><div class="result-score" style="--score:${result.score}%"><strong>${result.score}</strong></div><p><b>${result.accuracy}% accuracy</b> · ${result.mistakes} ${result.mistakes === 1 ? "mistake" : "mistakes"}</p><p class="muted">${next.reason} Next level: ${next.level}.</p><div class="button-row" style="justify-content:center"><button class="primary-button" id="play-again">Play again</button><a class="secondary-button" href="#/games">All games</a></div></article>`;
  document.querySelector("#play-again").onclick = () => { location.hash = "#/games"; setTimeout(() => location.hash = `#/game/${id}`, 0); };
  speak(`Well done. Your score is ${result.score}.`);
}

function remindersPage() {
  showChrome(true); setActiveNav("reminders"); const sorted = [...appState.reminders].sort((a,b) => (a.time || "").localeCompare(b.time || ""));
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">A comfortable rhythm</p><h1>${t("reminders")}</h1><p class="lead">Clear prompts for the things that matter today.</p></div><button class="primary-button" id="add-reminder">+ ${t("addReminder")}</button></div><div class="list">${sorted.length ? sorted.map(reminderItem).join("") : `<div class="empty-state card"><span>◷</span><h2>${t("noReminders")}</h2></div>`}</div></section>`;
  document.querySelector("#add-reminder").onclick = () => reminderForm();
  document.querySelectorAll("[data-complete]").forEach((b) => b.onclick = async () => { const r = appState.reminders.find((x) => x.id === b.dataset.complete); await db.save("reminders", { ...r, completedAt: r.completedAt ? null : timestamp() }, !session()?.demo); await refresh("Reminder updated."); });
  document.querySelectorAll("[data-snooze]").forEach((b) => b.onclick = async () => { const r = appState.reminders.find((x) => x.id === b.dataset.snooze); const d = new Date(); d.setMinutes(d.getMinutes()+10); await db.save("reminders", { ...r, date: d.toISOString().slice(0,10), time: d.toTimeString().slice(0,5), snoozedAt: timestamp() }, !session()?.demo); await refresh("Snoozed for 10 minutes."); });
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => reminderForm(appState.reminders.find((x) => x.id === b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => confirmDelete("reminders", b.dataset.delete, "Delete this reminder?"));
}

function reminderItem(r) { return `<article class="list-item"><div class="list-item-main"><span class="item-icon">${iconFor(r.category)}</span><div><h3>${escapeHTML(r.title)}</h3><p>${escapeHTML(r.time || "Any time")} · ${escapeHTML(r.category || "daily")}${r.completedAt ? " · Completed" : ""}</p></div></div><div class="item-actions"><button class="small-button" data-complete="${r.id}">${r.completedAt ? "Undo" : t("complete")}</button><button class="small-button" data-snooze="${r.id}">${t("snooze")}</button><button class="small-button" data-edit="${r.id}">${t("edit")}</button><button class="small-button" data-delete="${r.id}" aria-label="Delete ${escapeHTML(r.title)}">×</button></div></article>`; }

function reminderForm(existing = {}) {
  openDialog(`<div class="dialog-head"><div><p class="eyebrow">Gentle prompt</p><h2>${existing.id ? t("edit") : t("addReminder")}</h2></div><button id="dialog-close" aria-label="Close">×</button></div><form id="reminder-form"><div class="field"><label>${t("title")}</label><input name="title" value="${escapeHTML(existing.title || "")}" maxlength="100" required></div><div class="field"><label>${t("category")}</label><select name="category">${["medication","hydration","exercise","appointment","daily"].map((x)=>`<option value="${x}" ${existing.category===x?"selected":""}>${x[0].toUpperCase()+x.slice(1)}</option>`).join("")}</select></div><div class="field"><label>${t("time")}</label><input name="time" type="time" value="${escapeHTML(existing.time || "09:00")}" required></div><div class="button-row"><button class="primary-button">${t("save")}</button><button class="secondary-button" type="button" id="dialog-cancel">${t("cancel")}</button></div></form>`);
  document.querySelector("#dialog-close").onclick = closeDialog; document.querySelector("#dialog-cancel").onclick = closeDialog;
  document.querySelector("#reminder-form").onsubmit = async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await db.save("reminders", { ...existing, ...data, date: existing.date || new Date().toISOString().slice(0,10), completedAt: existing.completedAt || null, demoOnly: !!session()?.demo }, !session()?.demo); closeDialog(); await refresh("Reminder saved."); };
}

function companionPage() {
  showChrome(true); setActiveNav("companion");
  const prompts = ["Tell me about a festival you enjoy.", "What did your childhood home look like?", "Who made you laugh today?", "Would you like to remember a favourite meal?"];
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">A listening space</p><h1>${t("companion")}</h1><p class="lead">Share a thought, remember a moment, or listen to a familiar story.</p></div></div><div class="companion-shell"><aside class="card"><h2>Memory prompts</h2><div class="prompt-cards">${prompts.map((p)=>`<button class="prompt-card" data-prompt="${p}">${p}</button>`).join("")}</div><button class="secondary-button" id="story-button" style="margin-top:1rem;width:100%">📖 ${t("story")}</button></aside><article class="card chat-card"><div class="chat-log" id="chat-log"><div class="bubble">${t("supportive")} Would you like to share a memory?</div></div><form class="chat-form" id="chat-form"><input name="message" aria-label="${t("companionPrompt")}" placeholder="${t("companionPrompt")}" autocomplete="off"><button class="primary-button">${t("send")}</button></form></article></div></section>`;
  const respond = (message) => { const log = document.querySelector("#chat-log"); log.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHTML(message)}</div>`); const response = companionResponse(message); setTimeout(()=>{ log.insertAdjacentHTML("beforeend", `<div class="bubble">${escapeHTML(response)}</div>`); log.scrollTop=log.scrollHeight; speak(response); },350); };
  document.querySelector("#chat-form").onsubmit = (e) => { e.preventDefault(); const input=e.currentTarget.message; if(input.value.trim()) respond(input.value.trim()); input.value=""; };
  document.querySelectorAll("[data-prompt]").forEach((b)=>b.onclick=()=>respond(b.dataset.prompt));
  document.querySelector("#story-button").onclick=()=>respond("Please tell me a story.");
}

function companionResponse(message) {
  const lower=message.toLowerCase();
  if(lower.includes("story")) return "Long ago, beside the Brahmaputra, a small hornbill lost its way in the evening rain. A kind tea-garden keeper sheltered it beneath a bamboo roof. At sunrise, the bird sang, and its family answered from the trees. The keeper smiled: familiar voices can help us find our way home.";
  if(lower.includes("sad")||lower.includes("worried")||lower.includes("afraid")) return "Thank you for telling me. You are not alone. Let us take one slow breath together, and then we can look at a familiar family photo.";
  if(lower.includes("festival")||lower.includes("bihu")) return "That sounds like a warm memory. What music, food, or person do you remember most clearly?";
  if(lower.includes("childhood")||lower.includes("home")) return "Take your time. Perhaps begin with one small detail — a sound, a doorway, or someone who was there.";
  return "I am listening. That memory matters. What is one detail you would like to hold onto?";
}

function caregiverShell(activeRoute, content) {
  return `<section class="page"><div class="caregiver-layout"><nav class="side-nav" aria-label="Caregiver navigation"><a class="${activeRoute==="caregiver"?"active":""}" href="#/caregiver">▦ Overview</a><a class="${activeRoute==="family"?"active":""}" href="#/caregiver/family">♡ Family</a><a class="${activeRoute==="analytics"?"active":""}" href="#/caregiver/analytics">↗ Analytics</a><button id="return-patient">← Patient view</button><button id="sign-out">Sign out</button></nav><div>${content}</div></div></section>`;
}

function caregiverPage() {
  showChrome(true,true); const a=appState.analytics;
  main.innerHTML=caregiverShell("caregiver",`<div class="page-heading"><div><p class="eyebrow">Caregiver overview</p><h1>${escapeHTML(appState.profile?.patientName || "Patient")}'s week</h1><p class="lead">A clear view of routines and engagement — never a diagnosis.</p></div><button class="primary-button" id="download-report">↓ ${t("report")}</button></div><div class="metric-grid"><div class="metric-card"><small>Wellness score</small><strong>${a.overall}</strong><p class="tiny-note">Engagement indicator</p></div><div class="metric-card"><small>Games played</small><strong>${a.attempts}</strong><p class="tiny-note">All recorded sessions</p></div><div class="metric-card"><small>Reminder adherence</small><strong>${a.adherence}%</strong><p class="tiny-note">Current records</p></div><div class="metric-card"><small>Daily streak</small><strong>${appState.streak}</strong><p class="tiny-note">Consecutive days</p></div></div><div class="analytics-grid"><article class="card chart-wrap"><div class="page-heading"><div><p class="eyebrow">7-day pattern</p><h2>Cognitive engagement</h2></div><a class="text-button" href="#/caregiver/analytics">Details →</a></div><canvas id="trend-chart" aria-label="Seven day engagement trend"></canvas></article><article class="card"><p class="eyebrow">Needs attention</p><h2>${t("alerts")}</h2><div class="alert-list">${appState.alerts.length?appState.alerts.map((x)=>`<div class="alert">${escapeHTML(x.message)}</div>`).join(""):`<div class="empty-state"><span>✓</span><p>No current care alerts.</p></div>`}</div></article></div><article class="card" style="margin-top:1rem"><div class="page-heading"><div><p class="eyebrow">Encouragement</p><h2>${t("achievements")}</h2></div></div><div class="achievement-grid">${appState.achievements.map((x)=>`<div class="achievement ${x.unlocked?"unlocked":""}"><span>${x.unlocked?"🏅":"○"}</span><b>${x.name}</b></div>`).join("")}</div></article><p class="tiny-note" style="margin-top:1rem">${t("notDiagnosis")}</p>`);
  bindCaregiverNav(); document.querySelector("#download-report").onclick=downloadReport; drawTrendChart();
}

function familyPage() {
  showChrome(true,true);
  main.innerHTML=caregiverShell("family",`<div class="page-heading"><div><p class="eyebrow">Personal memory library</p><h1>${t("familyMemories")}</h1><p class="lead">Add clear, familiar photos for the Family Faces game.</p></div><button class="primary-button" id="add-family">+ ${t("addFamily")}</button></div><div class="family-grid">${appState.family.map((p)=>`<article class="family-card"><img src="${p.photoUrl||p.photoData}" alt="${escapeHTML(p.name)}"><div class="family-card-body"><h3>${escapeHTML(p.name)}</h3><p class="muted">${escapeHTML(p.relationship)}</p><div class="button-row"><button class="small-button" data-family-edit="${p.id}">${t("edit")}</button><button class="small-button" data-family-delete="${p.id}">${t("delete")}</button></div></div></article>`).join("")||`<div class="empty-state card"><span>♡</span><h2>No family memories yet</h2></div>`}</div>`);
  bindCaregiverNav(); document.querySelector("#add-family").onclick=()=>familyForm(); document.querySelectorAll("[data-family-edit]").forEach((b)=>b.onclick=()=>familyForm(appState.family.find((p)=>p.id===b.dataset.familyEdit))); document.querySelectorAll("[data-family-delete]").forEach((b)=>b.onclick=()=>confirmDelete("familyMembers",b.dataset.familyDelete,"Remove this family memory?"));
}

function familyForm(existing={}) {
  openDialog(`<div class="dialog-head"><div><p class="eyebrow">Family memory</p><h2>${existing.id?t("edit"):t("addFamily")}</h2></div><button id="dialog-close">×</button></div><form id="family-form"><div class="field"><label>${t("name")}</label><input name="name" value="${escapeHTML(existing.name||"")}" required maxlength="80"></div><div class="field"><label>${t("relationship")}</label><select name="relationship">${["Mother","Father","Daughter","Son","Sister","Brother","Granddaughter","Grandson","Grandchild","Friend"].map((x)=>`<option ${existing.relationship===x?"selected":""}>${x}</option>`).join("")}</select></div><div class="field"><label>${t("photo")}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${existing.id?"":"required"}><small class="form-help">The image is resized on this device before it is saved.</small></div><div class="button-row"><button class="primary-button">${t("save")}</button><button type="button" class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div></form>`);
  document.querySelector("#dialog-close").onclick=closeDialog; document.querySelector("#dialog-cancel").onclick=closeDialog;
  document.querySelector("#family-form").onsubmit=async(e)=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const file=fd.get("photo"); let photoData=existing.photoData||existing.photoUrl; if(file?.size){if(file.size>8*1024*1024){toast("Please choose an image smaller than 8 MB.");return;} photoData=await resizeImage(file);} await db.save("familyMembers",{...existing,name:fd.get("name"),relationship:fd.get("relationship"),photoData,photoUrl:photoData,demoOnly:!!session()?.demo},!session()?.demo); closeDialog(); await refresh("Family memory saved.");};
}

function analyticsPage() {
  showChrome(true,true); const a=appState.analytics;
  main.innerHTML=caregiverShell("analytics",`<div class="page-heading"><div><p class="eyebrow">Trends, not diagnoses</p><h1>${t("analytics")}</h1><p class="lead">Patterns from games, routines and mood check-ins.</p></div><button class="primary-button" id="download-report">↓ ${t("report")}</button></div><div class="metric-grid">${[["Memory",a.memory],["Recall",a.recall],["Attention",a.attention],["Mood",a.mood]].map(([k,v])=>`<div class="metric-card"><small>${k}</small><strong>${v}</strong><p class="tiny-note">out of 100</p></div>`).join("")}</div><article class="card chart-wrap"><h2>Seven-day activity</h2><canvas id="trend-chart"></canvas></article><article class="card" style="margin-top:1rem"><h2>Difficulty decisions</h2><div class="list">${Object.keys(GAME_META).map((id)=>{const rs=appState.results.filter((r)=>r.game===id);const current=rs[0]?.difficulty||"easy";const d=adaptDifficulty(rs,current);return `<div class="list-item"><div><h3>${GAME_META[id].title}</h3><p>${d.reason}</p></div><b>${d.level}</b></div>`}).join("")}</div></article><p class="tiny-note" style="margin-top:1rem">${t("notDiagnosis")}</p>`);
  bindCaregiverNav(); document.querySelector("#download-report").onclick=downloadReport; drawTrendChart();
}

function bindCaregiverNav(){
  document.querySelector("#return-patient").onclick=()=>{sessionStorage.removeItem("caregiver_unlocked");location.hash="#/patient";};
  document.querySelector("#sign-out").onclick=signOut;
}

async function signOut() {
  await logout();
  location.hash = "#/";
  render();
}
function drawTrendChart(){const canvas=document.querySelector("#trend-chart");if(!canvas||!globalThis.Chart)return;activeChart?.destroy();const series=trendSeries(appState.results);activeChart=new Chart(canvas,{type:"line",data:{labels:series.map(x=>x.label),datasets:[{label:"Engagement score",data:series.map(x=>x.value),borderColor:"#0b6b68",backgroundColor:"rgba(21,149,143,.14)",fill:true,tension:.35,pointRadius:5,pointBackgroundColor:"#fff",pointBorderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:100,grid:{color:"#e5eeec"}},x:{grid:{display:false}}}}});}

async function downloadReport(){
  const {jsPDF}=globalThis.jspdf||{};if(!jsPDF){toast("Report tools are still loading.");return;}const a=appState.analytics;const doc=new jsPDF({unit:"pt",format:"a4"});
  doc.setFillColor(11,107,104);doc.rect(0,0,595,100,"F");doc.setTextColor(255,255,255);doc.setFontSize(28);doc.text("SmritiAI Caregiver Report",40,55);doc.setFontSize(11);doc.text(`Generated ${new Date().toLocaleString(locale())}`,40,78);doc.setTextColor(22,48,47);doc.setFontSize(18);doc.text(`${appState.profile?.patientName||"Patient"}'s engagement summary`,40,140);
  const metrics=[["Overall",a.overall],["Memory",a.memory],["Recall",a.recall],["Attention",a.attention],["Mood",a.mood],["Reminder adherence",`${a.adherence}%`]];let y=185;doc.setFontSize(12);for(const [name,value] of metrics){doc.setFillColor(228,243,238);doc.roundedRect(40,y-20,240,34,7,7,"F");doc.text(name,52,y);doc.setFontSize(16);doc.text(String(value),245,y,{align:"right"});doc.setFontSize(12);y+=44;}
  doc.setFontSize(16);doc.text("Care alerts",320,185);doc.setFontSize(11);let ay=210;if(!appState.alerts.length){doc.text("No current care alerts.",320,ay);}else for(const alert of appState.alerts){const lines=doc.splitTextToSize(`• ${alert.message}`,230);doc.text(lines,320,ay);ay+=lines.length*15+8;}
  doc.setDrawColor(206,221,218);doc.line(40,480,555,480);doc.setFontSize(16);doc.text("Recent game performance",40,515);doc.setFontSize(10);y=540;doc.text("Game",40,y);doc.text("Date",220,y);doc.text("Accuracy",360,y);doc.text("Score",480,y);y+=18;for(const r of [...appState.results].sort((x,z)=>new Date(z.createdAt)-new Date(x.createdAt)).slice(0,10)){doc.text(GAME_META[r.game]?.title||r.game,40,y);doc.text(new Date(r.createdAt).toLocaleDateString(locale()),220,y);doc.text(`${r.accuracy}%`,360,y);doc.text(String(r.score),480,y);y+=20;}
  doc.setFontSize(9);doc.setTextColor(94,115,113);doc.text("SmritiAI supports cognitive engagement. This report is not a diagnosis or medical advice.",40,805);doc.save(`SmritiAI-${(appState.profile?.patientName||"report").replace(/\s+/g,"-")}.pdf`);toast("PDF report downloaded.");
}

async function confirmSOS(){openDialog(`<div class="dialog-head"><div><p class="eyebrow" style="color:var(--danger)">Please confirm</p><h2>Alert your caregiver?</h2></div><button id="dialog-close">×</button></div><p>${t("emergencyNote")}</p><div class="button-row"><button class="danger-button" id="confirm-sos">Yes, alert them</button><button class="secondary-button" id="dialog-cancel">Cancel</button></div>`);document.querySelector("#dialog-close").onclick=closeDialog;document.querySelector("#dialog-cancel").onclick=closeDialog;document.querySelector("#confirm-sos").onclick=async()=>{await db.save("alerts",{type:"sos",message:"Emergency help was requested from the patient dashboard.",status:"active",demoOnly:!!session()?.demo},!session()?.demo);closeDialog();const button=document.querySelector("#sos-button");button?.classList.add("pulse");beep();toast("Caregiver alert recorded on this device.");speak("Your caregiver alert has been recorded. You are not alone.");};}
function beep(){const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return;const ctx=new AudioContext(),o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=620;g.gain.setValueAtTime(.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.7);o.start();o.stop(ctx.currentTime+.7);}

function pinGate(){openDialog(`<div class="dialog-head"><div><p class="eyebrow">Private caregiver area</p><h2>${t("unlock")}</h2></div><button id="dialog-close">×</button></div><p class="muted">${t("enterPin")}</p><form id="pin-form"><div class="field"><input class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus></div><p id="pin-error" role="alert"></p><div class="button-row"><button class="primary-button">Unlock</button><button type="button" class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div></form>`);document.querySelector("#dialog-close").onclick=()=>{closeDialog();location.hash="#/patient"};document.querySelector("#dialog-cancel").onclick=()=>{closeDialog();location.hash="#/patient"};document.querySelector("#pin-form").onsubmit=async(e)=>{e.preventDefault();const pin=e.currentTarget.pin.value;let ok=false;if(session()?.demo){ok=await verifyPin(pin,appState.profile?.caregiverPinVerifier);}else if(navigator.onLine){try{await api("/caregiver/unlock",{method:"POST",body:JSON.stringify({pin})});const verifier=await createPinVerifier(pin);await db.put("profiles",{...appState.profile,caregiverPinVerifier:verifier});appState.profile.caregiverPinVerifier=verifier;ok=true;}catch{ok=false;}}else{ok=await verifyPin(pin,appState.profile?.caregiverPinVerifier);}if(ok){sessionStorage.setItem("caregiver_unlocked","true");closeDialog();render();}else document.querySelector("#pin-error").textContent=t("incorrectPin");};}
async function createPinVerifier(pin){const salt=crypto.getRandomValues(new Uint8Array(16));const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},material,256);return `${toBase64(salt)}:${toBase64(new Uint8Array(bits))}`;}
async function verifyPin(pin,verifier){try{if(verifier?.startsWith("demo:"))return verifier===`demo:${pin}`;if(!verifier)return false;const [s,h]=verifier.split(":");if(!s||!h)return false;const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:fromBase64(s),iterations:210000,hash:"SHA-256"},material,256);return toBase64(new Uint8Array(bits))===h;}catch{return false;}}
const toBase64=(bytes)=>btoa(String.fromCharCode(...bytes));const fromBase64=(value)=>Uint8Array.from(atob(value),(c)=>c.charCodeAt(0));

function confirmDelete(store,id,message){openDialog(`<div class="dialog-head"><h2>${message}</h2><button id="dialog-close">×</button></div><p>This item will be removed on synced family devices too.</p><div class="button-row"><button class="danger-button" id="delete-confirm">${t("delete")}</button><button class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div>`);document.querySelector("#dialog-close").onclick=closeDialog;document.querySelector("#dialog-cancel").onclick=closeDialog;document.querySelector("#delete-confirm").onclick=async()=>{await tombstone(store,id);closeDialog();await refresh("Item removed.");};}

function resizeImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/webp",.82));URL.revokeObjectURL(img.src);};img.onerror=reject;img.src=URL.createObjectURL(file);});}

function speak(text){if(!("speechSynthesis" in globalThis))return;speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=locale();utterance.rate=.9;speechSynthesis.speak(utterance);}
function startVoice(){const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;if(!Recognition){toast("Voice recognition is not available here. All actions remain available by touch.");return;}const recognition=new Recognition();recognition.lang=locale();recognition.interimResults=false;toast("Listening…");recognition.onresult=(event)=>handleVoice(event.results[0][0].transcript.toLowerCase());recognition.onerror=()=>toast("I could not hear that. Please try again or use the buttons.");recognition.start();}
function handleVoice(command){if(command.includes("game"))location.hash="#/games";else if(command.includes("dashboard")||command.includes("home"))location.hash="#/patient";else if(command.includes("reminder")){location.hash="#/reminders";if(command.includes("read"))speak(appState.reminders.map((r)=>`${r.title} at ${r.time}`).join(". ")||"There are no reminders.");}else if(command.includes("task"))speak("Today's routine includes medicine, water, gentle exercise, and a daily activity.");else if(command.includes("emergency")||command.includes("help"))confirmSOS();else toast(`I heard “${command}”. Try saying Open Games or Read Reminders.`);}

async function refresh(message,rerender=true){await loadState();if(rerender)render();if(message)toast(message);}
async function guardedSync(){document.querySelector("#sync-button")?.classList.add("pulse");try{const result=await syncNow();toast(result.skipped?(session()?.demo?"Demo data stays on this device.":"Changes are safely queued."):"Everything is up to date.");}catch{toast("Sync will retry when the connection is ready.");}finally{document.querySelector("#sync-button")?.classList.remove("pulse");}}

function routeFromLocation() { const hash = location.hash; if (hash.startsWith("#/")) return hash.slice(2); return location.pathname.replace(/^\/+|\/+$/g, ""); }
function normalizeRouteUrl() { if (!location.hash.startsWith("#/")) return; const route = location.hash.slice(2); history.replaceState(null, "", route ? `/${route}` : "/"); }
async function render(){
  normalizeRouteUrl(); await loadState(); const route=routeFromLocation(); const isCaregiver=route.startsWith("caregiver");
  const loggedIn = !!session();
  if(!loggedIn&&!['','auth'].includes(route)){location.hash="#/";return;}
  if(loggedIn&&['','auth'].includes(route)){location.hash="#/patient";return;}
  if(isCaregiver&&sessionStorage.getItem("caregiver_unlocked")!=="true"){showChrome(true);pinGate();return;}
  if(activeChart){activeChart.destroy();activeChart=null;}
  if(route==="")landingPage();else if(route==="auth")authPage();else if(route==="patient")patientPage();else if(route==="games")gamesPage();else if(route.startsWith("game/"))await gamePage(route.split("/")[1]);else if(route==="reminders")remindersPage();else if(route==="companion")companionPage();else if(route==="caregiver")caregiverPage();else if(route==="caregiver/family")familyPage();else if(route==="caregiver/analytics")analyticsPage();else location.hash=session()?"#/patient":"#/";
  window.scrollTo({ top: 0, behavior: "instant" });
  main.focus({preventScroll:true});
}

function updateConnection(){offlineBanner.hidden=navigator.onLine;offlineBanner.textContent=t("offline");if(navigator.onLine&&session())syncNow().catch(()=>{});}

function registerWebMCP() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const signal = new AbortController().signal;
  const register = (tool) => Promise.resolve(context.registerTool(tool, { signal })).catch(() => {});
  register({
    name: "read_today_status", title: "Read today's SmritiAI status",
    description: "Read the patient-facing wellness score, incomplete reminders, and daily streak without opening caregiver analytics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute() { await loadState(); return { wellnessScore: appState.analytics.overall, streakDays: appState.streak, incompleteReminders: appState.reminders.filter((r) => !r.completedAt).map((r) => ({ id: r.id, title: r.title, time: r.time })) }; }
  });
  register({
    name: "complete_reminder", title: "Complete a reminder",
    description: "Mark one existing reminder complete using its exact reminder ID and update the same local state as the visible reminder screen.",
    inputSchema: { type: "object", properties: { reminderId: { type: "string", minLength: 3 } }, required: ["reminderId"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) { if (!input || typeof input.reminderId !== "string") throw new Error("reminderId is required"); const reminder = await db.get("reminders", input.reminderId); if (!reminder || reminder.deletedAt) throw new Error("Reminder not found"); const updated = await db.save("reminders", { ...reminder, completedAt: timestamp() }, !session()?.demo); await loadState(); if (location.hash === "#/reminders") remindersPage(); return { id: updated.id, completed: true, completedAt: updated.completedAt }; }
  });
  register({
    name: "start_cognitive_game", title: "Open a cognitive game",
    description: "Navigate to one of SmritiAI's six playable cognitive games by its stable game ID.",
    inputSchema: { type: "object", properties: { gameId: { type: "string", enum: Object.keys(GAME_META) } }, required: ["gameId"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) { if (!input || !GAME_META[input.gameId]) throw new Error("Unknown gameId"); location.hash = `#/game/${input.gameId}`; return { gameId: input.gameId, opened: true }; }
  });
}
window.addEventListener("hashchange",render);window.addEventListener("popstate",render);window.addEventListener("online",updateConnection);window.addEventListener("offline",updateConnection);
window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault();installEvent=e;toast("SmritiAI is ready to install on this device.");});
document.querySelector("#header-language-select").innerHTML = languageOptions();
bindLanguageSelect();
document.querySelector("#sync-button").onclick=guardedSync;document.querySelector("#voice-button").onclick=startVoice;document.querySelector("#role-button").onclick=()=>{if(location.hash.includes("caregiver") || routeFromLocation().includes("caregiver")){sessionStorage.removeItem("caregiver_unlocked");location.hash="#/patient";}else location.hash="#/caregiver";};
document.querySelector("#sign-out-button").onclick=signOut;
dialog.addEventListener("click",(e)=>{if(e.target===dialog)closeDialog();});
// The development build must reflect the running server. Remove any service
// worker left by an earlier offline-first build, along with its cached shell.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => caches.keys())
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("smritiai-")).map((key) => caches.delete(key))))
    .catch(() => {});
}
setLanguage(getLanguage());updateConnection();render();
registerWebMCP();
