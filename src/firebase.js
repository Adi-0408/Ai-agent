import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAslA6IJZYcnWmvoEoGSagyQLBmyqsXOOk",
  authDomain: "ai-agent-11df2.firebaseapp.com",
  projectId: "ai-agent-11df2",
  storageBucket: "ai-agent-11df2.firebasestorage.app",
  messagingSenderId: "871360023618",
  appId: "1:871360023618:web:b175f8f8a46d82dc6df1db",
  measurementId: "G-V56ZLJMGBC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Authentication Helpers & Session Persistence
const USER_SESSION_KEY = 'echo_user_session';

export function getSavedUserSession() {
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveUserSession(user) {
  try {
    if (user) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_SESSION_KEY);
    }
  } catch (e) {}
}

export async function loginWithEmail(email, password) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, password);
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName || email.split('@')[0],
      avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Admin',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export async function registerWithEmail(email, password, displayName) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && res.user) {
      await updateProfile(res.user, { displayName });
    }
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: displayName || email.split('@')[0],
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Creator',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(auth, provider);
    const userObj = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName || 'Google User',
      avatar: res.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${res.user.uid}`,
      role: 'Workspace Admin',
      isGuest: false
    };
    saveUserSession(userObj);
    return userObj;
  } catch (err) {
    throw err;
  }
}

export function loginAsGuest(name = 'Alex Rivera', role = 'Cloud Architect & AI Lead') {
  const guestUser = {
    uid: `guest_${Date.now()}`,
    email: 'alex.rivera@workspace.io',
    displayName: name,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    role: role,
    isGuest: true
  };
  saveUserSession(guestUser);
  return guestUser;
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (e) {}
  saveUserSession(null);
}

// Collection References
const AGENTS_COLLECTION = 'agents';
const CONVERSATIONS_COLLECTION = 'conversations';

/**
/**
 * Helper to ensure human-readable database titles without any encrypted/hash IDs
 */
export function getCleanTitleId(nameOrAgent) {
  if (!nameOrAgent) return 'Voice Assistant';
  const raw = typeof nameOrAgent === 'string' ? nameOrAgent : (nameOrAgent.name || nameOrAgent.title || nameOrAgent.id || 'Voice Assistant');
  let clean = raw.trim();
  // Strip out old encrypted prefixes like 'agent_help_desk_kg4n' or 'session_...'
  if (/^agent_[a-z0-9_]+$/i.test(clean)) {
    clean = clean.replace(/^agent_/, '').replace(/_[a-z0-9]{4,6}$/, '').replace(/_/g, ' ');
    clean = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  // Sanitize forward slashes for Firestore document ID safety
  return clean.replace(/\//g, '-').trim() || 'Voice Assistant';
}

/**
 * Fetch all voice help desk agents
 */
export async function getAgents() {
  try {
    const q = query(collection(db, AGENTS_COLLECTION), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const seen = new Set();
    const agents = [];
    for (const d of snapshot.docs) {
      const data = d.data();
      const titleId = getCleanTitleId(data.name || d.id);
      if (!seen.has(titleId.toLowerCase())) {
        seen.add(titleId.toLowerCase());
        agents.push({ id: titleId, ...data, name: data.name || titleId });
      }
    }
    return agents;
  } catch (error) {
    console.warn("Could not fetch agents from Firestore, falling back:", error);
    return [];
  }
}

/**
 * Real-time subscription to agents
 */
export function subscribeToAgents(callback) {
  try {
    const q = query(collection(db, AGENTS_COLLECTION), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const seen = new Set();
      const agents = [];
      for (const d of snapshot.docs) {
        const data = d.data();
        const titleId = getCleanTitleId(data.name || d.id);
        if (!seen.has(titleId.toLowerCase())) {
          seen.add(titleId.toLowerCase());
          agents.push({ id: titleId, ...data, name: data.name || titleId });
        }
      }
      callback(agents);
    }, (error) => {
      console.warn("Firestore subscription error:", error);
    });
  } catch (error) {
    console.warn("Failed to subscribe to agents:", error);
    return () => {};
  }
}

/**
 * Fetch a single agent by ID or Name/Title (with localStorage caching)
 */
export async function getAgentById(agentId) {
  const titleId = getCleanTitleId(agentId);
  const cacheKey = `agent_cache_${titleId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {}

  // 1. Try clean title ID
  let docRef = doc(db, AGENTS_COLLECTION, titleId);
  let snap = await getDoc(docRef);

  // 2. Fallback to raw ID if different
  if (!snap.exists() && agentId !== titleId) {
    docRef = doc(db, AGENTS_COLLECTION, agentId);
    snap = await getDoc(docRef);
  }

  if (!snap.exists()) return null;

  const data = { id: titleId, ...snap.data(), name: snap.data().name || titleId };
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {}

  return data;
}

