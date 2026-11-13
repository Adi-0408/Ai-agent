/**
 * Local IndexedDB File Store
 * Persists uploaded frontend, backend, and database files across refreshes and tab switches
 * and caches payloads prior to / alongside Google Drive storage.
 */

const DB_NAME = 'EchoAgentFileStore';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
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
