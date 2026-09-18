import { db, active, timestamp, uid, tombstone } from "./js/db.js";
import { languages, t, translateValue, setLanguage, getLanguage, locale, applyStaticTranslations } from "./js/i18n.js";
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
const formatDateTime = (date) => new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
const iconFor = (category) => ({ medication: "💊", hydration: "💧", exercise: "🌿", appointment: "📅", daily: "☀️" })[category] || "◷";

async function loadState() {
  const [profiles, reminders, moods, results, family, alerts] = await Promise.all(["profiles", "reminders", "moods", "gameResults", "familyMembers", "alerts"].map((s) => db.all(s)));
  appState = { profile: active(profiles)[0], reminders: active(reminders), moods: active(moods), results: active(results), family: active(family) };
  appState.analytics = calculateAnalytics(appState.results, appState.moods, appState.reminders);
  appState.streak = calculateStreak(appState.results);
  appState.achievements = achievementState({ results: appState.results, reminders: appState.reminders, streak: appState.streak });
  const detected = detectAlerts(appState.results, appState.reminders, appState.profile?.lastActiveAt || timestamp()).map((alert) => ({ ...alert, source: "insight" }));
  appState.alerts = [...active(alerts).filter((alert) => alert.status !== "resolved"), ...detected]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
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
  document.querySelector("#role-button").textContent = caregiver ? t("patient") : t("caregiver");
  document.querySelector("#role-button").setAttribute("aria-label", caregiver ? t("returnPatient") : t("openCaregiver"));
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
    <nav class="landing-nav"><a class="brand" href="#/"><span class="brand-mark">S</span><span><strong>SmritiAI</strong><small>${t("brandSubtitle")}</small></span></a>${languageSelect()}</nav>
    <div class="hero"><div class="hero-copy"><span class="tag">● ${t("gentleSupport")}</span><h1>${t("heroTitle")} <em>${t("heroEmphasis")}</em></h1><p class="lead">${t("heroDescription")}</p><div class="button-row"><button class="primary-button" id="demo-start">${t("demo")}</button><a class="secondary-button" href="#/auth">${t("login")}</a><button class="secondary-button" id="install-app" ${installEvent ? "" : "hidden"}>${t("install")}</button></div><div class="trust-row"><span>${t("worksOffline")}</span><span>${t("clearControls")}</span><span>${t("privateSpace")}</span></div></div>
    <div class="memory-window" aria-label="${t("sampleMemory")}"><div class="sun-disc"></div><article class="memory-card-hero"><div class="family-collage"><img src="./assets/images/demo-ananya.png" alt="${t("fictionalDaughter")}"><img src="./assets/images/demo-ranjit.png" alt="${t("fictionalSon")}"><img src="./assets/images/demo-mili.png" alt="${t("fictionalGranddaughter")}"></div><blockquote>“${t("familyQuote")}”</blockquote><small>${t("fictionalFamily")}</small></article></div></div></section>`;
  document.querySelector("#demo-start").onclick = async () => { await seedDemo(); await loadState(); location.hash = "#/patient"; };
  document.querySelector("#install-app").onclick = async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice; installEvent = null; document.querySelector("#install-app").hidden = true; } };
  bindLanguageSelect();
}

function languageOptions() { return Object.entries(languages).map(([code, name]) => `<option value="${code}" ${getLanguage() === code ? "selected" : ""}>${name}</option>`).join(""); }
function languageSelect() { return `<select class="language-select" id="language-select" aria-label="${t("language")}">${languageOptions()}</select>`; }
function bindLanguageSelect() { document.querySelectorAll(".language-select").forEach((select) => select.addEventListener("change", (event) => { setLanguage(event.target.value); render(); })); }

function authPage() {
  showChrome(false); let mode = "login";
  const draw = () => {
    main.innerHTML = `<section class="landing"><nav class="landing-nav"><a class="brand" href="#/"><span class="brand-mark">S</span><span><strong>SmritiAI</strong><small>${t("brandSubtitle")}</small></span></a>${languageSelect()}</nav><div class="auth-panel"><p class="eyebrow">${t("oneFamilySpace")}</p><h1>${mode === "login" ? t("login") : t("register")}</h1><p class="muted">${mode === "login" ? t("welcomeBack") : t("setupAccount")}</p><div class="auth-tabs"><button data-mode="login" class="${mode === "login" ? "active" : ""}">${t("login")}</button><button data-mode="register" class="${mode === "register" ? "active" : ""}">${t("register")}</button></div><form id="auth-form">
      ${mode === "register" ? `<div class="field"><label for="patient-name">${t("patientName")}</label><input id="patient-name" name="patientName" required maxlength="80" autocomplete="name"></div><div class="field"><label for="caregiver-name">${t("caregiverName")}</label><input id="caregiver-name" name="caregiverName" required maxlength="80"></div>` : ""}
      <div class="field"><label for="email">${t("email")}</label><input id="email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="password">${t("password")}</label><input id="password" name="password" type="password" required minlength="8" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></div>
      ${mode === "register" ? `<div class="field"><label for="pin">${t("pin")}</label><input class="pin-input" id="pin" name="caregiverPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="new-password"><small class="form-help">${t("pinHelp")}</small></div>` : ""}
      <button class="primary-button" type="submit">${mode === "login" ? t("login") : t("register")}</button></form><p id="auth-error" class="tiny-note" role="alert"></p><hr><button class="text-button" id="demo-start">${t("noAccount")} ${t("demo")}</button></div></section>`;
    bindLanguageSelect(); document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => { mode = b.dataset.mode; draw(); });
    document.querySelector("#demo-start").onclick = async () => { await seedDemo(); await loadState(); location.hash = "#/patient"; };
    document.querySelector("#auth-form").onsubmit = async (event) => {
      event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const error = document.querySelector("#auth-error"); error.textContent = t("connecting");
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
      catch (err) { error.textContent = navigator.onLine ? err.message : t("internetNeeded"); }
    };
  }; draw();
}

function patientPage() {
  showChrome(true); setActiveNav("patient"); const a = appState.analytics; const name = appState.profile?.patientName || t("friend");
  const routines = [
    ["medicine", t("medicine"), "💊"], ["water", t("water"), "💧"], ["exercise", t("exercise"), "🌿"], ["activity", t("activity"), "☀️"]
  ];
  const today = new Date().toISOString().slice(0, 10);
  const nextReminder = [...appState.reminders].filter((r)=>!r.completedAt).sort((x,y)=>(x.time||"").localeCompare(y.time||""))[0];
  main.innerHTML = `<section class="page patient-page"><div class="simple-greeting"><div><p class="eyebrow">${formatDate(new Date())}</p><h1>${t("greeting", { name: escapeHTML(name) })}</h1><p>${t("whatDo")}</p></div><div class="calm-score" aria-label="${t("wellnessAria", { score: a.overall||74 })}"><strong>${a.overall || 74}</strong><span>${t("wellness")}</span></div></div>
    <div class="patient-primary-actions"><a class="big-action play-action" href="#/games"><span aria-hidden="true">🎮</span><div><b>${t("playGame")}</b><small>${t("simpleEnjoyable")}</small></div><strong aria-hidden="true">→</strong></a><a class="big-action" href="#/reminders"><span aria-hidden="true">🕘</span><div><b>${nextReminder?escapeHTML(translateValue(nextReminder.title)):t("seeReminders")}</b><small>${nextReminder?.time?t("todayAt", { time: escapeHTML(nextReminder.time) }):t("nothingDue")}</small></div><strong aria-hidden="true">→</strong></a></div>
    <article class="card simple-section"><h2>${t("dailyTasks")}</h2><p>${t("tapWhenDone")}</p><ul class="routine-list">${routines.map(([id,label,icon]) => { const saved = appState.reminders.find((r) => r.id === `routine-${today}-${id}`); return `<li><label><input type="checkbox" data-routine="${id}" ${saved?.completedAt ? "checked" : ""}><span>${icon} ${label}</span></label></li>`; }).join("")}</ul></article>
    <article class="card simple-section"><div class="simple-section-title"><div><h2>${t("mood")}</h2><p>${t("tapFace")}</p></div><strong>${appState.streak} ${t("streak")}</strong></div><div class="mood-options" role="group" aria-label="${t("mood")}">${["veryLow","low","okay","good","veryGood"].map((key,index)=>`<button class="mood-button" data-mood="${index+1}" aria-label="${t(key)}">${["😢","😟","😐","🙂","😊"][index]}</button>`).join("")}</div></article>
    <article class="card sos-card simple-section"><div><h2>${t("emergency")}</h2><p>${t("pressCaregiver")}</p><p class="tiny-note">${t("emergencyNote")}</p></div><button class="sos-button" id="sos-button">SOS</button></article><p class="tiny-note patient-disclaimer">${t("notDiagnosis")}</p></section>`;
  document.querySelectorAll("[data-routine]").forEach((box) => box.onchange = async () => { const id = `routine-${today}-${box.dataset.routine}`; await db.save("reminders", { id, title: box.parentElement.innerText.trim(), category: box.dataset.routine, date: today, time: "", completedAt: box.checked ? timestamp() : null, demoOnly: !!session()?.demo }, !session()?.demo); await refresh(t("routineUpdated")); });
  document.querySelectorAll("[data-mood]").forEach((button) => button.onclick = async () => { document.querySelectorAll("[data-mood]").forEach((b) => b.classList.remove("selected")); button.classList.add("selected"); await db.save("moods", { value: Number(button.dataset.mood), demoOnly: !!session()?.demo }, !session()?.demo); await refresh(t("thanksMood"), false); });
  document.querySelector("#sos-button").onclick = confirmSOS;
}

function gamesPage() {
  showChrome(true); setActiveNav("games");
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">${t("playEveryDay")}</p><h1>${t("games")}</h1><p class="lead">${t("chooseGame")}</p></div><span class="date-chip">${t("gamesPlayed", { count: appState.results.length })}</span></div><div class="game-grid">${Object.entries(GAME_META).map(([id,g]) => `<a class="game-card" href="#/game/${id}"><span class="game-icon">${g.icon}</span><h2>${g.title}</h2><p>${g.description}</p><strong>${t("play")} →</strong></a>`).join("")}</div></section>`;
}

