/**
 * Strict 100% Bring-Your-Own-Key (BYOK) AI Completion Service
 * Zero developer keys baked in. Reads strictly from user state / localStorage.
 */
import { detectTextLanguage } from '../utils/voiceConsistency.js';
import {
  normalizeUserQuery,
  classifyIntentConcepts,
  fuzzyMatchRecord,
  scoreKbEntryFuzzy
} from '../utils/fuzzyNlu.js';
import { isValidCustomerCatalogName, isCustomerSafeFaq } from '../utils/codebaseAnalyzer.js';
import {
  analyzeCatalogQuery,
  rankGroundedContext,
  isSemanticallyRepeated,
  buildHonestUncertaintyReply
} from '../utils/dataAnalyticsEngine.js';
import { resolveFrontendDataQuery } from '../utils/frontendIntelligenceExtractor.js';
import {
  resolveProjectArchitectureQuery,
  splitMultiStepQuestion,
  verifyAndPolishAnswer
} from '../utils/projectArchitectureAnalyzer.js';

export const STORAGE_KEYS = {
  GROQ: 'echo_user_groq_key',
  GEMINI: 'echo_user_gemini_key',
  PROVIDER: 'echo_preferred_provider',
  STORAGE_MODE: 'echo_key_storage_mode',
  LEGACY_GROQ: 'user_groq_api_key',
  LEGACY_GEMINI: 'user_gemini_api_key'
};

/**
 * Retrieve user's configured API keys from localStorage
 * NEVER returns hardcoded developer keys.
 */
export function getUserApiKeys() {
  if (typeof window === 'undefined') {
    return {
      groqKey: '',
      geminiKey: '',
      preferredProvider: 'groq',
      hasGroq: false,
      hasGemini: false,
      hasKey: false,
      activeKey: '',
      activeProvider: 'none',
      storageMode: 'local'
    };
  }

  try {
    // Auto-migrate: Purge any unverified legacy test keys from earlier alpha development
    if (localStorage.getItem('echo_byok_version') !== '2.0') {
      localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
      localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
      localStorage.setItem('echo_byok_version', '2.0');
    }

    const rawGroq = localStorage.getItem(STORAGE_KEYS.GROQ) || localStorage.getItem(STORAGE_KEYS.LEGACY_GROQ) || '';
    const rawGemini = localStorage.getItem(STORAGE_KEYS.GEMINI) || localStorage.getItem(STORAGE_KEYS.LEGACY_GEMINI) || '';
    
    const groqKey = rawGroq.trim();
    const geminiKey = rawGemini.trim();

    const preferredProvider = localStorage.getItem(STORAGE_KEYS.PROVIDER) || (groqKey ? 'groq' : geminiKey ? 'gemini' : 'groq');
    const storageMode = localStorage.getItem(STORAGE_KEYS.STORAGE_MODE) || 'local';

    const hasGroq = Boolean(groqKey && groqKey.startsWith('gsk_'));
    const hasGemini = Boolean(geminiKey && geminiKey.length > 15);
    const hasKey = hasGroq || hasGemini;

    let activeKey = '';
    let activeProvider = 'none';

    if (preferredProvider === 'gemini' && hasGemini) {
      activeKey = geminiKey;
      activeProvider = 'gemini';
    } else if (hasGroq) {
      activeKey = groqKey;
      activeProvider = 'groq';
    } else if (hasGemini) {
      activeKey = geminiKey;
      activeProvider = 'gemini';
    }

    return {
      groqKey,
      geminiKey,
      preferredProvider,
      storageMode,
      hasGroq,
      hasGemini,
      hasKey,
      activeKey,
      activeProvider
    };
  } catch (e) {
    return {
      groqKey: '',
      geminiKey: '',
      preferredProvider: 'groq',
      hasGroq: false,
      hasGemini: false,
      hasKey: false,
      activeKey: '',
      activeProvider: 'none',
      storageMode: 'local'
    };
  }
}

/**
 * Check if the user has provided at least one validly formatted API key
 */
export function hasValidUserApiKey() {
  const { hasKey } = getUserApiKeys();
  return hasKey;
}

/**
 * Save user API keys into localStorage
 */
export function saveUserApiKeys({ groqKey, geminiKey, preferredProvider, storageMode }) {
  if (typeof window === 'undefined') return;
  try {
    if (groqKey !== undefined) {
      const cleanGroq = (groqKey || '').trim();
      if (cleanGroq) {
        localStorage.setItem(STORAGE_KEYS.GROQ, cleanGroq);
        localStorage.setItem(STORAGE_KEYS.LEGACY_GROQ, cleanGroq);
      } else {
        localStorage.removeItem(STORAGE_KEYS.GROQ);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
      }
    }

    if (geminiKey !== undefined) {
      const cleanGemini = (geminiKey || '').trim();
      if (cleanGemini) {
        localStorage.setItem(STORAGE_KEYS.GEMINI, cleanGemini);
        localStorage.setItem(STORAGE_KEYS.LEGACY_GEMINI, cleanGemini);
      } else {
        localStorage.removeItem(STORAGE_KEYS.GEMINI);
        localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
      }
    }

    if (preferredProvider) {
      localStorage.setItem(STORAGE_KEYS.PROVIDER, preferredProvider);
    }

    if (storageMode) {
      localStorage.setItem(STORAGE_KEYS.STORAGE_MODE, storageMode);
    }
  } catch (e) {
    console.warn('Failed to save API keys to localStorage:', e);
  }
}

/**
 * Clear all user keys from localStorage
 */
export function clearUserApiKeys() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.GROQ);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_GROQ);
    localStorage.removeItem(STORAGE_KEYS.GEMINI);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_GEMINI);
    localStorage.removeItem(STORAGE_KEYS.PROVIDER);
  } catch (e) {}
}

/**
 * Live test validation of user's personal API key against upstream API
 * @param {'groq' | 'gemini'} provider
 * @param {string} apiKey
 * @returns {Promise<{ valid: boolean, error?: string, models?: string[] }>}
 */