/**
 * Deeply sanitize an object to strip undefined values so Firestore setDoc never throws.
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (typeof obj._methodName === 'string' || obj.constructor?.name === 'FieldValue') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
  }
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

/**
 * Create or save an agent using its clean Name/Title for the database document (NO encrypted ID)
 */
export async function saveAgent(agent) {
  const titleId = getCleanTitleId(agent.name || agent.title || agent.id);
  const agentRef = doc(db, AGENTS_COLLECTION, titleId);

  const rawPayload = {
    ...agent,
    id: titleId,
    name: agent.name || titleId,
    updatedAt: serverTimestamp(),
    createdAt: agent.createdAt || serverTimestamp(),
  };

  const payload = sanitizeForFirestore(rawPayload);

  await setDoc(agentRef, payload, { merge: true });

  // Clean cache and purge any legacy encrypted ID document
  try {
    localStorage.removeItem(`agent_cache_${titleId}`);
    if (agent.id && agent.id !== titleId) {
      localStorage.removeItem(`agent_cache_${agent.id}`);
      deleteDoc(doc(db, AGENTS_COLLECTION, agent.id)).catch(() => {});
    }
    // Remove tombstone if it was previously marked deleted
    deleteDoc(doc(db, 'deleted_agents', titleId)).catch(() => {});
    if (agent.id && agent.id !== titleId) {
      deleteDoc(doc(db, 'deleted_agents', agent.id)).catch(() => {});
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`vhd_deleted_${titleId.toLowerCase().replace(/\s+/g, '_')}`);
      if (agent.id) {
        localStorage.removeItem(`vhd_deleted_${String(agent.id).toLowerCase().replace(/\s+/g, '_')}`);
      }
    }
  } catch (e) {}

  return { id: titleId, ...payload };
}

/**
 * Delete an agent and its corresponding conversation.
 * Writes a tombstone record to deleted_agents so live embed widgets immediately deactivate.
 */
export async function deleteAgent(nameOrId) {
  const agentObj = typeof nameOrId === 'object' && nameOrId !== null ? nameOrId : {};
  const rawId = typeof nameOrId === 'string' ? nameOrId : (agentObj.id || agentObj.name || '');
  const titleId = getCleanTitleId(rawId);
  const nameId = agentObj.name ? getCleanTitleId(agentObj.name) : '';

  // 1. Delete from agents collection
  await deleteDoc(doc(db, AGENTS_COLLECTION, titleId)).catch(() => {});
  if (rawId && rawId !== titleId) {
    await deleteDoc(doc(db, AGENTS_COLLECTION, rawId)).catch(() => {});
  }
  if (nameId && nameId !== titleId && nameId !== rawId) {
    await deleteDoc(doc(db, AGENTS_COLLECTION, nameId)).catch(() => {});
  }

  // 2. Mark in deleted_agents tombstone collection so any embedded widgets immediately deactivate
  try {
    await setDoc(doc(db, 'deleted_agents', titleId), {
      id: titleId,
      name: agentObj.name || titleId,
      isDeleted: true,
      deletedAt: serverTimestamp()
    });
    if (rawId && rawId !== titleId) {
      await setDoc(doc(db, 'deleted_agents', rawId), {
        id: rawId,
        isDeleted: true,
        deletedAt: serverTimestamp()
      }).catch(() => {});
    }
    if (nameId && nameId !== titleId && nameId !== rawId) {
      await setDoc(doc(db, 'deleted_agents', nameId), {
        id: nameId,
        isDeleted: true,
        deletedAt: serverTimestamp()
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Could not write deleted_agents tombstone:", e);
  }

  // 3. Delete corresponding conversation
  await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, titleId)).catch(() => {});
  if (rawId && rawId !== titleId) {
    await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, rawId)).catch(() => {});
  }

  // 4. Purge local caches and store deletion marker
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`agent_cache_${titleId}`);
      localStorage.removeItem(`agent_cache_${rawId}`);
      localStorage.removeItem(`echo_logs_${titleId}`);
      localStorage.removeItem(`vhd_agent_${titleId.toLowerCase().replace(/\s+/g, '_')}`);
      localStorage.removeItem(`vhd_agent_${rawId.toLowerCase().replace(/\s+/g, '_')}`);
      localStorage.setItem(`vhd_deleted_${titleId.toLowerCase().replace(/\s+/g, '_')}`, 'true');
      localStorage.setItem(`vhd_deleted_${rawId.toLowerCase().replace(/\s+/g, '_')}`, 'true');
    }
  } catch (e) {}
}

