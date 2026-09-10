import { db } from "./db.js";

const API_BASE = String(globalThis.SMRITIAI_API_URL || "").replace(/\/$/, "");

function apiError(payload, status) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => `${item.loc?.at(-1) || "Field"}: ${item.msg || "is invalid"}`).join(". ");
  }
  return `The server could not complete this request (${status}).`;
}

function requireApiBase() {
  if (!API_BASE) throw new Error("The secure server address has not been configured yet.");
  return API_BASE;
}

export async function api(path, options = {}) {
  let session = JSON.parse(localStorage.getItem("smritiai_session") || "null");
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const base = requireApiBase();
  let response;
  try {
    response = await fetch(`${base}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error("The secure server could not be reached. Please check the server address and connection.", { cause: error });
  }
  if (response.status === 401 && session?.refreshToken && path !== "/token/refresh") {
    const refreshed = await fetch(`${base}/token/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    if (refreshed.ok) {
      session = { ...session, ...(await refreshed.json()) };
      localStorage.setItem("smritiai_session", JSON.stringify(session));
      headers.Authorization = `Bearer ${session.accessToken}`;
      response = await fetch(`${base}${path}`, { ...options, headers });
    }
  }
  if (!response.ok) throw new Error(apiError(await response.json().catch(() => ({})), response.status));
  return response.status === 204 ? null : response.json();
}

export async function authenticate(mode, payload) {
  const clean = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  let data;
  try {
    data = await api(mode === "register" ? "/register" : "/login", { method: "POST", body: JSON.stringify(clean) });
  } catch (error) {
    // A registration response can be lost after the server commits it (for example,
    // because of a transient CORS/network failure). A login safely reconciles that case.
    if (mode !== "register") throw error;
    try {
      data = await api("/login", { method: "POST", body: JSON.stringify({ email: clean.email, password: clean.password }) });
    } catch {
      throw error;
    }
  }
  localStorage.setItem("smritiai_session", JSON.stringify(data));
  return data;
}

export async function syncNow() {
  const session = JSON.parse(localStorage.getItem("smritiai_session") || "null");
  if (!navigator.onLine || !session?.accessToken || session.demo) return { skipped: true };
  const queued = await db.all("syncQueue");
  const familyUploads = queued.filter((m) => m.store === "familyMembers" && m.operation === "upsert" && m.payload.photoData?.startsWith("data:"));
  for (const mutation of familyUploads) {
    const blob = await (await fetch(mutation.payload.photoData)).blob();
    const form = new FormData();
    form.set("record_id", mutation.recordId); form.set("name", mutation.payload.name); form.set("relationship", mutation.payload.relationship); form.set("photo", blob, `${mutation.recordId}.webp`);
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