async function gamePage(id) {
  const meta = GAME_META[id]; if (!meta) { location.hash = "#/games"; return; }
  showChrome(true); setActiveNav("games"); let level = await db.setting(`difficulty-${id}`, "easy");
  const drawIntro = () => {
    main.innerHTML = `<section class="page game-shell"><a class="text-button" href="#/games">← ${t("back")}</a><div class="game-toolbar"><div><p class="eyebrow">${meta.icon} ${t("cognitiveActivity")}</p><h1>${meta.title}</h1></div><div class="difficulty" aria-label="${t("difficulty")}">${["easy","medium","hard"].map((x) => `<button data-level="${x}" class="${x === level ? "active" : ""}">${t(x)}</button>`).join("")}</div></div><div class="game-stage" id="game-stage"><div><span class="game-icon" style="margin-inline:auto">${meta.icon}</span><h2>${meta.description}</h2><p class="muted">${t("takeYourTime")}</p><button class="primary-button" id="start-game">${t("start")}</button></div></div></section>`;
    document.querySelectorAll("[data-level]").forEach((b) => b.onclick = async () => { level = b.dataset.level; await db.setSetting(`difficulty-${id}`, level); drawIntro(); });
    document.querySelector("#start-game").onclick = () => startGame(id, document.querySelector("#game-stage"), { level, family: appState.family, onComplete: (result) => finishGame(id, meta, level, result) });
  }; drawIntro();
}