/**
 * Delete all agents, conversations, and cached workspace data
 */
export async function deleteAllAgentsAndData() {
  try {
    // 1. Mark in deleted_agents tombstone, then delete from Firestore
    const agentsSnapshot = await getDocs(collection(db, AGENTS_COLLECTION));
    for (const d of agentsSnapshot.docs) {
      await setDoc(doc(db, 'deleted_agents', d.id), {
        id: d.id,
        isDeleted: true,
        deletedAt: serverTimestamp()
      }).catch(() => {});
      await deleteDoc(d.ref).catch(() => {});
    }

    // 2. Delete all conversation history documents
    const convSnapshot = await getDocs(collection(db, CONVERSATIONS_COLLECTION));
    for (const d of convSnapshot.docs) {
      await deleteDoc(d.ref).catch(() => {});
    }

    // 3. Clear localStorage caches
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (
            key &&
            (key.startsWith('agent_cache_') ||
              key.startsWith('echo_logs_') ||
              key.startsWith('vhd_agent_') ||
              key === 'echo_workspace_shared_files')
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch (e) {}
    }

    return true;
  } catch (err) {
    console.error("Failed to delete all agents and data:", err);
    throw err;
  }
}

/**
 * Save conversation turns to the single conversation document for 1 agent
 * Stored in Firestore under: doc(db, 'conversations', agentName)
 * In single conversation document, it holds the overall conversation of that 1 agent (zero encrypted IDs).
 */
