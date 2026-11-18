/**
 * Google Drive Storage Service (API v3 + Google Identity Services + Firebase Google Auth)
 * Stores uploaded Frontend, Backend, and Database files directly inside the user's Google Drive
 * under a clean, human-readable folder hierarchy:
 *   Echo AI Agents / <Assistant Name> / Frontend | Backend | Database
 */

import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  auth,
  saveDeveloperDriveConfig,
  getDeveloperDriveConfig,
  subscribeToDeveloperDriveConfig,
  clearDeveloperDriveConfig,
  patchAgentUploadedFiles
} from '../firebase.js';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER_NAME = 'Echo AI Agents';

const STORAGE_KEYS = {
  CLIENT_ID: 'google_drive_client_id',
  TOKEN: 'google_drive_access_token',
  EXPIRY: 'google_drive_token_expiry',
  EMAIL: 'google_drive_user_email',
  MODE: 'google_drive_auth_mode',
  WEBHOOK_URL: 'google_drive_webhook_url'
};

// In-memory folder cache & lock map so concurrent batch uploads never create duplicate folders
const folderIdCache = new Map();
const inFlightFolderPromises = new Map();

// Central In-Memory Developer Drive Configuration (Synced from Firestore)
let centralDriveConfig = null;

/**
 * Initializes real-time listener to Firestore central Developer Drive configuration.
 * When the developer connects Drive once, all users inherit the developer Drive connection.
 */
export function initDeveloperDriveSync(onStatusChanged) {
  try {
    return subscribeToDeveloperDriveConfig((config) => {
      centralDriveConfig = config;
      if (config?.webhookUrl) {
        setDriveWebhookUrl(config.webhookUrl);
      }
      if (config?.token) {
        saveDriveSession({
          token: config.token,
          expiresIn: config.expiresAt ? Math.max(60, Math.floor((config.expiresAt - Date.now()) / 1000)) : 3600,
          email: config.email || config.developerEmail || '',
          mode: config.mode || 'firestore'
        }, false);
      }
      if (config?.clientId) {
        try {
          localStorage.setItem(STORAGE_KEYS.CLIENT_ID, config.clientId);
        } catch (e) {}
      } else if (config === null) {
        clearDriveTokenOnly();
      }
      if (typeof onStatusChanged === 'function') {
        onStatusChanged(getDriveConnectionStatus());
      }
    });
  } catch (err) {
    console.warn("Could not initialize developer drive sync:", err);
    return () => {};
  }
}

export function getTierFolderLabel(tier) {
  if (tier === 'frontend') return 'Frontend';
  if (tier === 'backend') return 'Backend';
  return 'Database';
}

export const DEFAULT_DRIVE_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzCAFbPqLmLwATKB1xtF0vc_XWxpsKiyHowBuqpFKSFvy6NbBYWwQq0le_V2c7l38o7Og/exec';

export function getDriveWebhookUrl() {
  if (centralDriveConfig?.webhookUrl) {
    return centralDriveConfig.webhookUrl.trim();
  }
  try {
    const envUrl = typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GOOGLE_DRIVE_WEBHOOK_URL || '')
      : '';
    const stored = localStorage.getItem(STORAGE_KEYS.WEBHOOK_URL) || '';
    return (stored || envUrl || DEFAULT_DRIVE_WEBHOOK_URL).trim();
  } catch (e) {
    return DEFAULT_DRIVE_WEBHOOK_URL;
  }
}

export function setDriveWebhookUrl(url) {
  const trimmed = (url || '').trim();
  try {
    if (trimmed) {
      localStorage.setItem(STORAGE_KEYS.WEBHOOK_URL, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEYS.WEBHOOK_URL);
    }
  } catch (e) {}
  return trimmed;
}