async function finishGame(id, meta, level, result) {
  const record = await db.save("gameResults", { game: id, difficulty: level, ...result, completed: true, demoOnly: !!session()?.demo }, !session()?.demo);
  const next = adaptDifficulty([...appState.results.filter((r) => r.game === id), record], level); await db.setSetting(`difficulty-${id}`, next.level); await loadState();
  document.querySelector("#game-stage").innerHTML = `<article class="result-card"><p class="eyebrow">${t("wellDone")}</p><h2>${t("completedGame", { game: meta.title })}</h2><div class="result-score" style="--score:${result.score}%"><strong>${result.score}</strong></div><p><b>${result.accuracy}% ${t("accuracy")}</b> · ${t("mistakeCount", { count: result.mistakes })}</p><p class="muted">${translateValue(next.reason)} ${t("nextLevel", { level: t(next.level) })}</p><div class="button-row" style="justify-content:center"><button class="primary-button" id="play-again">${t("playAgain")}</button><a class="secondary-button" href="#/games">${t("allGames")}</a></div></article>`;
  document.querySelector("#play-again").onclick = () => { location.hash = "#/games"; setTimeout(() => location.hash = `#/game/${id}`, 0); };
  speak(`Well done. Your score is ${result.score}.`);
}

function remindersPage() {
  showChrome(true); setActiveNav("reminders"); const sorted = [...appState.reminders].sort((a,b) => (a.time || "").localeCompare(b.time || ""));
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">${t("comfortableRhythm")}</p><h1>${t("reminders")}</h1><p class="lead">${t("remindersLead")}</p></div><button class="primary-button" id="add-reminder">+ ${t("addReminder")}</button></div><div class="list">${sorted.length ? sorted.map(reminderItem).join("") : `<div class="empty-state card"><span>◷</span><h2>${t("noReminders")}</h2></div>`}</div></section>`;
  document.querySelector("#add-reminder").onclick = () => reminderForm();
  document.querySelectorAll("[data-complete]").forEach((b) => b.onclick = async () => { const r = appState.reminders.find((x) => x.id === b.dataset.complete); await db.save("reminders", { ...r, completedAt: r.completedAt ? null : timestamp() }, !session()?.demo); await refresh(t("reminderUpdated")); });
  document.querySelectorAll("[data-snooze]").forEach((b) => b.onclick = async () => { const r = appState.reminders.find((x) => x.id === b.dataset.snooze); const d = new Date(); d.setMinutes(d.getMinutes()+10); await db.save("reminders", { ...r, date: d.toISOString().slice(0,10), time: d.toTimeString().slice(0,5), snoozedAt: timestamp() }, !session()?.demo); await refresh(t("snoozed")); });
  document.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => reminderForm(appState.reminders.find((x) => x.id === b.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => confirmDelete("reminders", b.dataset.delete, t("deleteReminderQ")));
}

function reminderItem(r) { return `<article class="list-item"><div class="list-item-main"><span class="item-icon">${iconFor(r.category)}</span><div><h3>${escapeHTML(translateValue(r.title))}</h3><p>${escapeHTML(r.time || t("anyTime"))} · ${escapeHTML(t(r.category || "daily"))}${r.completedAt ? ` · ${t("completed")}` : ""}</p></div></div><div class="item-actions"><button class="small-button" data-complete="${r.id}">${r.completedAt ? t("undo") : t("complete")}</button><button class="small-button" data-snooze="${r.id}">${t("snooze")}</button><button class="small-button" data-edit="${r.id}">${t("edit")}</button><button class="small-button" data-delete="${r.id}" aria-label="${t("deleteNamed", { name: escapeHTML(translateValue(r.title)) })}">×</button></div></article>`; }

function reminderForm(existing = {}) {
  openDialog(`<div class="dialog-head"><div><p class="eyebrow">${t("gentlePrompt")}</p><h2>${existing.id ? t("edit") : t("addReminder")}</h2></div><button id="dialog-close" aria-label="${t("close")}">×</button></div><form id="reminder-form"><div class="field"><label>${t("title")}</label><input name="title" value="${escapeHTML(existing.title || "")}" maxlength="100" required></div><div class="field"><label>${t("category")}</label><select name="category">${["medication","hydration","exercise","appointment","daily"].map((x)=>`<option value="${x}" ${existing.category===x?"selected":""}>${t(x)}</option>`).join("")}</select></div><div class="field"><label>${t("time")}</label><input name="time" type="time" value="${escapeHTML(existing.time || "09:00")}" required></div><div class="button-row"><button class="primary-button">${t("save")}</button><button class="secondary-button" type="button" id="dialog-cancel">${t("cancel")}</button></div></form>`);
  document.querySelector("#dialog-close").onclick = closeDialog; document.querySelector("#dialog-cancel").onclick = closeDialog;
  document.querySelector("#reminder-form").onsubmit = async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await db.save("reminders", { ...existing, ...data, date: existing.date || new Date().toISOString().slice(0,10), completedAt: existing.completedAt || null, demoOnly: !!session()?.demo }, !session()?.demo); closeDialog(); await refresh(t("reminderSaved")); };
}

