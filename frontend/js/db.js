const DB_NAME = "smritiai";
const DB_VERSION = 1;
export const STORES = ["profiles", "reminders", "moods", "gameResults", "familyMembers", "achievements", "alerts", "settings", "analytics", "syncQueue"];

let connection;

export function uid(prefix = "rec") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function timestamp() {
  return new Date().toISOString();
}

export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

async function transaction(store, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const objectStore = tx.objectStore(store);
    let result;
    try { result = action(objectStore); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  get: (store, id) => transaction(store, "readonly", (s) => s.get(id)),
  all: (store) => transaction(store, "readonly", (s) => s.getAll()),
  put: (store, value) => transaction(store, "readwrite", (s) => s.put(value)),
  delete: (store, id) => transaction(store, "readwrite", (s) => s.delete(id)),
  clear: (store) => transaction(store, "readwrite", (s) => s.clear()),
  async clearAll() { for (const store of STORES) await this.clear(store); },
  async setting(id, fallback = null) { return (await this.get("settings", id))?.value ?? fallback; },
  async setSetting(id, value) { return this.put("settings", { id, value, updatedAt: timestamp() }); },
  async save(store, data, queue = true) {
    const existing = data.id ? await this.get(store, data.id) : null;
    const now = timestamp();
    const record = {
      ...existing,
      ...data,
      id: data.id || uid(store.slice(0, -1)),
      deviceId: await getDeviceId(),
      createdAt: existing?.createdAt || data.createdAt || now,
      updatedAt: data.updatedAt || now,
      syncStatus: queue ? "pending" : (data.syncStatus || "local")
    };
    await this.put(store, record);
    if (queue && !record.demoOnly) {
      await this.put("syncQueue", {
        id: uid("mutation"), store, operation: record.deletedAt ? "delete" : "upsert",
        recordId: record.id, payload: record, attempts: 0, createdAt: now, updatedAt: now
      });
    }
    return record;
  }
};

export async function getDeviceId() {
  let id = localStorage.getItem("smritiai_device");
  if (!id) { id = uid("device"); localStorage.setItem("smritiai_device", id); }
  return id;
}

export async function tombstone(store, id) {
  const record = await db.get(store, id);
  if (!record) return;
  return db.save(store, { ...record, deletedAt: timestamp() }, !record.demoOnly);
}

export function active(records) {
  return records.filter((record) => !record.deletedAt);
}