export async function verifyAndConnectDriveWebhook(url, developerEmail = '') {
  const trimmed = (url || '').trim();
  if (!trimmed.startsWith('https://script.google.com/macros/s/')) {
    throw new Error('Invalid Webhook URL. It must begin with https://script.google.com/macros/s/...');
  }

  // Ping Webhook
  const res = await fetch(trimmed, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'ping' })
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script returned HTTP ${res.status}. Ensure deployment access is set to "Anyone".`);
  }

  const json = await res.json().catch(() => ({}));
  if (json.status !== 'success' && !json.success && json.service !== 'Echo AI Agent - Google Drive Webhook') {
    throw new Error(json.message || 'Webhook verification did not return valid Echo AI status.');
  }

  setDriveWebhookUrl(trimmed);

  centralDriveConfig = {
    mode: 'webhook',
    webhookUrl: trimmed,
    email: developerEmail || 'Google Apps Script (Webhook)',
    connected: true,
    expiresAt: null
  };

  // Sync centrally to Firestore so all users in the workspace upload to this developer drive
  await saveDeveloperDriveConfig({
    mode: 'webhook',
    webhookUrl: trimmed,
    email: developerEmail || 'Google Apps Script (Webhook)',
    developerEmail: developerEmail || 'Google Apps Script (Webhook)',
    rootFolder: 'Echo_AI_Agent_Files',
    updatedAt: new Date().toISOString()
  });

  return getDriveConnectionStatus();
}

export function getDriveClientId() {
  if (centralDriveConfig?.clientId) {
    return centralDriveConfig.clientId.trim();
  }
  try {
    const envId = typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || '')
      : '';
    const storedId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID) || '';
    return (storedId || envId || '').trim();
  } catch (e) {
    return '';
  }
}

export function setDriveClientId(clientId) {
  try {
    const trimmed = (clientId || '').trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEYS.CLIENT_ID, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLIENT_ID);
    }
    return trimmed;
  } catch (e) {
    return '';
  }
}

export function getDriveAccessToken() {
  // 1. Check in-memory central config from Firestore
  if (centralDriveConfig?.token) {
    const exp = Number(centralDriveConfig.expiresAt || 0);
    if (!exp || Date.now() < exp - 30000) {
      return centralDriveConfig.token;
    }
  }

  // 2. Check localStorage
  try {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    const expiry = Number(localStorage.getItem(STORAGE_KEYS.EXPIRY) || '0');
    if (!token || !expiry || Date.now() >= expiry - 30000) {
      return null;
    }
    return token;
  } catch (e) {
    return null;
  }
}

export function isDriveConnected() {
  return Boolean(getDriveAccessToken() || getDriveWebhookUrl());
}

export function getDriveConnectionStatus() {
  const webhookUrl = getDriveWebhookUrl();
  const token = getDriveAccessToken();
  const isConnected = Boolean(webhookUrl || token);

  let email = centralDriveConfig?.email || centralDriveConfig?.developerEmail || '';
  let expiry = centralDriveConfig?.expiresAt || 0;
  let mode = webhookUrl ? 'webhook' : (centralDriveConfig?.mode || '');

  try {
    if (!email && webhookUrl) email = 'Google Apps Script (Webhook)';
    if (!email) email = localStorage.getItem(STORAGE_KEYS.EMAIL) || '';
    if (!expiry) expiry = Number(localStorage.getItem(STORAGE_KEYS.EXPIRY) || '0');
    if (!mode) mode = localStorage.getItem(STORAGE_KEYS.MODE) || '';
  } catch (e) {}

  return {
    connected: isConnected,
    email: email || (webhookUrl ? 'Google Apps Script (Webhook)' : ''),
    expiresAt: expiry,
    mode: webhookUrl ? 'webhook' : mode,
    webhookUrl,
    clientId: getDriveClientId(),
    isDeveloperDrive: true
  };
}

function saveDriveSession({ token, expiresIn = 3500, email = '', mode = 'gis' }, syncToFirestore = true) {
  const expiresAt = Date.now() + Number(expiresIn) * 1000;
  try {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.EXPIRY, String(expiresAt));
    if (email) localStorage.setItem(STORAGE_KEYS.EMAIL, email);
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
  } catch (e) {}

  centralDriveConfig = {
    token,
    expiresAt,
    email,
    mode,
    clientId: getDriveClientId()
  };

  // Sync centrally to Firestore so all users in the workspace upload to this developer drive
  if (syncToFirestore) {
    saveDeveloperDriveConfig({
      token,
      expiresAt,
      email,
      developerEmail: email,
      mode,
      clientId: getDriveClientId(),
      rootFolder: ROOT_FOLDER_NAME
    }).catch((e) => console.warn('Failed syncing developer drive config to Firestore:', e));
  }
}

export function clearDriveTokenOnly() {
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.EXPIRY);
  } catch (e) {}
  centralDriveConfig = null;
  folderIdCache.clear();
}

export function disconnectDrive() {
  const token = getDriveAccessToken();
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {});
    } catch (e) {}
  }
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.EXPIRY);
    localStorage.removeItem(STORAGE_KEYS.EMAIL);
    localStorage.removeItem(STORAGE_KEYS.MODE);
    localStorage.removeItem(STORAGE_KEYS.WEBHOOK_URL);
  } catch (e) {}
  centralDriveConfig = null;
  folderIdCache.clear();
  inFlightFolderPromises.clear();
  clearDeveloperDriveConfig().catch(() => {});
}

/**
 * Dynamically load Google Identity Services script (https://accounts.google.com/gsi/client)
 */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Browser environment required for Google Drive login.'));
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve(window.google.accounts.oauth2);
      return;
    }
    const existing = document.querySelector('script[data-gis-client="true"]');
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
        else reject(new Error('Google Identity Services failed to initialize.'));
      });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-gis-client', 'true');
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google.accounts.oauth2);
      } else {
        reject(new Error('Google Identity Services loaded but oauth2 is unavailable.'));
      }
    };
    script.onerror = () => reject(new Error('Could not load Google Sign-In library. Check your network connection.'));
    document.head.appendChild(script);
  });
}

async function fetchGoogleUserEmail(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const info = await res.json();
      return info.email || '';
    }
  } catch (e) {}
  return '';
}

/**
 * Connect Google Drive via Google Identity Services (if Client ID configured)
 * or Firebase GoogleAuthProvider with drive.file scope fallback.
 */
export async function connectGoogleDrive(explicitClientId) {
  if (explicitClientId !== undefined) {
    setDriveClientId(explicitClientId);
  }

  const clientId = getDriveClientId();

  // Method A: Official Google Identity Services Token Client (Recommended)
  if (clientId) {
    const oauth2 = await loadGisScript();
    return new Promise((resolve, reject) => {
      try {
        const tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`,
          callback: async (response) => {
            if (response.error) {
              const err = new Error(response.error_description || response.error || 'Google authorization failed');
              err.code = response.error;
              reject(err);
              return;
            }
            if (!response.access_token) {
              reject(new Error('No access token returned by Google.'));
              return;
            }
            const email = await fetchGoogleUserEmail(response.access_token);
            saveDriveSession({
              token: response.access_token,
              expiresIn: response.expires_in || 3599,
              email,
              mode: 'gis'
            });
            resolve(getDriveConnectionStatus());
          },
          error_callback: (err) => {
            reject(new Error(err?.message || err?.type || 'Google Drive authorization popup was closed or blocked.'));
          }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Method B: Firebase Google Auth Popup with Drive scope
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({ prompt: 'consent select_account' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    if (!token) {
      const setupErr = new Error('Google Drive OAuth access token was not returned. Please add a Google OAuth 2.0 Client ID in Drive Setup.');
      setupErr.code = 'DRIVE_NEEDS_SETUP';
      throw setupErr;
    }

    const email = result.user?.email || (await fetchGoogleUserEmail(token));
    saveDriveSession({
      token,
      expiresIn: 3500,
      email,
      mode: 'firebase'
    });
    return getDriveConnectionStatus();
  } catch (err) {
    if (
      err?.code === 'auth/operation-not-allowed' ||
      err?.code === 'auth/unauthorized-domain' ||
      err?.code === 'auth/configuration-not-found' ||
      err?.code === 'DRIVE_NEEDS_SETUP'
    ) {
      const setupErr = new Error(
        'Google Drive setup is required: Enable Google Drive API in Google Cloud Console and paste your OAuth 2.0 Web Client ID.'
      );
      setupErr.code = 'DRIVE_NEEDS_SETUP';
      setupErr.originalError = err;
      throw setupErr;
    }
    throw err;
  }
}