export async function saveConversationSession(conversation) {
  const agentTitle = getCleanTitleId(conversation.agentName || conversation.agentId || 'Voice Assistant');
  const convDocRef = doc(db, CONVERSATIONS_COLLECTION, agentTitle);

  const newMessages = conversation.messages || (conversation.text ? [{
    role: conversation.role || 'user',
    text: conversation.text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }] : []);

  // Read existing document to accumulate the single overall conversation for this 1 agent
  let existingMessages = [];
  let existingSessions = [];
  try {
    const snap = await getDoc(convDocRef);
    if (snap.exists()) {
      const data = snap.data();
      existingMessages = Array.isArray(data.messages) ? data.messages : (Array.isArray(data.overallConversation) ? data.overallConversation : []);
      existingSessions = Array.isArray(data.sessions) ? data.sessions : [];
    }
  } catch (e) {
    console.warn("Could not read existing conversation doc from Firestore:", e);
  }

  // Fallback to local cache if empty
  if (existingMessages.length === 0 && typeof localStorage !== 'undefined') {
    try {
      const cached = JSON.parse(localStorage.getItem(`echo_logs_${agentTitle}`) || '[]');
      if (cached && cached[0] && Array.isArray(cached[0].messages)) {
        existingMessages = cached[0].messages;
      }
    } catch (e) {}
  }

  // Merge messages: append new turns into single overall conversation
  const overallConversation = [...existingMessages, ...newMessages];

  const sessionTitle = `${agentTitle} Session #${existingSessions.length + 1}`;
  const newSessionEntry = {
    id: sessionTitle,
    sessionId: sessionTitle,
    agentName: agentTitle,
    agentId: agentTitle,
    caller: conversation.caller || `Website Visitor #${Math.floor(1000 + Math.random() * 9000)}`,
    duration: conversation.duration || `${Math.max(15, newMessages.length * 10)}s`,
    status: conversation.status || 'Resolved',
    summary: conversation.summary || newMessages[0]?.text?.substring(0, 85) || `${agentTitle} voice dialogue`,
    timestamp: conversation.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString(),
    turnCount: newMessages.length,
    messages: newMessages
  };

  const updatedSessions = [newSessionEntry, ...existingSessions.filter(s => s.id !== sessionTitle)].slice(0, 50);

  const updatedPayload = {
    id: agentTitle,
    agentName: agentTitle,
    agentTitle: agentTitle,
    title: `${agentTitle} - Overall Conversation`,
    status: 'Active',
    summary: conversation.summary || newMessages[newMessages.length - 1]?.text || `${agentTitle} active conversation`,
    lastMessage: newMessages[newMessages.length - 1]?.text || 'Conversational dialogue',
    lastTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    totalMessages: overallConversation.length,
    totalSessions: updatedSessions.length,
    caller: conversation.caller || 'Website Visitor',
    duration: conversation.duration || `${Math.max(30, overallConversation.length * 12)}s`,
    messages: overallConversation,
    overallConversation: overallConversation,
    sessions: updatedSessions,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  // 1. LocalStorage folder caching under the clean agent title
  try {
    if (typeof localStorage !== 'undefined') {
      const storeKey = `echo_logs_${agentTitle}`;
      localStorage.setItem(storeKey, JSON.stringify([updatedPayload, ...updatedSessions]));

      const allKey = 'echo_logs_all';
      const existingAll = JSON.parse(localStorage.getItem(allKey) || '[]');
      const updatedAll = [updatedPayload, ...existingAll.filter(i => i.id !== agentTitle)].slice(0, 100);
      localStorage.setItem(allKey, JSON.stringify(updatedAll));
    }
  } catch (e) {}

  // 2. Persist directly to single agent document in Firestore (NO encrypted ID!)
  try {
    await setDoc(convDocRef, updatedPayload, { merge: true });
    return agentTitle;
  } catch (error) {
    console.warn("Firestore save to agent conversation document failed, cached locally:", error);
    return agentTitle;
  }
}

/**
 * Get conversations for an agent: returns the single overall conversation document for that 1 agent
 */
export async function getConversations(agentNameOrId, maxLimit = 50) {
  const agentTitle = agentNameOrId && agentNameOrId !== 'all' ? getCleanTitleId(agentNameOrId) : null;
  
  const localLogs = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const storageKey = (!agentTitle || agentTitle === 'all') ? 'echo_logs_all' : `echo_logs_${agentTitle}`;
      const raw = localStorage.getItem(storageKey);
      if (raw) localLogs.push(...JSON.parse(raw));
    }
  } catch (e) {}

  try {
    if (agentTitle && agentTitle !== 'all') {
      // Single conversation document for this 1 agent
      const convDocRef = doc(db, CONVERSATIONS_COLLECTION, agentTitle);
      const snap = await getDoc(convDocRef);
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        const sessions = Array.isArray(data.sessions) ? data.sessions.map(s => ({ ...s, agentName: agentTitle })) : [];
        return [data, ...sessions];
      }
    } else {
      // All Agents: returns each agent's single overall conversation document
      const snap = await getDocs(collection(db, CONVERSATIONS_COLLECTION));
      const firestoreDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (firestoreDocs.length > 0) {
        return firestoreDocs;
      }
    }
  } catch (err) {
    console.warn("Could not fetch conversations from Firestore:", err);
  }

  return localLogs.slice(0, maxLimit);
}

/**
 * Clear conversation logs for a specific agent
 */
export async function clearAgentConversations(agentId) {
  const agentTitle = getCleanTitleId(agentId);
  try {
    if (agentTitle && agentTitle !== 'all') {
      localStorage.removeItem(`echo_logs_${agentTitle}`);
      await deleteDoc(doc(db, CONVERSATIONS_COLLECTION, agentTitle)).catch(() => {});
    } else {
      localStorage.removeItem('echo_logs_all');
    }
  } catch (e) {}
}

/**
 * 15-Day Storage Lifecycle Management
 * Once the AI model/agent is downloaded, temporary cloud storage is preserved
 * for 15 days, after which it is automatically purged to optimize resources and privacy.
 */
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;