function companionPage() {
  showChrome(true); setActiveNav("companion");
  const prompts = [[t("festivalPrompt"),"festival"], [t("childhoodPrompt"),"childhood"], [t("laughPrompt"),"general"], [t("mealPrompt"),"general"]];
  main.innerHTML = `<section class="page"><div class="page-heading"><div><p class="eyebrow">${t("listeningSpace")}</p><h1>${t("companion")}</h1><p class="lead">${t("companionLead")}</p></div></div><div class="companion-shell"><aside class="card"><h2>${t("memoryPrompts")}</h2><div class="prompt-cards">${prompts.map(([label,intent])=>`<button class="prompt-card" data-prompt="${label}" data-intent="${intent}">${label}</button>`).join("")}</div><button class="secondary-button" id="story-button" style="margin-top:1rem;width:100%">📖 ${t("story")}</button></aside><article class="card chat-card"><div class="chat-log" id="chat-log"><div class="bubble">${t("supportive")} ${t("shareMemoryQ")}</div></div><form class="chat-form" id="chat-form"><input name="message" aria-label="${t("companionPrompt")}" placeholder="${t("companionPrompt")}" autocomplete="off"><button class="primary-button">${t("send")}</button></form></article></div></section>`;
  const respond = async (message, intent) => {
    const log = document.querySelector("#chat-log");
    const pendingId = uid("companion");
    log.insertAdjacentHTML("beforeend", `<div class="bubble user">${escapeHTML(message)}</div><div class="bubble" id="${pendingId}">${t("connecting")}</div>`);
    log.scrollTop = log.scrollHeight;
    const guarded = companionGuardrail(message);
    let response = guarded;
    if (!response && !session()?.demo && navigator.onLine) {
      try {
        const result = await api("/companion/message", { method: "POST", body: JSON.stringify({ message, language: getLanguage() }) });
        response = result.reply;
      } catch { response = companionResponse(message, intent); }
    }
    response ||= companionResponse(message, intent);
    const pending = document.getElementById(pendingId);
    if (pending) pending.textContent = response;
    log.scrollTop = log.scrollHeight;
  };
  document.querySelector("#chat-form").onsubmit = async (e) => { e.preventDefault(); const input=e.currentTarget.message; const message=input.value.trim(); input.value=""; if(message) await respond(message); };
  document.querySelectorAll("[data-prompt]").forEach((b)=>b.onclick=()=>respond(b.dataset.prompt,b.dataset.intent));
  document.querySelector("#story-button").onclick=()=>respond(t("storyRequest"),"story");
}

