/**
 * Database Key Extractor & Live Database Integration Engine
 * Detects database credentials (Firebase, Supabase, Airtable, REST) from uploaded files (.json, .env, .js, .ts)
 * and provides live access to Firestore, Realtime Database, and PostgREST.
 */

function isCleanFaq(q, a) {
  if (!q || !a) return false;
  const qStr = String(q).trim();
  const aStr = String(a).trim();
  if (qStr.length < 3 || aStr.length < 2) return false;
  if (/(apiKey|projectId|authDomain|storageBucket|databaseURL|private_key|token|secret)/i.test(qStr + ' ' + aStr)) return false;
  return true;
}

/**
 * Converts Firestore REST API field structures to standard JavaScript objects
 * e.g. { name: { stringValue: "Dolo 650" } } -> { name: "Dolo 650" }
 */
export function parseFirestoreFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const res = {};
  for (const [key, val] of Object.entries(fields)) {
    if (!val || typeof val !== 'object') {
      res[key] = val;
      continue;
    }
    if ('stringValue' in val) res[key] = val.stringValue;
    else if ('integerValue' in val) res[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) res[key] = parseFloat(val.doubleValue);
    else if ('booleanValue' in val) res[key] = val.booleanValue;
    else if ('timestampValue' in val) res[key] = val.timestampValue;
    else if ('nullValue' in val) res[key] = null;
    else if ('arrayValue' in val) {
      res[key] = (val.arrayValue?.values || []).map(v => {
        if ('stringValue' in v) return v.stringValue;
        if ('integerValue' in v) return parseInt(v.integerValue, 10);
        if ('doubleValue' in v) return parseFloat(v.doubleValue);
        if ('booleanValue' in v) return v.booleanValue;
        if ('mapValue' in v) return parseFirestoreFields(v.mapValue.fields);
        return v;
      });
    } else if ('mapValue' in val) {
      res[key] = parseFirestoreFields(val.mapValue.fields);
    } else {
      res[key] = Object.values(val)[0];
    }
  }
  return res;
}

/**
 * Extracts database credentials and configuration from file content or filename
 */