export async function validateUserApiKey(provider, apiKey) {
  const cleanKey = (apiKey || '').trim();

  if (!cleanKey) {
    return { valid: false, error: 'API key cannot be empty.' };
  }

  if (provider === 'groq') {
    if (!cleanKey.startsWith('gsk_')) {
      return {
        valid: false,
        error: 'Invalid Groq API key format. Groq Cloud keys always begin with "gsk_"'
      };
    }

    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map(m => m.id).slice(0, 10);
        return { valid: true, models };
      }

      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Groq validation failed (HTTP ${res.status})`;
      return { valid: false, error: msg };
    } catch (err) {
      return {
        valid: false,
        error: err.name === 'TimeoutError'
          ? 'Validation timed out. Please check your internet connection.'
          : (err.message || 'Network error verifying Groq key.')
      };
    }
  }

  if (provider === 'gemini') {
    if (!cleanKey.startsWith('AIza') && cleanKey.length < 20) {
      return {
        valid: false,
        error: 'Invalid Gemini API key format. Google AI Studio keys typically begin with "AIza"'
      };
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map(m => m.name).slice(0, 10);
        return { valid: true, models };
      }

      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || `Gemini validation failed (HTTP ${res.status})`;
      return { valid: false, error: msg };
    } catch (err) {
      return {
        valid: false,
        error: err.name === 'TimeoutError'
          ? 'Validation timed out. Please check your internet connection.'
          : (err.message || 'Network error verifying Gemini key.')
      };
    }
  }

  return { valid: false, error: `Unknown provider: ${provider}` };
}

// Backward compatibility accessor (strictly returns user key, never developer key)
export const AI_KEYS = {
  get GROQ_API_KEY() {
    return getUserApiKeys().groqKey || '';
  },
  set GROQ_API_KEY(val) {
    saveUserApiKeys({ groqKey: val });
  },
  get GEMINI_API_KEY() {
    return getUserApiKeys().geminiKey || '';
  },
  set GEMINI_API_KEY(val) {
    saveUserApiKeys({ geminiKey: val });
  }
};

/**
 * Transcribes audio blob using Groq Whisper API (whisper-large-v3-turbo)
 * Supports acoustic automatic language identification (LID) for Marathi, Hindi, English, etc.
 * @param {Blob} audioBlob - Audio recording blob (webm or mp4 or wav)
 * @param {string} customApiKey - Optional custom Groq API key
 * @param {Object} options - { language: 'auto'|'hi'|'mr'|'en', verbose: boolean }
 * @returns {Promise<string|Object>} Transcribed text or { text, language }
 */
export async function transcribeAudioWithGroqWhisper(audioBlob, customApiKey = '', options = {}) {
  if (!audioBlob || !(audioBlob instanceof Blob)) return options?.verbose ? { text: '', language: '' } : '';
  const userKeys = getUserApiKeys();
  const groqKey = (customApiKey && customApiKey.startsWith('gsk_')) ? customApiKey : userKeys.groqKey;
  if (!groqKey || !groqKey.startsWith('gsk_')) {
    return options?.verbose ? { text: '', language: '' } : '';
  }

  try {
    const formData = new FormData();
    const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
    formData.append('file', audioBlob, `audio_input.${ext}`);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('temperature', '0.0');
    formData.append('response_format', 'verbose_json');

    // Only set explicit language if specified and not 'auto'
    if (options?.language && options.language !== 'auto') {
      const langCode = options.language.startsWith('hi') ? 'hi' :
                       options.language.startsWith('mr') ? 'mr' :
                       options.language.startsWith('en') ? 'en' : options.language;
      formData.append('language', langCode);
    }
    // If language is omitted or 'auto', Whisper auto-detects language acoustically!

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      const rawText = (data.text || '').trim();
      const detectedLang = (data.language || '').toLowerCase().trim();

      // Whisper Hallucination & 3-Language (English, Hindi, Marathi) Guard
      const isAllowedLanguage = !detectedLang || ['en', 'english', 'hi', 'hindi', 'mr', 'marathi'].includes(detectedLang);
      const isHallucination = /^(thank you|thanks for watching|thank you for watching|bye|subtitles by|you|amara\.org)[\.!]?$/i.test(rawText);
      const cleanText = (isHallucination || !isAllowedLanguage) ? '' : rawText;

      if (options?.verbose) {
        return {
          text: cleanText,
          language: detectedLang,
          duration: data.duration || 0
        };
      }
      return cleanText;
    }
  } catch (err) {
    console.warn('[Whisper API] Audio transcription error:', err);
  }
  return options?.verbose ? { text: '', language: '' } : '';
}

/**
 * Cleans and sanitizes model output into natural, readable, conversational text.
 * Strips accidental JSON objects, configuration schemas, or stray formatting.
 * Preserves clean paragraphs, numbered lists, and code snippets for neat chat rendering.
 */
export function sanitizeSpokenResponse(rawText, userQuery = '', options = {}) {
  if (!rawText) return "Hello! How can I assist you today?";
  let text = String(rawText).trim();

  // If response accidentally begins with or contains JSON format like {"agent_config": ...}
  if (text.startsWith('{') || text.startsWith('[') || text.includes('"agent_config"') || text.includes('"personality"')) {
    const qLower = String(userQuery || '').toLowerCase();
    
    // If the user was asking how to get an API key
    if (/\b(?:key|api\s*key|groq|gemini|google)\b/i.test(qLower) && /\b(?:how|where|get|find|obtain|create)\b/i.test(qLower)) {
      return `To get your free API key for Groq or Google Gemini:

1. **Groq API Key (Recommended - Ultra-Fast <200ms)**:
   • Visit the Groq Console: https://console.groq.com/keys
   • Sign in with your Google or GitHub account.
   • Click **Create API Key**, give it a name, and copy your key (starts with "gsk_").

2. **Google Gemini API Key (Generous Free Tier)**:
   • Visit Google AI Studio: https://aistudio.google.com/app/apikey
   • Sign in with your Google account.
   • Click **Create API Key** and copy your key (starts with "AIza...").

3. **Save Key in Dashboard**:
   • Click the **Settings** gear icon in the left sidebar (or the API Keys tab).
   • Paste your Groq or Gemini key and click **Save Key**. All your assistants and testing sandboxes will immediately use it!`;
    }

    // If the user was asking how to embed
    if (/\b(?:embed|integrate|script tag|widget|website)\b/i.test(qLower)) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const astName = options?.agentName || 'AI Voice Agent';
      return `To embed your AI voice agent on any website:

1. **Copy the embed script**:
<script src="${origin}/widget.js" data-agent-id="${astName}" data-api-key="YOUR_GROQ_KEY"></script>

2. **Add to your website**:
Paste this single line directly before the closing </body> tag of your website HTML.

3. **API Key**:
Replace "YOUR_GROQ_KEY" with your free Groq API key (\`gsk_...\`), or if your key is already saved in the dashboard, the widget will connect automatically.

Your floating voice assistant widget will appear immediately on your site, with full support for real-time voice, text chat, and auto-language detection in English, Hindi, and Marathi!`;
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed.message) return sanitizeSpokenResponse(parsed.message, userQuery, options);
      if (parsed.response) return sanitizeSpokenResponse(parsed.response, userQuery, options);
      if (parsed.answer) return sanitizeSpokenResponse(parsed.answer, userQuery, options);
      if (parsed.description) return sanitizeSpokenResponse(parsed.description, userQuery, options);
      if (parsed.agent_config?.description) return sanitizeSpokenResponse(parsed.agent_config.description, userQuery, options);
      if (parsed.personality?.summary) return sanitizeSpokenResponse(parsed.personality.summary, userQuery, options);
    } catch (_) {
      // Partial / truncated JSON extraction
      const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/i);
      if (descMatch && descMatch[1].length > 15) return sanitizeSpokenResponse(descMatch[1], userQuery, options);
      const msgMatch = text.match(/"message"\s*:\s*"([^"]+)"/i);
      if (msgMatch && msgMatch[1].length > 15) return sanitizeSpokenResponse(msgMatch[1], userQuery, options);
    }
    return "I am configured and ready to assist you. What would you like to know or customize today?";
  }

  // Remove markdown asterisks, bolding hashes when requested for pure speech audio,
  // but preserve clean punctuation and structure
  if (options?.forSpeechAudio) {
    return text.replace(/[*#_`]/g, '').replace(/```[\s\S]*?```/g, '').trim();
  }

  // For chat presentation, preserve clean structure and strip only excessive backticks
  return text.trim();
}

/**
 * Generate intelligent conversational response using user-provided API key
 * Falls back to 100% offline rule-based knowledge engine when no key is set.
 * Supports either positional parameters or an options object.
 */
export async function generateAIResponse(userMessage, systemPrompt = '', knowledgeBase = [], customApiKey = '', options = {}) {
  let messageText = userMessage;
  let promptText = systemPrompt;
  let kbList = knowledgeBase;
  let apiKey = customApiKey;

  if (typeof userMessage === 'object' && userMessage !== null) {
    messageText = userMessage.userMessage || userMessage.message || userMessage.text || '';
    promptText = userMessage.systemPrompt || systemPrompt || '';
    kbList = userMessage.knowledgeBase || knowledgeBase || [];
    apiKey = userMessage.customApiKey || userMessage.apiKey || customApiKey || '';
  }

  const cleanMessage = String(messageText || '').trim();
  const agentDisplayName = options?.agentName || options?.assistantName || (typeof promptText === 'string' && promptText.includes('named "') ? (promptText.match(/named\s*"([^"]+)"/i) || [])[1] : '') || 'Krushna AI Voice Agent';
  const promptContext = promptText || `You are ${agentDisplayName}, the official AI Customer Support & Help Desk Agent for this business.`;
  const queryLangForPrompt = detectTextLanguage(cleanMessage, {
    whisperLang: options?.whisperLang,
    previousLang: options?.previousLang
  });
  const activeLanguageDirective = queryLangForPrompt === 'mr-IN'
    ? 'ACTIVE TURN LANGUAGE: Marathi (मराठी, Devanagari script). Reply strictly in natural, polite Marathi even though the user may include English words (like admission, form, course, fees, college, doctor, price, timing). You may keep English proper nouns/domain terms naturally inside your Marathi sentence, but NEVER switch the reply into full English!'
    : queryLangForPrompt === 'hi-IN'
      ? 'ACTIVE TURN LANGUAGE: Hindi (हिंदी, Devanagari script). Reply strictly in natural, polite Hindi even though the user may include English words (like admission, form, course, fees, college, doctor, price, timing). You may keep English proper nouns/domain terms naturally inside your Hindi sentence, but NEVER switch the reply into full English!'
      : 'ACTIVE TURN LANGUAGE: English (unless the user mixes Marathi or Hindi grammar/words into their query, in which case reply in natural Marathi or Hindi respectively).';

  const rawDbRecords = options?.databaseRecords || userMessage?.databaseRecords || [];
  const dbRecords = (Array.isArray(rawDbRecords) ? rawDbRecords : []).filter(r => {
    const n = String(r?.name || r?.title || r?.product || '');
    return isValidCustomerCatalogName(n, r);
  });

  // Query-Aware Top-K RAG Retrieval & Deterministic Pre-Computed Analytics (strictly filtered for customer-safe FAQs!)
  const safeKbList = (Array.isArray(kbList) ? kbList : []).filter(k => k && isCustomerSafeFaq(k.q, k.a));
  const ragRanked = rankGroundedContext(cleanMessage, safeKbList, [], { topKFaqs: 12 });
  const prioritizedKb = ragRanked.topKFaqs.length > 0 ? ragRanked.topKFaqs : safeKbList.slice(0, 12);
  const kbContext = prioritizedKb.length > 0
    ? `\n\nMost Relevant Verified Knowledge Base Facts:\n${prioritizedKb.map(k => `Q: ${k.q}\nA: ${k.a}`).join('\n\n')}`
    : '';

  const precomputedAnalytics = analyzeCatalogQuery(cleanMessage, dbRecords, null, queryLangForPrompt);
  const analyticsContext = precomputedAnalytics
    ? `\n\n[PRECOMPUTED_ANALYTICS — USE THESE EXACT NUMBERS]\nSTATUS: ANALYTICAL_RESULT\nTYPE: ${precomputedAnalytics.analysisType}\nEXACT_SUMMARY: ${precomputedAnalytics.summaryText}\nCOMPUTED_DATA: ${JSON.stringify(precomputedAnalytics.computedData)}`
    : '';

  const frontendIndex = options?.frontendIntelligence || options?.siteBlueprint?.frontendIndex || userMessage?.frontendIntelligence || userMessage?.siteBlueprint?.frontendIndex || null;
  const liveFrontendSnapshot = options?.liveFrontendSnapshot || userMessage?.liveFrontendSnapshot || null;
  const precomputedFrontend = resolveFrontendDataQuery(cleanMessage, liveFrontendSnapshot, frontendIndex, queryLangForPrompt);
  const frontendLines = [];
  if (precomputedFrontend && precomputedFrontend.summaryText) {
    frontendLines.push(`DIRECT_FRONTEND_MATCH (${precomputedFrontend.matchType}): ${precomputedFrontend.summaryText}`);
  }
  const combinedMetrics = [...(liveFrontendSnapshot?.metrics || []), ...(frontendIndex?.metrics || [])].slice(0, 12);
  if (combinedMetrics.length > 0) {
    frontendLines.push(`DISPLAYED_KPIS_AND_STATS: ${combinedMetrics.map(m => `${m.label}: ${m.value}${m.delta ? ` (${m.delta})` : ''}${m.pageLabel ? ` [${m.pageLabel}]` : ''}`).join('; ')}`);
  }
  const combinedCharts = [...(liveFrontendSnapshot?.charts || []), ...(frontendIndex?.charts || [])].slice(0, 4);
  if (combinedCharts.length > 0) {
    frontendLines.push(`DISPLAYED_CHARTS: ${combinedCharts.map(c => c.summary || c.title).join(' | ')}`);
  }
  const combinedTables = [...(liveFrontendSnapshot?.reportTables || []), ...(frontendIndex?.reportTables || [])].slice(0, 3);
  if (combinedTables.length > 0) {
    frontendLines.push(`REPORT_TABLES: ${combinedTables.map(t => t.summary || t.title).join(' | ')}`);
  }
  if (Array.isArray(frontendIndex?.pages) && frontendIndex.pages.length > 1) {
    frontendLines.push(`CROSS_PAGE_SUMMARIES: ${frontendIndex.pages.slice(0, 6).map(p => `${p.pageLabel} (${p.pagePath}): ${String(p.summary || '').slice(0, 120)}`).join(' || ')}`);
  }
  const frontendContext = frontendLines.length > 0
    ? `\n\n[FRONTEND_DATA_AND_CROSS_PAGE_INSIGHTS]\n${frontendLines.join('\n')}`
    : '';

  const dbContext = (Array.isArray(dbRecords) && dbRecords.length > 0)
    ? `\n\nVerified Live Database Records & Catalog (${dbRecords.length} items):\n${JSON.stringify(dbRecords.slice(0, 50))}`
    : '';

  const userKeys = getUserApiKeys();
  const effectiveGroqKey = (apiKey && apiKey.startsWith('gsk_')) ? apiKey : userKeys.groqKey;
  const effectiveGeminiKey = (apiKey && (apiKey.startsWith('AIza') || !apiKey.startsWith('gsk_'))) ? apiKey : userKeys.geminiKey;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const baseIdentity = promptContext;
  const isCustomerMode = options?.mode === 'customer' || options?.isLiveWidget;

  // Complete Project Architecture, Frontend <-> Backend Data Flows & Code Diagnostics (Studio / Project Mode Only!)
  const projectArch = options?.projectArchitecture || options?.siteBlueprint?.projectArchitecture || userMessage?.projectArchitecture || userMessage?.siteBlueprint?.projectArchitecture || null;
  const precomputedArchitecture = !isCustomerMode ? resolveProjectArchitectureQuery(cleanMessage, projectArch, { isCustomerMode }) : null;
  const archLines = [];
  if (!isCustomerMode && projectArch) {
    if (projectArch.summary) archLines.push(`PROJECT_SUMMARY: ${projectArch.summary}`);
    if (Array.isArray(projectArch.frameworks) && projectArch.frameworks.length > 0) {
      archLines.push(`TECH_STACK: ${projectArch.frameworks.join(', ')}`);
    }
    if (Array.isArray(projectArch.dependencies) && projectArch.dependencies.length > 0) {
      archLines.push(`DEPENDENCIES: ${projectArch.dependencies.slice(0, 12).join(', ')}`);
    }
    if (Array.isArray(projectArch.backendRoutes) && projectArch.backendRoutes.length > 0) {
      archLines.push(`BACKEND_ROUTES: ${projectArch.backendRoutes.slice(0, 12).map(r => `${r.method} ${r.path} (${r.file}${r.tables?.length ? ` -> ${r.tables.join(',')}` : ''})`).join('; ')}`);
    }
    if (Array.isArray(projectArch.dataFlows) && projectArch.dataFlows.length > 0) {
      archLines.push(`FRONTEND_BACKEND_DATA_FLOWS: ${projectArch.dataFlows.slice(0, 8).map(f => f.description).join(' | ')}`);
    }
    if (projectArch.diagnostics && projectArch.diagnostics.totalIssuesCount > 0) {
      const diagDetails = [
        ...(projectArch.diagnostics.missingBackendEndpoints || []).map(x => x.detail),
        ...(projectArch.diagnostics.missingEnvVars || []).map(x => x.detail),
        ...(projectArch.diagnostics.potentialIssues || []).map(x => x.detail)
      ].slice(0, 6);
      archLines.push(`CODE_DIAGNOSTICS: ${diagDetails.join(' | ')}`);
    }
    if (precomputedArchitecture?.summaryText) {
      archLines.push(`DIRECT_ARCHITECTURE_ANSWER: ${precomputedArchitecture.summaryText}`);
    }
  }
  const architectureContext = archLines.length > 0
    ? `\n\n[COMPLETE_PROJECT_ARCHITECTURE_AND_DATA_FLOW]\n${archLines.join('\n')}`
    : '';

  const verifiedFallbackSummary = precomputedArchitecture?.summaryText || precomputedFrontend?.summaryText || precomputedAnalytics?.summaryText || '';
  const platformKnowledgeBlock = isCustomerMode ? '' : `
PLATFORM & INTEGRATION KNOWLEDGE (EXACT FACTS):
- Free Groq API Key (<200ms latency): Obtained for free from https://console.groq.com/keys by clicking "Create API Key". Format starts with 'gsk_'.
- Free Google Gemini API Key: Obtained for free from Google AI Studio at https://aistudio.google.com/app/apikey.
- Adding Keys: Users enter and save their personal key by clicking the Settings (gear icon) in the left sidebar or the API Keys tab. Keys are stored 100% locally in the browser (BYOK).
- Embedding on Website: Simply add this single script line right before the closing </body> tag:
  <script src="${currentOrigin}/widget.js" data-agent-id="${agentDisplayName}" data-api-key="YOUR_GROQ_KEY"></script>
- Multilingual Support: The agent supports English, Hindi (हिंदी), and Marathi (मराठी) with auto-detection for voice recognition and spoken responses.
`;

  const systemInstructions = `${baseIdentity}${analyticsContext}${frontendContext}${architectureContext}${kbContext}${dbContext}

CORE MISSION & ASSIGNMENT:
You are "${agentDisplayName}", the dedicated omni-channel AI Customer Support & Help Desk Agent. Your primary mission is to assist customers and website visitors with empathy, exceptional politeness, clarity, speed, and factual accuracy through BOTH real-time spoken voice and interactive chat. You answer questions about products, services, pricing, comparisons, availability, dashboard summaries, statistics, charts, reports, and company policies, guiding customers every step of the way.

HONEST UNCERTAINTY, ACCURACY & ZERO-HALLUCINATION PROTOCOL (CRITICAL):
- COMPLETE PROJECT & UNIFIED REASONING: Use ALL provided context together — Verified Live Database Records, [FRONTEND_DATA_AND_CROSS_PAGE_INSIGHTS] (displayed KPIs, statistics, charts, report tables, cross-page summaries), and (when present) [COMPLETE_PROJECT_ARCHITECTURE_AND_DATA_FLOW] (frontend-backend data flows, API routes, dependencies, and code diagnostics). NEVER claim information is missing simply because it is absent from one layer when it exists in another!
- MULTI-STEP & COMPLEX QUESTIONS: If the user asks a multi-part or compound question, address EVERY part clearly, accurately, and in logical order.
- ANSWER VERIFICATION: Verify every route path, file name, metric, price, and count strictly against the injected context before responding.
- Ground every factual claim (prices, counts, KPIs, chart trends, report figures, dates, names, eligibility, policies, specs) strictly in the verified Knowledge Base Facts, Live Database Records, [FRONTEND_DATA_AND_CROSS_PAGE_INSIGHTS], [COMPLETE_PROJECT_ARCHITECTURE_AND_DATA_FLOW], and [PRECOMPUTED_ANALYTICS] provided above.
- If [PRECOMPUTED_ANALYTICS] is present, report those exact computed figures, comparisons, and filtered results accurately without altering numbers.
- HONEST UNCERTAINTY: If the user asks for a specific business fact, number, person, branch, or policy that is NOT present in your provided context, NEVER invent, guess, or fabricate an answer. Politely state that you do not have that exact detail on file right now, and offer verified related options or direct contact details if available.
- AVOID REPETITION: Review the conversation history and NEVER repeat the exact same answer from a previous turn; instead clarify, elaborate with new verified facts, or guide to a concrete next step.

POLITE MANNERS & ETIQUETTE:
You are exceptionally polite, respectful, warm, and well-mannered at all times. Use courteous phrasing (e.g. "Namaskar", "Hello, I would be delighted to assist", "Please feel free to ask", "Certainly"). Treat every visitor with patience and kindness.

EVERYDAY KNOWLEDGE & GENERAL INTELLIGENCE:
You possess broad everyday common knowledge, general facts, time/date awareness, and everyday conversational intelligence. When customers engage in small talk, greetings, general inquiries, or everyday conversation, answer them warmly, intelligently, and politely. Never refuse casual conversation or claim you can only discuss business FAQs.

MANDATORY TURN-LEVEL CODE-SWITCHING & CODE-MIXING RULE (CRITICAL):
${activeLanguageDirective}
You MUST independently evaluate the language of the LATEST user message on EVERY turn:
- Code-Mixing Preservation (VERY IMPORTANT): Users frequently include English domain words (such as "admission", "form", "course", "fees", "syllabus", "college", "doctor", "appointment", "price", "timing", "website", "order") inside Marathi or Hindi sentences (e.g., "Admission form kasa bharaycha?", "Courses chi fees kiti aahe?", "Course ki fees kitni hai?"). If ANY Marathi or Hindi words/grammar are present, you MUST reply completely in natural, polite Marathi (मराठी) or Hindi (हिंदी) in Devanagari script — NEVER switch to full English just because the user used English nouns!
- Mid-Conversation Language Switching: If the customer switches to Marathi (Devanagari or Romanized Marathish), reply immediately in Marathi (मराठी). If they switch to Hindi (Devanagari or Hinglish), reply immediately in Hindi (हिंदी). Only reply in full English when the user speaks/writes completely in English without Marathi/Hindi grammar.
${platformKnowledgeBlock}
CRITICAL OPERATIONAL & FORMATTING RULES:
1. Pure Spoken & Chat Text: Always output neat, direct conversational paragraphs or structured numbered steps.
2. NEVER Output JSON Or Config Schemas: You are in DIRECT CHAT / VOICE MODE. You MUST NEVER output JSON configurations, code schemas, or objects like {"agent_config": ...}.
3. Dual-Channel Excellence: Keep answers crisp, polite, and helpful so they sound natural when spoken aloud and look neat and readable in chat.
4. STRICT CUSTOMER-ONLY INTERACTIONS: You are talking directly to customers, shoppers, and site visitors—NOT developers or database engineers. Only answer customer questions (products, pricing, availability, store services, ordering). NEVER show unnecessary internal data, README setup notes, Apps Script toolbars, responsive/CSS specs, technical database queries, schema questions, SQL statements, or developer backend logic. Always reply politely and warmly with only what the visitor actually needs.`;

  // Multi-Turn Conversational Memory & History Formatting (for ALL agents & websites)
  const rawHistory = options?.conversationHistory || options?.history || userMessage?.conversationHistory || userMessage?.history || [];
  const validHistory = (Array.isArray(rawHistory) ? rawHistory : []).slice(-8).map(m => {
    const role = (m.role === 'agent' || m.role === 'assistant' || m.sender === 'assistant') ? 'assistant' : 'user';
    const textContent = String(m.content || m.text || '').trim();
    return { role, content: textContent };
  }).filter(m => m.content && m.content !== cleanMessage);

  // 1. Try Groq with User-Provided Key (High Intelligence default: llama-3.3-70b-versatile with automatic failover)
  if (effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    try {
      let groqModel = 'llama-3.3-70b-versatile';
      if (options?.model) {
        const m = String(options.model).toLowerCase();
        if (m.includes('70b')) groqModel = 'llama-3.3-70b-versatile';
        else if (m.includes('mixtral')) groqModel = 'mixtral-8x7b-32768';
        else if (m.startsWith('llama-') || m.startsWith('mixtral-') || m.startsWith('gemma')) groqModel = options.model;
      }
      const groqCandidates = groqModel === 'llama-3.3-70b-versatile'
        ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
        : [groqModel, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

      for (const candidateModel of Array.from(new Set(groqCandidates))) {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${effectiveGroqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: candidateModel,
            messages: [
              {
                role: 'system',
                content: systemInstructions
              },
              ...validHistory,
              {
                role: 'user',
                content: cleanMessage
              }
            ],
            max_tokens: 340,
            temperature: 0.15
          })
        });

        if (groqRes.ok) {
          const data = await groqRes.json();
          if (data.choices && data.choices[0] && data.choices[0].message) {
            const cleaned = sanitizeSpokenResponse(data.choices[0].message.content, cleanMessage, { ...options, agentName: agentDisplayName });
            return verifyAndPolishAnswer(cleaned, { verifiedFallback: verifiedFallbackSummary, isCustomerMode });
          }
        } else if (![400, 404, 429].includes(groqRes.status)) {
          break;
        }
      }
    } catch (err) {
      console.warn("Groq request failed, trying Gemini fallback:", err);
    }
  }

  // 2. Try Gemini API with User-Provided Key (system_instruction schema, gemini-2.5-flash)
  if (effectiveGeminiKey) {
    try {
      const geminiModel = options?.geminiModel || 'gemini-2.5-flash';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${effectiveGeminiKey}`;
      const geminiContents = [
        ...validHistory.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        {
          role: 'user',
          parts: [{ text: cleanMessage }]
        }
      ];

      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstructions }]
          },
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.2
          }
        })
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          const cleaned = sanitizeSpokenResponse(data.candidates[0].content.parts[0].text, cleanMessage, { ...options, agentName: agentDisplayName });
          return verifyAndPolishAnswer(cleaned, { verifiedFallback: verifiedFallbackSummary, isCustomerMode });
        }
      }
    } catch (err) {
      console.warn("Gemini request failed, falling back to local KB:", err);
    }
  }

  // 3. Try OpenAI API with User-Provided Key (sk-...)
  const effectiveOpenAiKey = (apiKey && apiKey.startsWith('sk-')) ? apiKey : '';
  if (effectiveOpenAiKey) {
    try {
      const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveOpenAiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstructions },
            ...validHistory,
            { role: 'user', content: cleanMessage }
          ],
          max_tokens: 800,
          temperature: 0.15
        })
      });

      if (openAiRes.ok) {
        const data = await openAiRes.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          const cleaned = sanitizeSpokenResponse(data.choices[0].message.content, cleanMessage, { ...options, agentName: agentDisplayName });
          return verifyAndPolishAnswer(cleaned, { verifiedFallback: verifiedFallbackSummary, isCustomerMode });
        }
      }
    } catch (err) {
      console.warn("OpenAI request failed:", err);
    }
  }

  // 3. Fallback to Universal Typo-Tolerant, Multi-Step & Project-Aware Local NLU Engine
  const rawTrimmed = cleanMessage.trim();

  // Multi-Step / Compound Question Decomposition ("Which course is cheapest? And how do I apply?", "What is total revenue and how does frontend connect to backend?")
  if (!options?._isSubClause) {
    const subClauses = splitMultiStepQuestion(rawTrimmed);
    if (subClauses.length >= 2) {
      const subAnswers = [];
      for (const clause of subClauses) {
        const ans = await generateAIResponse(clause, promptText, kbList, '', { ...options, _isSubClause: true, throwOnMissingKey: false });
        if (ans && !subAnswers.includes(ans)) subAnswers.push(ans.trim());
      }
      if (subAnswers.length >= 2) {
        return verifyAndPolishAnswer(subAnswers.join(' '), { isCustomerMode });
      }
    }
  }

  // Complete Project Architecture, Frontend <-> Backend Data Flow & Code-Level Diagnostics (Studio / Project Mode)
  if (!isCustomerMode && precomputedArchitecture && precomputedArchitecture.summaryText) {
    return verifyAndPolishAnswer(precomputedArchitecture.summaryText, { isCustomerMode });
  }

  const normalizedFull = normalizeUserQuery(rawTrimmed, dbRecords, kbList);
  const normalizedNoPunct = (normalizedFull || rawTrimmed).toLowerCase().replace(/[!?.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  const rawCleanNoPunct = rawTrimmed.replace(/[!?.,।;:]+$/g, '').replace(/\s+/g, ' ').trim();

  // Standalone English / Marathi / Hindi greetings, gratitude, and farewells ONLY (typo-tolerant, never hijacks real questions)
  if (/^(hi+|hello+|hey+|hii+|helo+|howdy|greetings|yo|sup|hola|good\s+(morning|afternoon|evening|day))(\s+(there|everyone|sir|ma'?am|mam|bot|assistant|team))?$/i.test(normalizedNoPunct)) {
    return "Hello! I am your AI assistant. How can I help you today?";
  }
  if (/^(how are you|how is it going|how are you doing|whats?\s*up)$/i.test(normalizedNoPunct)) {
    return "I'm doing great, thank you for asking! How can I assist you today?";
  }
  if (/^(thank you|thanks|thx|ty|many thanks|thanks a lot|appreciate it)$/i.test(normalizedNoPunct)) {
    return "You're very welcome! Let me know if there's anything else I can help with.";
  }
  if (/^(bye+|goodbye|see you|have a nice day|take care)$/i.test(normalizedNoPunct)) {
    return "Goodbye! Have a wonderful day ahead!";
  }
  if (/^(नमस्कार|कसे आहात|कसा आहेस|काय चाललंय|हाय|हॅलो|शुभ सकाळ|शुभ संध्याकाळ)$/i.test(rawCleanNoPunct) || /^(kasa ahes|kase ahat|namaskar)(\s+(sir|ji))?$/i.test(normalizedNoPunct)) {
    return "नमस्कार! मी आपला व्हॉइस असिस्टंट आहे. मी आपल्याला कशी मदत करू शकतो?";
  }
  if (/^(धन्यवाद|आभार|खूप छान)$/i.test(rawCleanNoPunct) || /^(dhanyavad|dhanyavaad|aabhar)$/i.test(normalizedNoPunct)) {
    return "आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?";
  }
  if (/^(अलविदा|बाय|पुन्हा भेटू|काळजी घ्या)$/i.test(rawCleanNoPunct)) {
    return "धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.";
  }
  if (/^(नमस्ते|प्रणाम|हेलो|हाय|कैसे हो|क्या हाल है|शुभ प्रभात)$/i.test(rawCleanNoPunct) || /^(namaste|kaise ho|kya haal(\s+hai)?)(\s+(sir|ji))?$/i.test(normalizedNoPunct)) {
    return "नमस्ते! मैं आपका एआई वॉइस असिस्टेंट हूँ। मैं आज आपकी क्या सहायता कर सकता हूँ?";
  }
  if (/^(धन्यवाद|शुक्रिया|बहुत अच्छा)$/i.test(rawCleanNoPunct) || /^(dhanyawad|shukriya)$/i.test(normalizedNoPunct)) {
    return "आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?";
  }
  if (/^(अलविदा|बाय|फिर मिलेंगे)$/i.test(rawCleanNoPunct)) {
    return "धन्यवाद! आपका दिन शुभ हो, फिर मिलेंगे।";
  }

  // Strip leading greeting from real questions (using typo-normalized text!)
  const strippedRaw = rawTrimmed.replace(/^(hi+|hello+|hey+|hii+|helo+|howdy|namaste|namaskar|नमस्कार|नमस्ते|हाय|हॅलो|हेलो)[,!.\s]+/i, '').trim() || rawTrimmed;
  const effectiveClean = normalizeUserQuery(strippedRaw, dbRecords, kbList) || strippedRaw;
  const lower = effectiveClean.toLowerCase();
  const intent = classifyIntentConcepts(lower);

  if (/\b(who are you|what is your name|introduce yourself)\b/i.test(lower)) {
    return "I am your AI voice assistant, here to answer your questions and guide you. What would you like to know?";
  }
  if (/\b(what can you do|how can you help|help me)\b/i.test(lower)) {
    return "I can answer questions about our services, products, and policies, as well as have general everyday conversations. What's on your mind?";
  }
  if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)/i.test(effectiveClean) || /\b(tumhi kon ahat)\b/i.test(lower)) {
    return "मी आपला अधिकृत एआय व्हॉइस असिस्टंट आहे. मी आपल्या सर्व प्रश्नांची उत्तरे देण्यासाठी उपलब्ध आहे.";
  }
  if (/(तुम्ही काय करू शकता|मदत करा|वैशिष्ट्ये)/i.test(effectiveClean) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
    return "मी आपल्या सेवांची माहिती देऊ शकतो आणि आपल्या सर्व शंकांचे निरसन करू शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
  }
  if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)/i.test(effectiveClean) || /\b(aap kaun hain)\b/i.test(lower)) {
    return "मैं आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड हूँ। मैं आपकी सभी पूछताछ में मदद कर सकता हूँ।";
  }
  if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं)/i.test(effectiveClean) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
    return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
  }

  // Platform & Embedding Capabilities FAQs
  if (/\b(embed|integrate|script tag|widget\.js|embed this ai agent|how do i embed|add to website|put on website|website using my api key|embed.*website)\b/i.test(lower)) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const cleanAgentName = agentDisplayName || 'Krushna AI Voice Agent';
    const displayKey = effectiveGroqKey ? `${effectiveGroqKey.slice(0, 8)}...` : 'YOUR_GROQ_KEY';
    return `To embed your AI voice agent on any website:

1. **Copy the embed script tag**:
<script src="${origin}/widget.js" data-agent-id="${cleanAgentName}" data-api-key="${displayKey}"></script>

2. **Paste into your website HTML**:
Place this single line directly before the closing </body> tag of your website HTML.

3. **API Key Setup**:
Replace "${displayKey}" with your personal Groq API key (\`gsk_...\`), or if your key is already saved in the dashboard Settings, the widget will connect automatically.

Your floating voice assistant widget will appear immediately on your site, with full support for real-time voice, interactive chat, and automatic language detection in English, Hindi, and Marathi!`;
  }
  if (/\b(synthesiz|walk me through|frontend.*backend|full[- ]stack|from files|attach files)\b/i.test(lower)) {
    return "To synthesize an agent from full-stack files, click the '+' paperclip icon or drag-and-drop your frontend components, backend API routes, and database schemas into the Composer. Then click 'Synthesize', and the AI will automatically create an agent tailored to your codebase!";
  }
  if (/\b(upload json|upload sql|train the ai|knowledge base|upload files|add faq|add documents)\b/i.test(lower)) {
    return "You can train your AI agent by uploading JSON, CSV, or SQL files in the Knowledge Base tab, or by adding custom Q&A pairs. The agent extracts verified facts from your files and uses them to answer visitor questions with 100% accuracy.";
  }
  if (/\b(talk to my agent|dashboard voice sandbox|test sandbox|voice tester|test modal|try voice|voice test)\b/i.test(lower)) {
    return "You can test your agent right now by clicking 'Voice Sandbox' in the dashboard! You can speak naturally in English, Hindi, or Marathi, and the agent will auto-detect your language and reply aloud in real time.";
  }
  if (/\b(?:(?:how\s+(?:do\s+i|can\s+i|to)\s+)?(?:get|find|obtain|create|generate|acquire|setup|add|enter|use)\s+.*(?:api\s*key|groq\s*key|gemini\s*key|google\s*key|key)|(?:where|how)\s+(?:do\s+i|can\s+i|to)\s+(?:get|find|obtain|create)\s+.*key|(?:groq|gemini|google)\s+(?:api\s*)?key|api\s*key\s*(?:of|for|from)\s*(?:google|groq|gemini)|key\s+(?:of|for|from)\s*(?:the\s*)?(?:google|groq|gemini)|where\s+.*key|get.*(?:groq|gemini|google).*key)\b/i.test(lower)) {
    return `To get your free API key for Groq or Google Gemini:

1. **Groq API Key (Recommended - Ultra-Fast <200ms)**:
   • Visit the Groq Console: https://console.groq.com/keys
   • Sign in with your Google or GitHub account.
   • Click **Create API Key**, give it a name, and copy your key (starts with "gsk_").

2. **Google Gemini API Key (Generous Free Tier)**:
   • Visit Google AI Studio: https://aistudio.google.com/app/apikey
   • Sign in with your Google account.
   • Click **Create API Key** and copy your key (starts with "AIza...").

3. **Save Key in Dashboard**:
   • Click the **Settings** gear icon in the left sidebar (or the API Keys tab).
   • Paste your Groq or Gemini key and click **Save Key**. All your assistants and testing sandboxes will immediately use it!`;
  }

  // Check website purpose / main point
  if (/\b(main point|subject of this website|what is this website|about this website|about the website|what does this website do|purpose of this website)\b/i.test(lower)) {
    const aboutEntry = kbList.find(k => /\b(about|subject|purpose|what is this website|main point)\b/i.test(k.q));
    if (aboutEntry && aboutEntry.a && !aboutEntry.a.includes('[')) {
      return aboutEntry.a;
    }
  }

  const combinedContextText = `${promptText} ${agentDisplayName} ${(dbRecords || []).slice(0, 6).map(r => r.name || '').join(' ')}`.toLowerCase();
  const isAcademic = /\b(admission|admissions|course|courses|program|programs|degree|diploma|syllabus|tuition|academy|school|college|university|shikshan|sanstha)\b/i.test(combinedContextText);
  const isHealthcare = /\b(pharmacy|medicine|medicines|drug|tablet|capsule|syrup|clinic|hospital|doctor|pharma)\b/i.test(combinedContextText);
  const isFood = /\b(restaurant|cafe|dining|food|dish|dishes|menu|bakery|pizza|burger|kitchen|cuisine)\b/i.test(combinedContextText);
  const isHospitality = /\b(hotel|resort|room|rooms|stay|suite|check-in|villa|hostel)\b/i.test(combinedContextText);
  const isSaas = /\b(software|saas|subscription|pricing\s*tier|pro\s*plan|enterprise\s*plan|cloud\s*platform)\b/i.test(combinedContextText);
  const isAutomotive = /\b(car|cars|vehicle|vehicles|dealership|showroom|test\s*drive|suv|sedan)\b/i.test(combinedContextText);

  // Check live database records first if provided (analytical queries, ordinal, affirmation, typo-tolerant & order-independent!)
  const inputLang = queryLangForPrompt;

  // Check Frontend Dashboard KPIs, Charts, Report Tables & Cross-Page Summaries FIRST for explicit frontend/dashboard/chart/report/summary queries
  const isExplicitFrontendQ = /\b(chart|charts|graph|graphs|trend|trending|dashboard|summarize|summary|overview|report|reports|kpi|metric|metrics|stat|stats|statistics|across\s+(?:all\s+)?pages|on\s+the\s+[a-z0-9-]+\s+page|displayed\s+here|shown\s+here)\b/i.test(lower);
  if (isExplicitFrontendQ && (liveFrontendSnapshot || frontendIndex)) {
    const feDirect = resolveFrontendDataQuery(effectiveClean, liveFrontendSnapshot, frontendIndex, inputLang) ||
                     resolveFrontendDataQuery(rawTrimmed, liveFrontendSnapshot, frontendIndex, inputLang);
    if (feDirect && feDirect.summaryText) {
      return feDirect.summaryText;
    }
  }

  if (Array.isArray(dbRecords) && dbRecords.length > 0) {
    // 0. Deterministic Data Analysis FIRST (Compare, Cheapest/Most Expensive, Budget Filter, Stock Filter, Counts/Range)
    const analytical = analyzeCatalogQuery(effectiveClean, dbRecords, {
      itemNounEn: isAcademic ? 'courses' : (isHealthcare ? 'medicines' : (isFood ? 'dishes' : (isHospitality ? 'rooms' : (isSaas ? 'plans' : (isAutomotive ? 'vehicles' : 'products'))))),
      itemNounHi: isAcademic ? 'कोर्स' : (isHealthcare ? 'दवाइयां' : 'उत्पाद'),
      itemNounMr: isAcademic ? 'अभ्यासक्रम' : (isHealthcare ? 'औषधे' : 'उत्पादने'),
      priceLabelEn: isAcademic ? 'fee' : 'price'
    }, inputLang);
    if (analytical && analytical.summaryText) {
      return analytical.summaryText;
    }

    // 1. Ordinal selection ("the first one", "2nd one", "secnd one", "last one")
    let ordRecord = null;
    if (/\b(first|1st|number\s*1|#1|first\s*one)\b/i.test(lower)) ordRecord = dbRecords[0];
    else if (/\b(second|2nd|number\s*2|#2)\b/i.test(lower)) ordRecord = dbRecords[1];
    else if (/\b(third|3rd|number\s*3|#3)\b/i.test(lower)) ordRecord = dbRecords[2];
    else if (/\b(last\s*one|the\s*last)\b/i.test(lower)) ordRecord = dbRecords[dbRecords.length - 1];
    if (ordRecord) {
      return `${ordRecord.name}${ordRecord.price ? ` (${ordRecord.price})` : ''}${ordRecord.description ? `: ${ordRecord.description}` : ''}${ordRecord.stock !== null && ordRecord.stock !== undefined ? ` — ${ordRecord.stock} ${ordRecord.unit || 'units'} available.` : '.'}`;
    }

    // 2. Affirmation / "tell me more" / "yes" continuation
    if (/^(yes|yeah|sure|ok|okay|tell\s*me\s*more|more|show\s*more|next|continue|haan|ho)$/i.test(normalizedNoPunct)) {
      const lastBotText = [...validHistory].reverse().find(m => m.role === 'assistant')?.content || '';
      const mentioned = dbRecords.find(r => r.name && lastBotText.toLowerCase().includes(r.name.toLowerCase()));
      if (mentioned) {
        return `Here is more about ${mentioned.name}: ${mentioned.description || 'Full details are available on our website'}${mentioned.price ? `. ${isAcademic ? 'Fee' : 'Price'}: ${mentioned.price}` : ''}.`;
      }
      const summary = dbRecords.slice(0, 5).map(r => `${r.name}${r.price ? ` (${r.price})` : ''}`).join(', ');
      return `Here are our available options: ${summary}. Name any one or say "the first one" for full details!`;
    }

    // 3. Specific Item Fuzzy Match FIRST (word-order independent & typo-tolerant: "fess for scince 11th", "scince 11th details", "paracetmol avilable")
    let matchedRecord = fuzzyMatchRecord(dbRecords, strippedRaw, lower);
    if (!matchedRecord && intent.hasPronounRef) {
      const recentCombined = validHistory.slice(-4).map(m => m.content).join(' ').toLowerCase();
      matchedRecord = dbRecords.find(r => r.name && recentCombined.includes(r.name.toLowerCase()));
    }
    if (matchedRecord) {
      if (isAcademic) {
        return `${matchedRecord.name} is one of our academic programs${matchedRecord.price ? ` (Fee: ${matchedRecord.price})` : ''}.${matchedRecord.description ? ` Details: ${matchedRecord.description}` : ''}`;
      }
      return `${matchedRecord.name} is in our database${matchedRecord.price ? ` at ${matchedRecord.price}` : ''}.${matchedRecord.description ? ` ${matchedRecord.description}` : ''}${matchedRecord.stock !== null && matchedRecord.stock !== undefined ? ` Available: ${matchedRecord.stock} ${matchedRecord.unit || 'units'}.` : ''}`;
    }

    // 4. General Pricing / Fee Structure Overview ("fess structre", "how much do i have to pay?", "pricing")
    if (intent.isPriceOverview) {
      const priced = dbRecords.filter(r => r.price);
      if (priced.length > 0) {
        const feeSum = priced.slice(0, 6).map(r => `${r.name}: ${r.price}`).join(', ');
        return `Here is our ${isAcademic ? 'fee structure' : 'pricing'} overview: ${feeSum}. Ask about any specific option for complete details!`;
      }
    }

    // 5. Universal Catalog / Details List ("wat cources u prvide", "courses details give me", "what do you teach here?", "what can i eat?")
    if (intent.isCatalogList) {
      const summary = dbRecords.slice(0, 6).map(r => `${r.name}${r.price ? ` (${r.price})` : ''}`).join(', ');
      if (isAcademic) {
        return `Our verified academic programs and courses include: ${summary}. Feel free to ask me for admission criteria, eligibility, or details on any course!`;
      }
      return `Our verified database includes: ${summary}. You can ask me for real-time availability, pricing, or details on any item!`;
    }
  }

  // Check Frontend Displayed KPIs, Charts, Report Tables & Cross-Page Data BEFORE falling back to KB/uncertainty
  if (liveFrontendSnapshot || frontendIndex) {
    const feFallbackHit = resolveFrontendDataQuery(effectiveClean, liveFrontendSnapshot, frontendIndex, inputLang) ||
                          resolveFrontendDataQuery(rawTrimmed, liveFrontendSnapshot, frontendIndex, inputLang);
    if (feFallbackHit && feFallbackHit.summaryText) {
      return feFallbackHit.summaryText;
    }
  }

  // Precision-Gated Fuzzy Knowledge Base Matching (prevents false-positive irrelevant FAQ & admin-doc collisions!)
  const safeKbForMatch = safeKbList.filter(item => item && item.a && !String(item.a).includes('['));
  const offlineRag = rankGroundedContext(lower, safeKbForMatch, [], { topKFaqs: 5 });
  if (offlineRag.topHit && offlineRag.topHit.answer) {
    return offlineRag.topHit.answer;
  }

  // Secondary precision-checked scoreKbEntryFuzzy check for exact typo-corrected hits
  let bestMatch = null;
  let highestScore = 0;
  for (const item of safeKbForMatch) {
    const sc = scoreKbEntryFuzzy(lower, item);
    if (sc > highestScore) {
      highestScore = sc;
      bestMatch = item;
    }
  }
  if (bestMatch && highestScore >= 24) {
    return bestMatch.a;
  }

  // Check catalog/offerings in Knowledge Base when dbRecords is empty
  if (intent.isCatalogList && kbList.length > 0) {
    const productEntry = kbList.find(k => /\b(what products|what courses|courses|models do you offer|catalog|services do you offer|programs|menu|plans|rooms)\b/i.test(k.q));
    if (productEntry && productEntry.a && !productEntry.a.includes('[')) {
      return productEntry.a;
    }
    const productTitles = kbList
      .map(k => k.q.replace(/^(?:what is|what are|tell me about)\s+/i, '').replace(/\?$/, '').trim())
      .filter(t => t.length > 2 && !/^(?:this website|main point|contact|support|hours|pricing)/i.test(t));
    if (productTitles.length > 0) {
      return `Our offerings include: ${productTitles.slice(0, 6).join(', ')}. Which would you like to explore in detail?`;
    }
  }

  // Universal Order-Independent Archetype Intents (Eligibility, Procedure, Documents/Policy — honestly qualified when not in KB)
  if (intent.isEligibility) {
    if (isAcademic) return 'While exact course-specific criteria are not published here, admissions typically require passing the qualifying board examination with the required merit marks. Ask about a specific course or contact our office to confirm!';
    if (isHealthcare) return 'Prescription medicines require a valid doctor prescription, while over-the-counter items are available directly. Please confirm with our pharmacist for specific items.';
    return 'While exact eligibility terms are not listed here, our offerings are generally open to customers directly through this website. Ask about any specific option or reach out to our team to confirm!';
  }
  if (intent.isProcedure) {
    if (isAcademic) return 'To apply, complete the online admission form on this portal and submit your required documents.';
    if (isFood) return 'You can place your order directly from our menu section or reserve a table with us online.';
    if (isHospitality) return 'Select your check-in and check-out dates in our reservation section to confirm your booking.';
    if (isSaas) return 'Choose your preferred plan on our pricing section to start your subscription or free trial right away.';
    if (isAutomotive) return 'Schedule a showroom visit or test drive using our online booking form.';
    return 'You can place an order, book, or submit your inquiry directly through our website.';
  }
  if (intent.isPolicyDocs) {
    if (isAcademic) return 'While our exact document checklist is not published here, admission documents typically include your previous marksheet, original School Leaving Certificate (LC), identity proof, and passport photographs. Please verify with our admissions desk.';
    if (isHealthcare) return 'Please keep a valid doctor prescription and patient ID ready for prescription items.';
    if (isHospitality) return 'Please carry a valid government photo ID at check-in. Exact check-in and cancellation terms are listed on our booking page.';
    return 'For exact return, shipping, and warranty policy terms, please review our policy section on the website or reach out to our team directly.';
  }

  // 4. Semantic Anti-Repetition & Honest Uncertainty Handling
  const recentAssistantReplies = validHistory.filter(m => m.role === 'assistant').map(m => m.content);
  const lastAssistantReply = recentAssistantReplies[recentAssistantReplies.length - 1] || '';

  // If user asked a concrete specific question not covered by any DB record or KB fact, communicate honest uncertainty cleanly!
  const meaningfulUnknownToks = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
  if (meaningfulUnknownToks.length >= 2 && !options?.throwOnMissingKey) {
    const honestReply = buildHonestUncertaintyReply(cleanMessage, {
      queryLang: inputLang,
      catalogItems: dbRecords,
      kbTopics: safeKbForMatch.slice(0, 3).map(k => k.q)
    });
    if (!isSemanticallyRepeated(honestReply, recentAssistantReplies)) {
      return honestReply;
    }
  }

  if (Array.isArray(dbRecords) && dbRecords.length > 0 && lastAssistantReply) {
    const topOpts = dbRecords.slice(0, 4).map(r => `${r.name}${r.price ? ` (${r.price})` : ''}`).join(', ');
    return `Here are concrete options I can help you with right away: ${topOpts}. Just name one or say "the first one"!`;
  }

  if (!userKeys.hasKey && !apiKey) {
    if (options?.throwOnMissingKey) {
      const error = new Error('MISSING_USER_API_KEY');
      error.code = 'MISSING_USER_API_KEY';
      throw error;
    }
    return buildHonestUncertaintyReply(cleanMessage, {
      queryLang: inputLang,
      catalogItems: dbRecords,
      kbTopics: safeKbForMatch.slice(0, 3).map(k => k.q)
    });
  }

  return buildHonestUncertaintyReply(cleanMessage, {
    queryLang: inputLang,
    catalogItems: dbRecords,
    kbTopics: safeKbForMatch.slice(0, 3).map(k => k.q)
  });
}