async function driveFetch(url, options = {}) {
  const token = getDriveAccessToken();
  if (!token) {
    const err = new Error('Google Drive is not connected or your session expired.');
    err.code = 'DRIVE_NOT_CONNECTED';
    throw err;
  }

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearDriveTokenOnly();
    const err = new Error('Google Drive session expired. Please reconnect Google Drive.');
    err.code = 'DRIVE_TOKEN_EXPIRED';
    throw err;
  }

  return res;
}

function escapeDriveQuery(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Find or create a Google Drive folder by name under parentId (concurrency-safe)
 */
export async function findOrCreateFolder(folderName, parentId = null) {
  const cleanName = (folderName || 'Workspace').replace(/\//g, '-').trim() || 'Workspace';
  const cacheKey = `${parentId || 'root'}::${cleanName}`;

  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey);
  }
  if (inFlightFolderPromises.has(cacheKey)) {
    return inFlightFolderPromises.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const parentClause = parentId
        ? `'${escapeDriveQuery(parentId)}' in parents`
        : `'root' in parents`;
      const q = `name = '${escapeDriveQuery(cleanName)}' and mimeType = 'application/vnd.google-apps.folder' and ${parentClause} and trashed = false`;

      const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
      const searchRes = await driveFetch(searchUrl);

      if (!searchRes.ok) {
        const errData = await searchRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Failed to search Drive folder "${cleanName}"`);
      }

      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const existingId = searchData.files[0].id;
        folderIdCache.set(cacheKey, existingId);
        return existingId;
      }

      const metadata = {
        name: cleanName,
        mimeType: 'application/vnd.google-apps.folder'
      };
      if (parentId) metadata.parents = [parentId];

      const createRes = await driveFetch(`${DRIVE_API_BASE}/files?fields=id,name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Failed to create Drive folder "${cleanName}"`);
      }

      const created = await createRes.json();
      folderIdCache.set(cacheKey, created.id);
      return created.id;
    } finally {
      inFlightFolderPromises.delete(cacheKey);
    }
  })();

  inFlightFolderPromises.set(cacheKey, promise);
  return promise;
}

/**
 * Ensures folder path exists in Google Drive:
 * Echo AI Agents / <Assistant Name> / <Frontend | Backend | Database>
 */
export async function ensureAgentCategoryFolder(assistantName, tier) {
  const cleanAgent = (assistantName || 'Shared Workspace').replace(/\//g, '-').trim() || 'Shared Workspace';
  const categoryName = getTierFolderLabel(tier);

  const rootFolderId = await findOrCreateFolder(ROOT_FOLDER_NAME, null);
  const agentFolderId = await findOrCreateFolder(cleanAgent, rootFolderId);
  const categoryFolderId = await findOrCreateFolder(categoryName, agentFolderId);

  return {
    rootFolderId,
    agentFolderId,
    categoryFolderId,
    folderPath: `${ROOT_FOLDER_NAME} / ${cleanAgent} / ${categoryName}`
  };
}

/**
 * Upload (or update if same file name exists in same category folder) a file to Google Drive
 * Includes strict timeout guard so a stalled Apps Script / Drive call can never hang the UI.
 */
export async function uploadFileToDrive({
  fileBlob,
  fileName,
  mimeType = 'text/plain',
  assistantName = 'Shared Workspace',
  tier = 'database',
  content = '',
  timeoutMs = 15000,
  skipExistingCheck = false
}) {
  const webhookUrl = getDriveWebhookUrl();
  if (webhookUrl) {
    let textContent = content;
    if (!textContent && fileBlob instanceof Blob) {
      try {
        textContent = await fileBlob.text();
      } catch (err) {
        textContent = '';
      }
    }
    const cleanAgent = (assistantName || 'Shared Workspace').replace(/\//g, '-').trim() || 'Shared Workspace';
    const tierLabel = getTierFolderLabel(tier);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'upload',
          fileName,
          content: typeof textContent === 'string' ? textContent : JSON.stringify(textContent, null, 2),
          mimeType: mimeType || 'text/plain',
          assistantName: cleanAgent,
          tier: tier
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Google Apps Script Webhook returned HTTP error ${res.status}`);
      }

      const resJson = await res.json().catch(() => ({}));
      if (resJson.status === 'error' || resJson.success === false) {
        throw new Error(resJson.message || 'Google Drive Webhook upload failed.');
      }

      return {
        driveFileId: resJson.fileId || `webhook_${Date.now()}`,
        driveWebViewLink: resJson.webViewLink || '',
        driveContentLink: resJson.downloadUrl || '',
        driveFolderId: resJson.fileId || '',
        driveAgentFolderId: '',
        driveFolderPath: resJson.folderPath || `Echo_AI_Agent_Files / ${cleanAgent} / ${tierLabel}`,
        driveFolderLink: resJson.webViewLink || '',
        storageStatus: 'synced'
      };
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new Error(`Google Drive upload timed out after ${Math.round(timeoutMs / 1000)}s for "${fileName}"`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const { categoryFolderId, agentFolderId, folderPath } = await ensureAgentCategoryFolder(assistantName, tier);

  const payloadBlob = fileBlob instanceof Blob
    ? fileBlob
    : new Blob([typeof content === 'string' ? content : JSON.stringify(content)], {
        type: mimeType || 'text/plain'
      });

  // Check if a file with this exact name already exists inside the category folder (skippable for brand-new agent folders)
  let existingFileId = null;
  if (!skipExistingCheck) {
    try {
      const q = `name = '${escapeDriveQuery(fileName)}' and '${escapeDriveQuery(categoryFolderId)}' in parents and trashed = false`;
      const listRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
      if (listRes.ok) {
        const listData = await listRes.json();
        if (listData.files && listData.files.length > 0) {
          existingFileId = listData.files[0].id;
        }
      }
    } catch (e) {}
  }

  const effectiveMime = mimeType || payloadBlob.type || 'application/octet-stream';
  const metadata = existingFileId
    ? { name: fileName, mimeType: effectiveMime }
    : { name: fileName, mimeType: effectiveMime, parents: [categoryFolderId] };

  const boundary = '-------echo_drive_boundary_' + Math.random().toString(36).slice(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata);

  const fileHeaderPart =
    delimiter +
    `Content-Type: ${effectiveMime}\r\n\r\n`;

  const multipartBody = new Blob(
    [metadataPart, fileHeaderPart, payloadBlob, closeDelimiter],
    { type: `multipart/related; boundary=${boundary}` }
  );

  const endpoint = existingFileId
    ? `${DRIVE_UPLOAD_BASE}/files/${existingFileId}?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink,createdTime`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let uploadRes;
  try {
    uploadRes = await driveFetch(endpoint, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!uploadRes.ok) {
    const errData = await uploadRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive upload failed for "${fileName}"`);
  }

  const uploaded = await uploadRes.json();
  return {
    driveFileId: uploaded.id,
    driveWebViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    driveContentLink: uploaded.webContentLink || '',
    driveFolderId: categoryFolderId,
    driveAgentFolderId: agentFolderId,
    driveFolderPath: folderPath,
    driveFolderLink: `https://drive.google.com/drive/folders/${agentFolderId}`,
    storageStatus: 'synced'
  };
}

/**
 * High-speed Concurrent Batch Upload to Google Drive with bounded worker pool.
 * Eliminates 1-by-1 sequential waiting: 4x–6x faster than sequential loops while
 * protecting Apps Script / Drive API from rate-limit spikes.
 */
export async function uploadFilesBatchToDrive(fileTasks = [], options = {}) {
  if (!Array.isArray(fileTasks) || fileTasks.length === 0) return [];
  const isWebhook = Boolean(getDriveWebhookUrl());
  const concurrency = Math.max(1, Number(options.concurrency || (isWebhook ? 4 : 6)));
  const uploadFn = typeof options.uploadFn === 'function' ? options.uploadFn : uploadFileToDrive;
  const onFileProgress = typeof options.onFileProgress === 'function' ? options.onFileProgress : null;

  // Pre-warm Drive category folders ONCE per unique (assistantName, tier) in Direct Drive API mode
  if (!isWebhook && !options.uploadFn) {
    const uniquePairs = new Map();
    for (const task of fileTasks) {
      const key = `${task.assistantName || 'Shared Workspace'}::${task.tier || 'database'}`;
      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { assistantName: task.assistantName || 'Shared Workspace', tier: task.tier || 'database' });
      }
    }
    await Promise.allSettled(
      Array.from(uniquePairs.values()).map(({ assistantName, tier }) =>
        ensureAgentCategoryFolder(assistantName, tier)
      )
    );
  }

  const results = new Array(fileTasks.length);
  let nextIdx = 0;
  let completedCount = 0;

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= fileTasks.length) break;
      const task = fileTasks[idx];
      try {
        const driveMeta = await uploadFn(task);
        results[idx] = { id: task.id, fileName: task.fileName, ok: true, driveMeta };
      } catch (err) {
        console.warn('[Echo Drive Batch] Upload failed for', task.fileName, err?.message || err);
        results[idx] = {
          id: task.id,
          fileName: task.fileName,
          ok: false,
          driveMeta: {
            storageStatus: 'drive_failed',
            storageError: err?.message || 'Drive upload failed'
          }
        };
      }
      completedCount++;
      if (onFileProgress) {
        try {
          onFileProgress(completedCount, fileTasks.length, results[idx]);
        } catch (_) {}
      }
    }
  }

  const workerCount = Math.min(concurrency, fileTasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Non-blocking Background Google Drive Sync for an assistant's files.
 * Returns immediately so agent creation completes in < 2s while files upload concurrently
 * in the background and patch Firestore live as they complete.
 */
export function syncAgentFilesToDriveInBackground({
  agentId,
  files = [],
  concurrency,
  uploadFn,
  patchFn,
  onProgress,
  onComplete
}) {
  if (!agentId || !Array.isArray(files) || files.length === 0) {
    if (typeof onComplete === 'function') onComplete([]);
    return Promise.resolve([]);
  }
  if (!uploadFn && !isDriveConnected()) {
    if (typeof onComplete === 'function') onComplete([]);
    return Promise.resolve([]);
  }

  const patcher = typeof patchFn === 'function' ? patchFn : patchAgentUploadedFiles;
  const tasks = files.map((f) => ({
    id: f.id,
    fileBlob: f.rawFile || f.blob || null,
    fileName: f.name || f.fileName,
    mimeType: f.mimeType || 'text/plain',
    assistantName: agentId,
    tier: f.type || f.tier || 'database',
    content: typeof f.content === 'string' ? f.content : (f.contentPreview || ''),
    skipExistingCheck: Boolean(f.skipExistingCheck)
  }));

  const pendingPatch = {};
  let flushTimer = null;

  const flushUpdates = async () => {
    const keys = Object.keys(pendingPatch);
    if (keys.length === 0) return;
    const snapshot = { ...pendingPatch };
    for (const k of keys) delete pendingPatch[k];
    await patcher(agentId, snapshot).catch(() => {});
  };

  const promise = uploadFilesBatchToDrive(tasks, {
    concurrency,
    uploadFn,
    onFileProgress: (done, total, itemRes) => {
      if (itemRes?.id && itemRes?.driveMeta) {
        pendingPatch[itemRes.id] = itemRes.driveMeta;
        if (!flushTimer && done < total) {
          flushTimer = setTimeout(() => {
            flushTimer = null;
            flushUpdates();
          }, 1200);
        }
      }
      if (typeof onProgress === 'function') {
        onProgress(done, total, itemRes);
      }
    }
  })
    .then(async (allResults) => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      for (const r of allResults) {
        if (r?.id && r?.driveMeta) pendingPatch[r.id] = r.driveMeta;
      }
      await flushUpdates();
      if (typeof onComplete === 'function') onComplete(allResults);
      return allResults;
    })
    .catch((err) => {
      console.warn('[Echo Drive Background Sync] Error:', err);
      if (typeof onComplete === 'function') onComplete([]);
      return [];
    });

  return promise;
}