export async function recordAgentDownload(agentId, currentAgent) {
  const now = Date.now();
  const expiresAt = now + FIFTEEN_DAYS_MS;
  const updateData = {
    downloadedAt: now,
    storageExpiresAt: expiresAt,
    storageStatus: 'active',
    downloadCount: (currentAgent?.downloadCount || 0) + 1,
    lastDownloadedDate: new Date(now).toISOString()
  };

  try {
    const docRef = doc(db, AGENTS_COLLECTION, agentId);
    await updateDoc(docRef, updateData);
  } catch (err) {
    console.warn("Could not record download to Firestore, saving locally:", err);
  }

  // Save to local storage registry as well
  try {
    const key = `storage_lifecycle_${agentId}`;
    localStorage.setItem(key, JSON.stringify({ ...updateData, agentId }));
  } catch (e) {}

  return updateData;
}

/**
 * Check and purge any model storage records older than 15 days
 */
export async function checkAndPurgeExpiredAgentStorage() {
  const now = Date.now();
  let purgedCount = 0;

  try {
    const q = query(
      collection(db, AGENTS_COLLECTION),
      where('storageStatus', '==', 'active')
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      const data = d.data();
      if (data.storageExpiresAt && data.storageExpiresAt < now) {
        // Expired after 15 days -> Purge storage snapshot
        await updateDoc(d.ref, {
          storageStatus: 'purged',
          purgedAt: now,
          cloudSnapshotUrl: null
        });
        purgedCount++;
        try {
          localStorage.removeItem(`storage_lifecycle_${d.id}`);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn("Auto-purge check error:", err);
  }

  return purgedCount;
}

/**
 * Helper to compute storage lifecycle information for an agent
 */
export function getAgentStorageInfo(agent) {
  if (!agent?.downloadedAt || !agent?.storageExpiresAt) {
    return {
      hasDownloaded: false,
      status: 'ready',
      daysRemaining: 15,
      label: '15-Day Storage Retention (Active after download)'
    };
  }

  const now = Date.now();
  const diffMs = agent.storageExpiresAt - now;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

  if (diffMs <= 0 || agent.storageStatus === 'purged') {
    return {
      hasDownloaded: true,
      status: 'purged',
      daysRemaining: 0,
      label: 'Cloud Storage Purged (Expired after 15 days)'
    };
  }

  return {
    hasDownloaded: true,
    status: 'active',
    daysRemaining,
    label: `Cloud Storage Active (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining until auto-purge)`
  };
}

// =====================================================================
// CENTRAL DEVELOPER GOOGLE DRIVE CONFIGURATION (SHARED ACROSS ALL USERS)
// =====================================================================
const SETTINGS_COLLECTION = 'settings';
const DEVELOPER_DRIVE_DOC = 'developer_drive';

/**
 * Save Central Developer Google Drive credentials/configuration to Firestore
 * so that any user uploading files in the workspace stores them in the developer's Drive.
 */
export async function saveDeveloperDriveConfig(config) {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    const payload = sanitizeForFirestore({
      ...config,
      updatedAt: serverTimestamp()
    });
    await setDoc(docRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn("Could not save developer drive config to Firestore:", err);
    return false;
  }
}

/**
 * Fetch Central Developer Google Drive credentials/configuration from Firestore
 */
export async function getDeveloperDriveConfig() {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("Could not fetch developer drive config from Firestore:", err);
    return null;
  }
}

/**
 * Subscribe in real-time to Central Developer Google Drive configuration
 */
export function subscribeToDeveloperDriveConfig(callback) {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    return onSnapshot(docRef, (snap) => {
      callback(snap.exists() ? snap.data() : null);
    }, (err) => {
      console.warn("Developer drive subscription error:", err);
    });
  } catch (err) {
    console.warn("Failed to subscribe to developer drive config:", err);
    return () => {};
  }
}

/**
 * Disconnect/clear Central Developer Google Drive configuration from Firestore
 */
export async function clearDeveloperDriveConfig() {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, DEVELOPER_DRIVE_DOC);
    await deleteDoc(docRef).catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

export { app, db, auth, firebaseConfig };