function companionGuardrail(message) {
  if (/\b(kill myself|suicide|end my life|want to die|self[- ]?harm|hurt myself|hurt someone|मार डाल|आत्महत्या|মৰি যাওঁ|আত্মহত্যা|মরে যেতে|ꯑꯁꯤꯕ)\b/i.test(message)) return t("companionCrisis");
  if (/(?:\b(?:write|generate|create|show|explain|debug|fix|build|help\s+with)\b.{0,60}\b(?:code|program|algorithm|function|class|script|regex)\b)|\b(?:coding|programming|python|javascript|typescript|c\+\+|html|css|sql|api|github|docker|kubernetes)\b|(?:कोड|কোড)/i.test(message)) return t("companionScope");
  return "";
}

function companionResponse(message, intent) {
  const lower=message.toLowerCase();
  if(intent==="story"||lower.includes("story")) return t("storyResponse");
  if(lower.includes("sad")||lower.includes("worried")||lower.includes("afraid")) return t("comfortResponse");
  if(intent==="festival"||lower.includes("festival")||lower.includes("bihu")) return t("festivalResponse");
  if(intent==="childhood"||lower.includes("childhood")||lower.includes("home")) return t("childhoodResponse");
  return t("listeningResponse");
}

function caregiverShell(activeRoute, content) {
  return `<section class="page"><div class="caregiver-layout"><nav class="side-nav" aria-label="${t("caregiverNav")}"><a class="${activeRoute==="caregiver"?"active":""}" href="#/caregiver">▦ ${t("overview")}</a><a class="${activeRoute==="family"?"active":""}" href="#/caregiver/family">♡ ${t("family")}</a><a class="${activeRoute==="analytics"?"active":""}" href="#/caregiver/analytics">↗ ${t("analytics")}</a><button id="return-patient">← ${t("patientView")}</button><button id="sign-out">${t("signOut")}</button></nav><div>${content}</div></div></section>`;
}

function caregiverPage() {
  showChrome(true,true); const a=appState.analytics;
  main.innerHTML=caregiverShell("caregiver",`<div class="page-heading"><div><p class="eyebrow">${t("caregiverOverview")}</p><h1>${t("patientWeek", { name: escapeHTML(appState.profile?.patientName || t("patient")) })}</h1><p class="lead">${t("caregiverLead")}</p></div><button class="primary-button" id="download-report">↓ ${t("report")}</button></div><div class="metric-grid"><div class="metric-card"><small>${t("wellnessScore")}</small><strong>${a.overall}</strong><p class="tiny-note">${t("engagementIndicator")}</p></div><div class="metric-card"><small>${t("gamesPlayedLabel")}</small><strong>${a.attempts}</strong><p class="tiny-note">${t("recordedSessions")}</p></div><div class="metric-card"><small>${t("adherence")}</small><strong>${a.adherence}%</strong><p class="tiny-note">${t("currentRecords")}</p></div><div class="metric-card"><small>${t("dailyStreak")}</small><strong>${appState.streak}</strong><p class="tiny-note">${t("consecutiveDays")}</p></div></div><div class="analytics-grid"><article class="card chart-wrap"><div class="page-heading"><div><p class="eyebrow">${t("sevenDayPattern")}</p><h2>${t("cognitiveEngagement")}</h2></div><a class="text-button" href="#/caregiver/analytics">${t("details")} →</a></div><canvas id="trend-chart" aria-label="${t("sevenDayTrend")}"></canvas></article><article class="card"><p class="eyebrow">${t("needsAttention")}</p><h2>${t("alerts")}</h2><div class="alert-list">${appState.alerts.length?appState.alerts.map((x)=>`<div class="alert ${x.type==="sos"?"alert-sos":""}"><div class="alert-head"><strong>${x.type==="sos"?`SOS · ${t("emergency")}`:t("alerts")}</strong>${x.createdAt?`<time datetime="${escapeHTML(x.createdAt)}">${escapeHTML(formatDateTime(x.createdAt))}</time>`:""}</div><p>${escapeHTML(translateValue(x.message))}</p></div>`).join(""):`<div class="empty-state"><span>✓</span><p>${t("noAlerts")}</p></div>`}</div></article></div><article class="card" style="margin-top:1rem"><div class="page-heading"><div><p class="eyebrow">${t("encouragement")}</p><h2>${t("achievements")}</h2></div></div><div class="achievement-grid">${appState.achievements.map((x)=>`<div class="achievement ${x.unlocked?"unlocked":""}"><span>${x.unlocked?"🏅":"○"}</span><b>${translateValue(x.name)}</b></div>`).join("")}</div></article><p class="tiny-note" style="margin-top:1rem">${t("notDiagnosis")}</p>`);
  bindCaregiverNav(); document.querySelector("#download-report").onclick=downloadReport; drawTrendChart();
}