/**
 * Download raw text/binary content of a file stored in Google Drive
 */
export async function fetchDriveFileContent(driveFileId) {
  if (!driveFileId) return '';
  const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}?alt=media`);
  if (!res.ok) {
    throw new Error('Could not load file content from Google Drive.');
  }
  return await res.text();
}

/**
 * List all files stored in Google Drive under Echo AI Agents / <Assistant Name> / (Frontend|Backend|Database)
 */
export async function listAssistantDriveFiles(assistantName) {
  const cleanAgent = (assistantName || 'Shared Workspace').replace(/\//g, '-').trim() || 'Shared Workspace';
  const rootQuery = `name = '${escapeDriveQuery(ROOT_FOLDER_NAME)}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
  const rootRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(rootQuery)}&fields=files(id,name)`);
  if (!rootRes.ok) return [];
  const rootJson = await rootRes.json();
  if (!rootJson.files?.length) return [];

  const rootId = rootJson.files[0].id;
  const agentQuery = `name = '${escapeDriveQuery(cleanAgent)}' and mimeType = 'application/vnd.google-apps.folder' and '${escapeDriveQuery(rootId)}' in parents and trashed = false`;
  const agentRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(agentQuery)}&fields=files(id,name)`);
  if (!agentRes.ok) return [];
  const agentJson = await agentRes.json();
  if (!agentJson.files?.length) return [];

  const agentFolderId = agentJson.files[0].id;
  const catQuery = `mimeType = 'application/vnd.google-apps.folder' and '${escapeDriveQuery(agentFolderId)}' in parents and trashed = false`;
  const catRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(catQuery)}&fields=files(id,name)`);
  if (!catRes.ok) return [];
  const catJson = await catRes.json();

  const results = [];
  for (const folder of catJson.files || []) {
    const folderLower = (folder.name || '').toLowerCase();
    const tier = folderLower === 'frontend' ? 'frontend' : folderLower === 'backend' ? 'backend' : 'database';
    const categoryLabel =
      tier === 'frontend'
        ? 'Frontend (UI/Pages)'
        : tier === 'backend'
        ? 'Backend (APIs/Routes)'
        : 'Database (Records/Catalog)';

    const filesQ = `'${escapeDriveQuery(folder.id)}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
    const filesRes = await driveFetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(filesQ)}&fields=files(id,name,mimeType,size,webViewLink,webContentLink,createdTime)&orderBy=createdTime desc`
    );
    if (!filesRes.ok) continue;
    const filesJson = await filesRes.json();

    for (const f of filesJson.files || []) {
      const bytes = Number(f.size || 0);
      results.push({
        id: `gdrive_${f.id}`,
        name: f.name,
        mimeType: f.mimeType,
        size: bytes ? `${(bytes / 1024).toFixed(1)} KB` : 'Stored in Drive',
        sizeBytes: bytes,
        type: tier,
        categoryLabel,
        itemsCount: 0,
        uploadedAt: f.createdTime ? new Date(f.createdTime).toLocaleDateString() : 'From Drive',
        driveFileId: f.id,
        driveWebViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
        driveContentLink: f.webContentLink || '',
        driveFolderId: folder.id,
        driveAgentFolderId: agentFolderId,
        driveFolderPath: `${ROOT_FOLDER_NAME} / ${cleanAgent} / ${folder.name}`,
        driveFolderLink: `https://drive.google.com/drive/folders/${agentFolderId}`,
        storageStatus: 'synced'
      });
    }
  }

  return results;
}

