import { db } from "./db.js";

const API_BASE = globalThis.SMRITIAI_API_URL || "http://localhost:8000/api";
const SESSION_KEY = "smritiai_session";

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.clear();
}

function errorMessage(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return fallback;
}

export async function api(path, options = {}) {
  const session = getSession();
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && session?.accessToken && !["/login", "/register", "/logout"].includes(path)) {
    await db.clearAll();
    clearSession();
    location.hash = "#/auth";
  }
  if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => ({})), "Request failed"));
  return response.status === 204 ? null : response.json();
}

export async function authenticate(mode, payload) {
  const data = await api(mode === "register" ? "/register" : "/login", { method: "POST", body: JSON.stringify(payload) });
  saveSession({ accessToken: data.accessToken, tokenType: data.tokenType || "bearer", profile: data.profile, demo: false });
  return data;
}

export async function logout() {
  const session = getSession();
  if (session?.accessToken && navigator.onLine) {
    try { await api("/logout", { method: "POST" }); } catch { /* session is cleared locally either way */ }
  }
  await db.clearAll();
  clearSession();
}

export async function syncNow() {
  const session = getSession();
  if (!navigator.onLine || !session?.accessToken || session.demo) return { skipped: true };
  const queued = await db.all("syncQueue");
  const familyUploads = queued.filter((m) => m.store === "familyMembers" && m.operation === "upsert" && m.payload.photoData?.startsWith("data:"));
  for (const mutation of familyUploads) {
    const blob = await (await fetch(mutation.payload.photoData)).blob();
    const form = new FormData();
    form.set("record_id", mutation.recordId);
    form.set("name", mutation.payload.name);
    form.set("relationship", mutation.payload.relationship);
    form.set("photo", blob, `${mutation.recordId}.webp`);
    const uploaded = await api("/family-members", { method: "POST", body: form });
    await db.put("familyMembers", { ...mutation.payload, photoUrl: uploaded.photoUrl, syncStatus: "synced" });
    await db.delete("syncQueue", mutation.id);
  }
  const mutations = queued.filter((m) => !familyUploads.includes(m));
  const cursor = await db.setting("syncCursor", null);
  const data = await api("/sync", { method: "POST", body: JSON.stringify({ cursor, mutations }) });
  for (const record of data.records || []) {
    const local = await db.get(record.store, record.payload.id);
    if (!local || new Date(record.payload.updatedAt) >= new Date(local.updatedAt)) await db.put(record.store, { ...record.payload, syncStatus: "synced" });
  }
  for (const id of data.acknowledged || []) await db.delete("syncQueue", id);
  await db.setSetting("syncCursor", data.cursor);
  return data;
}