function familyPage() {
  showChrome(true,true);
  main.innerHTML=caregiverShell("family",`<div class="page-heading"><div><p class="eyebrow">${t("memoryLibrary")}</p><h1>${t("familyMemories")}</h1><p class="lead">${t("familyLead")}</p></div><button class="primary-button" id="add-family">+ ${t("addFamily")}</button></div><div class="family-grid">${appState.family.map((p)=>`<article class="family-card"><img src="${p.photoUrl||p.photoData}" alt="${escapeHTML(p.name)}"><div class="family-card-body"><h3>${escapeHTML(p.name)}</h3><p class="muted">${escapeHTML(translateValue(p.relationship))}</p><div class="button-row"><button class="small-button" data-family-edit="${p.id}">${t("edit")}</button><button class="small-button" data-family-delete="${p.id}">${t("delete")}</button></div></div></article>`).join("")||`<div class="empty-state card"><span>♡</span><h2>${t("noFamily")}</h2></div>`}</div>`);
  bindCaregiverNav(); document.querySelector("#add-family").onclick=()=>familyForm(); document.querySelectorAll("[data-family-edit]").forEach((b)=>b.onclick=()=>familyForm(appState.family.find((p)=>p.id===b.dataset.familyEdit))); document.querySelectorAll("[data-family-delete]").forEach((b)=>b.onclick=()=>confirmDelete("familyMembers",b.dataset.familyDelete,t("removeFamilyQ")));
}

function familyForm(existing={}) {
  openDialog(`<div class="dialog-head"><div><p class="eyebrow">${t("familyMemory")}</p><h2>${existing.id?t("edit"):t("addFamily")}</h2></div><button id="dialog-close" aria-label="${t("close")}">×</button></div><form id="family-form"><div class="field"><label>${t("name")}</label><input name="name" value="${escapeHTML(existing.name||"")}" required maxlength="80"></div><div class="field"><label>${t("relationship")}</label><select name="relationship">${["Mother","Father","Daughter","Son","Sister","Brother","Granddaughter","Grandson","Grandchild","Friend"].map((x)=>`<option value="${x}" ${existing.relationship===x?"selected":""}>${t(`relationship${x}`)}</option>`).join("")}</select></div><div class="field"><label>${t("photo")}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${existing.id?"":"required"}><small class="form-help">${t("imageResizeHelp")}</small></div><div class="button-row"><button class="primary-button">${t("save")}</button><button type="button" class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div></form>`);
  document.querySelector("#dialog-close").onclick=closeDialog; document.querySelector("#dialog-cancel").onclick=closeDialog;
  document.querySelector("#family-form").onsubmit=async(e)=>{e.preventDefault(); const fd=new FormData(e.currentTarget); const file=fd.get("photo"); let photoData=existing.photoData||existing.photoUrl; if(file?.size){if(file.size>8*1024*1024){toast(t("imageTooLarge"));return;} photoData=await resizeImage(file);} await db.save("familyMembers",{...existing,name:fd.get("name"),relationship:fd.get("relationship"),photoData,photoUrl:photoData,demoOnly:!!session()?.demo},!session()?.demo); closeDialog(); await refresh(t("familySaved"));};
}

