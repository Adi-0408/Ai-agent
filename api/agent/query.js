import { createSign } from 'node:crypto';
import { executeCentralAIResponse } from '../../src/services/centralAiEngine.js';
import { sanitizePublicRecords } from '../../src/utils/publicDataSanitizer.js';

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID || 'ai-agent-11df2'}/databases/(default)/documents`;
const PUBLIC_AGENT_FIELDS = ['name', 'greeting', 'avatar', 'themeColor', 'accentColor', 'position', 'voice', 'navigation'];

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function decodeValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

async function firestoreAccessToken() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Server Firebase credentials are not configured');
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error('Invalid server Firebase credentials');
  const now = Math.floor(Date.now() / 1000);
  const encode = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  if (!response.ok) throw new Error('Could not authenticate with Firestore');
  return (await response.json()).access_token;
}

async function readAgent(collection, id, accessToken) {
  const response = await fetch(`${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Agent configuration lookup failed');
  const doc = await response.json();
  return { ...decodeFields(doc.fields), _documentId: doc.name?.split('/').pop() };
}

function publicConfig(agent) {
  return Object.fromEntries(PUBLIC_AGENT_FIELDS.filter(key => agent[key] !== undefined).map(key => [key, agent[key]]));
}

function safePublicSources(sources = []) {
  return sources.slice(0, 5).map(source => ({ title: String(source || '').slice(0, 120) }));
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    return res.end();
  }
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const agentId = String(req.method === 'GET' ? req.query?.agentId : req.body?.agentId || '').trim();
    if (!agentId || agentId.length > 128) return json(res, 400, { error: 'A valid widget identifier is required' });
    const token = await firestoreAccessToken();
    const [pub, priv] = await Promise.all([readAgent('public_agents', agentId, token), readAgent('private_agents', agentId, token)]);
    if (!pub || !priv || pub.isDeleted || pub.status === 'inactive') return json(res, 404, { error: 'Widget is unavailable' });
    if (!priv.tenantId || !priv.agentId || priv.agentId !== agentId || (pub.agentId && pub.agentId !== agentId)) return json(res, 403, { error: 'Agent authorization failed' });
    const allowedOrigins = Array.isArray(pub.allowedOrigins) ? pub.allowedOrigins : [];
    if (origin && allowedOrigins.length && !allowedOrigins.includes(origin)) return json(res, 403, { error: 'Widget origin is not authorized' });
    res.setHeader('Access-Control-Allow-Origin', origin && allowedOrigins.includes(origin) ? origin : '*');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'GET') return json(res, 200, { ...publicConfig(pub), widgetId: agentId });
    const userMessage = String(req.body?.message || '').trim();
    if (!userMessage || userMessage.length > 4000) return json(res, 400, { error: 'A valid message is required' });
    const databaseRecords = sanitizePublicRecords(priv.databaseRecords, priv.publicFieldAllowlist);
    const result = await executeCentralAIResponse({
      userMessage,
      sessionId: String(req.body?.conversationId || '').slice(0, 128) || `${agentId}:${Date.now()}`,
      agentConfig: { name: pub.name, role: priv.publicRole || 'Customer Support Assistant', companyName: priv.publicCompanyName || pub.name },
      tenantId: priv.tenantId,
      agentId,
      databaseRecords,
      knowledgeBase: Array.isArray(priv.publicKnowledgeBase) ? priv.publicKnowledgeBase : [],
      siteBlueprint: priv.publicSiteBlueprint || null,
      apiKey: process.env.GROQ_API_KEY || ''
    });
    return json(res, 200, {
      reply: String(result.reply || '').slice(0, 4000),
      language: result.language || 'en-US',
      conversationId: String(req.body?.conversationId || `${agentId}:${Date.now()}`).slice(0, 128),
      optionalPublicSources: safePublicSources(result.groundedSources || []),
      optionalNavigationAction: null
    });
  } catch (error) {
    console.error('[agent/query] Request failed', { message: error?.message });
    return json(res, 503, { error: 'The assistant is temporarily unavailable' });
  }
}