export function extractDatabaseCredentials(fileName = '', content = '') {
  const name = String(fileName || '').toLowerCase();
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  
  // 1. Firebase Client Configuration or Service Account Key
  let isFirebase = false;
  let fbConfig = {};

  // Try JSON parse first
  try {
    const json = typeof content === 'object' && content !== null ? content : JSON.parse(text);
    if (json && typeof json === 'object') {
      // Check Firebase Web Config format
      if (json.projectId || json.project_id || (json.apiKey && json.authDomain)) {
        isFirebase = true;
        fbConfig = {
          type: 'firebase',
          projectId: json.projectId || json.project_id,
          apiKey: json.apiKey || json.api_key || '',
          authDomain: json.authDomain || json.auth_domain || (json.projectId ? `${json.projectId}.firebaseapp.com` : ''),
          databaseURL: json.databaseURL || json.database_url || (json.projectId ? `https://${json.projectId}-default-rtdb.firebaseio.com` : ''),
          storageBucket: json.storageBucket || json.storage_bucket || '',
          appId: json.appId || json.app_id || '',
          isServiceAccount: json.type === 'service_account',
          clientEmail: json.client_email || ''
        };
      }
    }
  } catch (e) {
    // Not valid JSON, check environment variables or code patterns
  }

  // Regex extraction for .env or code files (firebase.js, firebaseConfig.ts, etc.)
  if (!isFirebase) {
    const projMatch = text.match(/(?:FIREBASE_PROJECT_ID|projectId|project_id)\s*[:=]\s*["']?([a-z0-9-]+)["']?/i);
    const keyMatch = text.match(/(?:FIREBASE_API_KEY|apiKey|api_key)\s*[:=]\s*["']?(AIza[0-9A-Za-z-_]{35})["']?/i);
    const rtdbMatch = text.match(/(?:FIREBASE_DATABASE_URL|databaseURL|database_url)\s*[:=]\s*["']?(https:\/\/[a-z0-9-]+\.(?:firebaseio\.com|firebasedatabase\.app))["']?/i);

    if (projMatch || keyMatch || rtdbMatch || (name.includes('firebase') && (text.includes('projectId') || text.includes('AIza')))) {
      isFirebase = true;
      const projId = projMatch ? projMatch[1] : (rtdbMatch ? rtdbMatch[1].replace(/https:\/\/|\..*$/g, '') : '');
      fbConfig = {
        type: 'firebase',
        projectId: projId,
        apiKey: keyMatch ? keyMatch[1] : '',
        authDomain: projId ? `${projId}.firebaseapp.com` : '',
        databaseURL: rtdbMatch ? rtdbMatch[1] : (projId ? `https://${projId}-default-rtdb.firebaseio.com` : ''),
        isServiceAccount: text.includes('service_account')
      };
    }
  }

  if (isFirebase && fbConfig.projectId) {
    return {
      detected: true,
      type: 'firebase',
      providerName: 'Firebase (Firestore & Realtime DB)',
      config: fbConfig
    };
  }

  // 2. Supabase Configuration
  const supaUrlMatch = text.match(/(?:SUPABASE_URL|supabaseUrl)\s*[:=]\s*["']?(https:\/\/[a-z0-9-]+\.supabase\.co)["']?/i);
  const supaKeyMatch = text.match(/(?:SUPABASE_ANON_KEY|SUPABASE_KEY|supabaseKey|supabaseAnonKey)\s*[:=]\s*["']?(eyJ[0-9A-Za-z-_]+\.[0-9A-Za-z-_]+\.[0-9A-Za-z-_]+)["']?/i);

  if (supaUrlMatch || (name.includes('supabase') && supaKeyMatch)) {
    return {
      detected: true,
      type: 'supabase',
      providerName: 'Supabase Database',
      config: {
        type: 'supabase',
        supabaseUrl: supaUrlMatch ? supaUrlMatch[1] : '',
        supabaseKey: supaKeyMatch ? supaKeyMatch[1] : ''
      }
    };
  }

  // 3. Airtable Configuration
  const airtableKeyMatch = text.match(/(?:AIRTABLE_API_KEY|AIRTABLE_TOKEN)\s*[:=]\s*["']?((?:key|pat)[0-9A-Za-z]{14,})["']?/i);
  const airtableBaseMatch = text.match(/(?:AIRTABLE_BASE_ID|baseId)\s*[:=]\s*["']?(app[0-9A-Za-z]{14})["']?/i);
  if (airtableKeyMatch && airtableBaseMatch) {
    return {
      detected: true,
      type: 'airtable',
      providerName: 'Airtable',
      config: {
        type: 'airtable',
        apiKey: airtableKeyMatch[1],
        baseId: airtableBaseMatch[1]
      }
    };
  }

  return { detected: false, type: null, config: null };
}

/**
 * Probes and fetches live records from an external database using the detected credentials
 */
export async function fetchExternalDatabaseRecords(dbConfig) {
  if (!dbConfig || !dbConfig.type) {
    return { success: false, records: [], knowledgeBase: [] };
  }

  const databaseRecords = [];
  const knowledgeBase = [];
  let successfulSource = '';

  function addRawRecord(item) {
    if (!item || typeof item !== 'object') return;
    const rawName = String(item.name || item.product || item.title || item.item || item.label || '').trim();
    if (!rawName || rawName.length < 2 || rawName.length > 70) return;
    if (/^(what\b|tell me\b|how\b|can you\b|why\b|who\b|test\b|sample\b|untitled\b|sr\.?no\b|action\b|features?\b|services?\b|welcome\b|about\b)/i.test(rawName)) return;

    const price = item.price !== undefined ? (typeof item.price === 'number' ? `₹${item.price}` : String(item.price).trim()) : '';
    const stock = item.stock !== undefined ? Number(item.stock) : (item.quantity !== undefined ? Number(item.quantity) : (item.qty !== undefined ? Number(item.qty) : null));
    const unit = String(item.unit || item.packaging || 'units').trim();
    const category = String(item.category || item.department || item.type || '').trim();
    const dosage = String(item.dosage || item.composition || item.salt || '').trim();
    const desc = String(item.description || item.desc || item.details || '').trim();
    const rx = Boolean(item.rx || item.prescriptionRequired);

    const existing = databaseRecords.find(r => r.name.toLowerCase() === rawName.toLowerCase());
    if (!existing) {
      databaseRecords.push({
        id: item.id || `live_${databaseRecords.length + 1}`,
        name: rawName,
        price,
        stock: isNaN(stock) ? null : stock,
        unit,
        category,
        dosage,
        description: desc,
        rx
      });

      // Also create a clean FAQ entry
      const priceStr = price ? `Price: ${price}. ` : '';
      const stockStr = stock !== null && !isNaN(stock) ? `Available stock: ${stock} ${unit}. ` : '';
      const detailsStr = desc || dosage || category || '';
      const q = `What is ${rawName}?`;
      const a = `${rawName}. ${priceStr}${stockStr}${detailsStr}`.trim();
      if (isCleanFaq(q, a)) {
        knowledgeBase.push({ q, a });
      }
    }
  }

  // --- Provider 1: Firebase Firestore & Realtime DB (Parallelized via Promise.allSettled: ~0.5–2.5s max!) ---
  if (dbConfig.type === 'firebase' && dbConfig.projectId) {
    const { projectId, apiKey, databaseURL } = dbConfig;
    const probeCollections = ['products', 'inventory', 'medicines', 'items', 'catalog', 'services', 'menu', 'store', 'shop', 'pricing', 'faqs'];
    const rtdbUrl = databaseURL || `https://${projectId}-default-rtdb.firebaseio.com`;

    const firestorePromises = probeCollections.map(async (col) => {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}${apiKey ? `?key=${apiKey}` : ''}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.documents) && data.documents.length > 0) {
        return { col, documents: data.documents };
      }
      return null;
    });

    const rtdbPromise = (async () => {
      const res = await fetch(`${rtdbUrl}/.json`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const data = await res.json();
      return (data && typeof data === 'object') ? data : null;
    })();

    const [settledCols, settledRtdb] = await Promise.all([
      Promise.allSettled(firestorePromises),
      Promise.allSettled([rtdbPromise])
    ]);

    for (const outcome of settledCols) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        const { col, documents } = outcome.value;
        documents.forEach(doc => {
          const flat = parseFirestoreFields(doc.fields);
          const docId = doc.name ? doc.name.split('/').pop() : '';
          addRawRecord({ id: docId, ...flat });
        });
        if (!successfulSource) successfulSource = `Firestore Collection '${col}'`;
      }
    }

    if (settledRtdb[0]?.status === 'fulfilled' && settledRtdb[0].value) {
      const data = settledRtdb[0].value;
      const candidates = data.products || data.inventory || data.catalog || data.items || data.medicines || data.menu || data;
      if (Array.isArray(candidates)) {
        candidates.forEach(addRawRecord);
      } else if (typeof candidates === 'object') {
        Object.entries(candidates).forEach(([k, v]) => {
          if (v && typeof v === 'object') addRawRecord({ id: k, ...v });
        });
      }
      if (databaseRecords.length > 0 && !successfulSource) {
        successfulSource = 'Firebase Realtime Database';
      }
    }
  }

  // --- Provider 2: Supabase PostgREST (Parallelized via Promise.allSettled: ~0.5–2.5s max!) ---
  if (dbConfig.type === 'supabase' && dbConfig.supabaseUrl && dbConfig.supabaseKey) {
    const { supabaseUrl, supabaseKey } = dbConfig;
    const probeTables = ['products', 'inventory', 'medicines', 'items', 'catalog', 'services', 'menu', 'faqs'];

    const settledTables = await Promise.allSettled(
      probeTables.map(async (tbl) => {
        const url = `${supabaseUrl}/rest/v1/${tbl}?select=*&limit=100`;
        const res = await fetch(url, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          },
          signal: AbortSignal.timeout(2500)
        });
        if (!res.ok) return null;
        const rows = await res.json();
        return Array.isArray(rows) && rows.length > 0 ? { tbl, rows } : null;
      })
    );

    for (const outcome of settledTables) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        const { tbl, rows } = outcome.value;
        rows.forEach(addRawRecord);
        if (!successfulSource) successfulSource = `Supabase Table '${tbl}'`;
      }
    }
  }

  return {
    success: databaseRecords.length > 0,
    source: successfulSource || 'Live Database Configured',
    records: databaseRecords,
    knowledgeBase,
    count: databaseRecords.length
  };
}