function analyticsPage() {
  showChrome(true,true); const a=appState.analytics;
  main.innerHTML=caregiverShell("analytics",`<div class="page-heading"><div><p class="eyebrow">${t("trendsNotDiagnosis")}</p><h1>${t("analytics")}</h1><p class="lead">${t("analyticsLead")}</p></div><button class="primary-button" id="download-report">↓ ${t("report")}</button></div><div class="metric-grid">${[[t("memory"),a.memory],[t("recall"),a.recall],[t("attention"),a.attention],[t("mood"),a.mood]].map(([k,v])=>`<div class="metric-card"><small>${k}</small><strong>${v}</strong><p class="tiny-note">${t("outOf100")}</p></div>`).join("")}</div><article class="card chart-wrap"><h2>${t("sevenDayActivity")}</h2><canvas id="trend-chart"></canvas></article><article class="card" style="margin-top:1rem"><h2>${t("difficultyDecisions")}</h2><div class="list">${Object.keys(GAME_META).map((id)=>{const rs=appState.results.filter((r)=>r.game===id);const current=rs[0]?.difficulty||"easy";const d=adaptDifficulty(rs,current);return `<div class="list-item"><div><h3>${GAME_META[id].title}</h3><p>${translateValue(d.reason)}</p></div><b>${t(d.level)}</b></div>`}).join("")}</div></article><p class="tiny-note" style="margin-top:1rem">${t("notDiagnosis")}</p>`);
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
function drawTrendChart(){const canvas=document.querySelector("#trend-chart");if(!canvas||!globalThis.Chart)return;activeChart?.destroy();const series=trendSeries(appState.results);activeChart=new Chart(canvas,{type:"line",data:{labels:series.map(x=>x.label),datasets:[{label:t("engagementScore"),data:series.map(x=>x.value),borderColor:"#0b6b68",backgroundColor:"rgba(21,149,143,.14)",fill:true,tension:.35,pointRadius:5,pointBackgroundColor:"#fff",pointBorderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:100,grid:{color:"#e5eeec"}},x:{grid:{display:false}}}}});}

async function downloadReport(){
  const {jsPDF}=globalThis.jspdf||{};if(!jsPDF){toast(t("reportLoading"));return;}const a=appState.analytics;const doc=new jsPDF({unit:"pt",format:"a4"});
  doc.setFillColor(11,107,104);doc.rect(0,0,595,100,"F");doc.setTextColor(255,255,255);doc.setFontSize(28);doc.text("SmritiAI Caregiver Report",40,55);doc.setFontSize(11);doc.text(`Generated ${new Date().toLocaleString(locale())}`,40,78);doc.setTextColor(22,48,47);doc.setFontSize(18);doc.text(`${appState.profile?.patientName||"Patient"}'s engagement summary`,40,140);
  const metrics=[["Overall",a.overall],["Memory",a.memory],["Recall",a.recall],["Attention",a.attention],["Mood",a.mood],["Reminder adherence",`${a.adherence}%`]];let y=185;doc.setFontSize(12);for(const [name,value] of metrics){doc.setFillColor(228,243,238);doc.roundedRect(40,y-20,240,34,7,7,"F");doc.text(name,52,y);doc.setFontSize(16);doc.text(String(value),245,y,{align:"right"});doc.setFontSize(12);y+=44;}
  doc.setFontSize(16);doc.text("Care alerts",320,185);doc.setFontSize(11);let ay=210;if(!appState.alerts.length){doc.text("No current care alerts.",320,ay);}else for(const alert of appState.alerts){const lines=doc.splitTextToSize(`• ${alert.message}`,230);doc.text(lines,320,ay);ay+=lines.length*15+8;}
  doc.setDrawColor(206,221,218);doc.line(40,480,555,480);doc.setFontSize(16);doc.text("Recent game performance",40,515);doc.setFontSize(10);y=540;doc.text("Game",40,y);doc.text("Date",220,y);doc.text("Accuracy",360,y);doc.text("Score",480,y);y+=18;for(const r of [...appState.results].sort((x,z)=>new Date(z.createdAt)-new Date(x.createdAt)).slice(0,10)){doc.text(GAME_META[r.game]?.title||r.game,40,y);doc.text(new Date(r.createdAt).toLocaleDateString(locale()),220,y);doc.text(`${r.accuracy}%`,360,y);doc.text(String(r.score),480,y);y+=20;}
  doc.setFontSize(9);doc.setTextColor(94,115,113);doc.text("SmritiAI supports cognitive engagement. This report is not a diagnosis or medical advice.",40,805);doc.save(`SmritiAI-${(appState.profile?.patientName||"report").replace(/\s+/g,"-")}.pdf`);toast("PDF report downloaded.");
}

async function confirmSOS(){openDialog(`<div class="dialog-head"><div><p class="eyebrow" style="color:var(--danger)">${t("pleaseConfirm")}</p><h2>${t("alertCaregiverQ")}</h2></div><button id="dialog-close" aria-label="${t("close")}">×</button></div><p>${t("emergencyNote")}</p><div class="button-row"><button class="danger-button" id="confirm-sos">${t("yesAlert")}</button><button class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div>`);document.querySelector("#dialog-close").onclick=closeDialog;document.querySelector("#dialog-cancel").onclick=closeDialog;document.querySelector("#confirm-sos").onclick=async()=>{await db.save("alerts",{type:"sos",severity:"urgent",message:"Emergency help was requested from the patient dashboard.",status:"active",source:"patient-dashboard",demoOnly:!!session()?.demo},!session()?.demo);if(!session()?.demo&&navigator.onLine){try{await syncNow();}catch{/* The queued SOS log will retry through normal sync. */}}closeDialog();const button=document.querySelector("#sos-button");button?.classList.add("pulse");beep();toast(t("alertRecorded"));speak(t("alertReassurance"));};}
function beep(){const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AudioContext)return;const ctx=new AudioContext(),o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=620;g.gain.setValueAtTime(.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.7);o.start();o.stop(ctx.currentTime+.7);}