/**
 * Delete (or trash) a file from Google Drive (Supports both Webhook and Direct Drive API)
 */
export async function deleteDriveFile(driveFileId) {
  if (!driveFileId || !isDriveConnected()) return false;

  // 1. Webhook mode
  const webhookUrl = getDriveWebhookUrl();
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_file',
          fileId: driveFileId
        })
      });
      return res.ok;
    } catch (err) {
      console.warn('Webhook deleteDriveFile error:', err);
    }
  }

  // 2. Direct API mode
  try {
    const res = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE'
    });
    if (res.ok || res.status === 404) return true;

    // Fallback to moving to trash if direct delete is restricted
    const trashRes = await driveFetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(driveFileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    return trashRes.ok;
  } catch (e) {
    console.warn('Could not delete file from Google Drive:', e);
    return false;
  }
}

/**
 * Deletes an assistant's dedicated folder and all its associated files from Google Drive.
 * Supports both Google Apps Script Webhook and Direct Drive API.
 */
export async function deleteAgentFolderAndFilesFromDrive(assistantName, uploadedFiles = []) {
  if (!assistantName || !isDriveConnected()) return false;

  const cleanAgent = (assistantName || '').trim().replace(/\//g, '-') || 'Voice Assistant';
  let overallSuccess = false;

  // 1. Webhook Mode
  const webhookUrl = getDriveWebhookUrl();
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_agent',
          assistantName: cleanAgent
        })
      });
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.success || json.status === 'success') {
          overallSuccess = true;
        }
      }
    } catch (err) {
      console.warn('Webhook deleteAgentFolderAndFilesFromDrive error:', err);
    }
  }

  // 2. Direct Drive API Mode (or fallback if direct access tokens exist)
  if (getDriveAccessToken()) {
    try {
      // A. Delete any files recorded with explicit driveFileId
      if (Array.isArray(uploadedFiles)) {
        for (const file of uploadedFiles) {
          if (file?.driveFileId) {
            await deleteDriveFile(file.driveFileId);
          }
        }
      }

      // B. Locate and trash the assistant's parent folder under ROOT_FOLDER_NAME or Echo_AI_Agent_Files
      const rootNames = [ROOT_FOLDER_NAME, 'Echo_AI_Agent_Files'];
      for (const rName of rootNames) {
        const rootFoldersQuery = `name = '${escapeDriveQuery(rName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const rootRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(rootFoldersQuery)}&fields=files(id,name)`);
        if (rootRes.ok) {
          const rootJson = await rootRes.json();
          for (const rFolder of rootJson.files || []) {
            const agentQuery = `name = '${escapeDriveQuery(cleanAgent)}' and mimeType = 'application/vnd.google-apps.folder' and '${escapeDriveQuery(rFolder.id)}' in parents and trashed = false`;
            const agentRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(agentQuery)}&fields=files(id,name)`);
            if (agentRes.ok) {
              const agentJson = await agentRes.json();
              for (const aFolder of agentJson.files || []) {
                await deleteDriveFile(aFolder.id);
                overallSuccess = true;
              }
            }
          }
        }
      }

      // C. Clear in-memory folder cache matching this agent
      for (const key of folderIdCache.keys()) {
        if (key.includes(cleanAgent)) {
          folderIdCache.delete(key);
        }
      }
    } catch (err) {
      console.warn('Direct Drive deleteAgentFolderAndFilesFromDrive error:', err);
    }
  }

  return overallSuccess;
}

/**
 * Trashes all Echo AI Agent folders and data across Google Drive.
 */
export async function deleteAllAgentsDriveFolders() {
  if (!isDriveConnected()) return false;

  const webhookUrl = getDriveWebhookUrl();
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete_all' })
      });
    } catch (e) {}
  }

  if (getDriveAccessToken()) {
    try {
      const rootNames = [ROOT_FOLDER_NAME, 'Echo_AI_Agent_Files'];
      for (const rName of rootNames) {
        const rootFoldersQuery = `name = '${escapeDriveQuery(rName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const rootRes = await driveFetch(`${DRIVE_API_BASE}/files?q=${encodeURIComponent(rootFoldersQuery)}&fields=files(id,name)`);
        if (rootRes.ok) {
          const rootJson = await rootRes.json();
          for (const rFolder of rootJson.files || []) {
            await deleteDriveFile(rFolder.id);
          }
        }
      }
      folderIdCache.clear();
      inFlightFolderPromises.clear();
    } catch (e) {
      console.warn('Direct Drive deleteAllAgentsDriveFolders error:', e);
    }
  }

  return true;
}
