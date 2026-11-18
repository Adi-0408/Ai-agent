/**
 * Local IndexedDB File Store
 * Persists uploaded frontend, backend, and database files across refreshes and tab switches
 * and caches payloads prior to / alongside Google Drive storage.
 */

const DB_NAME = 'EchoAgentFileStore';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let cachedDbPromise = null;

function openDatabase() {
  if (cachedDbPromise) {
    return cachedDbPromise;
  }
  cachedDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      cachedDbPromise = null;
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { cachedDbPromise = null; };
      resolve(db);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
  return cachedDbPromise;
}

/**
 * Persist an entire batch of uploaded files in ONE single IndexedDB transaction (<30ms for 50+ files).
 */
export async function saveFilesBatchToLocalStore(records = []) {
  if (!Array.isArray(records) || records.length === 0) return true;
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const now = Date.now();
      for (const rec of records) {
        if (!rec || !rec.id) continue;
        store.put({
          id: rec.id,
          name: rec.name,
          relativePath: rec.relativePath || rec.name,
          mimeType: rec.mimeType || 'text/plain',
          type: rec.type || 'database',
          assistantName: rec.assistantName || 'Workspace',
          content: typeof rec.content === 'string' ? rec.content : '',
          blob: rec.blob || null,
          savedAt: now
        });
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Local IndexedDB batch store failed (falling back cleanly):', e);
    return false;
  }
}

export async function saveFileToLocalStore({ id, name, mimeType, type, content, blob, assistantName }) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id,
        name,
        mimeType: mimeType || 'text/plain',
        type: type || 'database',
        assistantName: assistantName || 'Workspace',
        content: typeof content === 'string' ? content : '',
        blob: blob || null,
        savedAt: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Local IndexedDB store failed (falling back cleanly):', e);
    return false;
  }
}

export async function getFileFromLocalStore(id) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

export async function deleteFileFromLocalStore(id) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

export async function clearAllFilesFromLocalStore() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    return false;
  }
}

export async function deleteAgentFilesFromLocalStore(assistantName) {
  try {
    const cleanTarget = (assistantName || '').toLowerCase().trim();
    if (!cleanTarget) return false;
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        for (const f of all) {
          if ((f.assistantName || '').toLowerCase().trim() === cleanTarget) {
            store.delete(f.id);
          }
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

export async function listFilesFromLocalStore(assistantName) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        if (!assistantName) return resolve(all);
        const cleanTarget = assistantName.toLowerCase().trim();
        const filtered = all.filter(f => (f.assistantName || '').toLowerCase().trim() === cleanTarget);
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}