function pinGate(){openDialog(`<div class="dialog-head"><div><p class="eyebrow">${t("privateCaregiver")}</p><h2>${t("unlock")}</h2></div><button id="dialog-close" aria-label="${t("close")}">×</button></div><p class="muted">${t("enterPin")}</p><form id="pin-form"><div class="field"><input class="pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autofocus></div><p id="pin-error" role="alert"></p><div class="button-row"><button class="primary-button">${t("unlock")}</button><button type="button" class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div></form>`);document.querySelector("#dialog-close").onclick=()=>{closeDialog();location.hash="#/patient"};document.querySelector("#dialog-cancel").onclick=()=>{closeDialog();location.hash="#/patient"};document.querySelector("#pin-form").onsubmit=async(e)=>{e.preventDefault();const pin=e.currentTarget.pin.value;let ok=false;if(session()?.demo){ok=await verifyPin(pin,appState.profile?.caregiverPinVerifier);}else if(navigator.onLine){try{await api("/caregiver/unlock",{method:"POST",body:JSON.stringify({pin})});const verifier=await createPinVerifier(pin);await db.put("profiles",{...appState.profile,caregiverPinVerifier:verifier});appState.profile.caregiverPinVerifier=verifier;ok=true;}catch{ok=false;}}else{ok=await verifyPin(pin,appState.profile?.caregiverPinVerifier);}if(ok){sessionStorage.setItem("caregiver_unlocked","true");closeDialog();render();}else document.querySelector("#pin-error").textContent=t("incorrectPin");};}
async function createPinVerifier(pin){const salt=crypto.getRandomValues(new Uint8Array(16));const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:210000,hash:"SHA-256"},material,256);return `${toBase64(salt)}:${toBase64(new Uint8Array(bits))}`;}
async function verifyPin(pin,verifier){try{if(verifier?.startsWith("demo:"))return verifier===`demo:${pin}`;if(!verifier)return false;const [s,h]=verifier.split(":");if(!s||!h)return false;const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:fromBase64(s),iterations:210000,hash:"SHA-256"},material,256);return toBase64(new Uint8Array(bits))===h;}catch{return false;}}
const toBase64=(bytes)=>btoa(String.fromCharCode(...bytes));const fromBase64=(value)=>Uint8Array.from(atob(value),(c)=>c.charCodeAt(0));

function confirmDelete(store,id,message){openDialog(`<div class="dialog-head"><h2>${message}</h2><button id="dialog-close" aria-label="${t("close")}">×</button></div><p>${t("removeSynced")}</p><div class="button-row"><button class="danger-button" id="delete-confirm">${t("delete")}</button><button class="secondary-button" id="dialog-cancel">${t("cancel")}</button></div>`);document.querySelector("#dialog-close").onclick=closeDialog;document.querySelector("#dialog-cancel").onclick=closeDialog;document.querySelector("#delete-confirm").onclick=async()=>{await tombstone(store,id);closeDialog();await refresh(t("itemRemoved"));};}

function resizeImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const max=1000,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/webp",.82));URL.revokeObjectURL(img.src);};img.onerror=reject;img.src=URL.createObjectURL(file);});}

function speak(text){if(!("speechSynthesis" in globalThis))return;speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=locale();utterance.rate=.9;speechSynthesis.speak(utterance);}
function startVoice(){const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;if(!Recognition){toast("Voice recognition is not available here. All actions remain available by touch.");return;}const recognition=new Recognition();recognition.lang=locale();recognition.interimResults=false;toast("Listening…");recognition.onresult=(event)=>handleVoice(event.results[0][0].transcript.toLowerCase());recognition.onerror=()=>toast("I could not hear that. Please try again or use the buttons.");recognition.start();}
function handleVoice(command){if(command.includes("game"))location.hash="#/games";else if(command.includes("dashboard")||command.includes("home"))location.hash="#/patient";else if(command.includes("reminder")){location.hash="#/reminders";if(command.includes("read"))speak(appState.reminders.map((r)=>`${r.title} at ${r.time}`).join(". ")||"There are no reminders.");}else if(command.includes("task"))speak("Today's routine includes medicine, water, gentle exercise, and a daily activity.");else if(command.includes("emergency")||command.includes("help"))confirmSOS();else toast(`I heard “${command}”. Try saying Open Games or Read Reminders.`);}

async function refresh(message,rerender=true){await loadState();if(rerender)render();if(message)toast(message);}
async function guardedSync(){document.querySelector("#sync-button")?.classList.add("pulse");try{const result=await syncNow();toast(result.skipped?(session()?.demo?t("demoLocal"):t("changesQueued")):t("upToDate"));}catch{toast(t("syncRetry"));}finally{document.querySelector("#sync-button")?.classList.remove("pulse");}}

function routeFromLocation() { const hash = location.hash; if (hash.startsWith("#/")) return hash.slice(2); return location.pathname.replace(/^\/+|\/+$/g, ""); }
function normalizeRouteUrl() { if (!location.hash.startsWith("#/")) return; const route = location.hash.slice(2); history.replaceState(null, "", route ? `/${route}` : "/"); }
async function render(){
  normalizeRouteUrl(); applyStaticTranslations(); await loadState(); const route=routeFromLocation(); const isCaregiver=route.startsWith("caregiver");
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
window.addEventListener("beforeinstallprompt",(e)=>{e.preventDefault();installEvent=e;toast(t("readyInstall"));});
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
