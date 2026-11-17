/**
 * Strict 100% Bring-Your-Own-Key (BYOK) AI Completion Service
 * Zero developer keys baked in. Reads strictly from user state / localStorage.
 */
import { detectTextLanguage } from '../utils/voiceConsistency.js';

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
  const kbContext = kbList && kbList.length > 0
    ? `\n\nVerified Knowledge Base Facts:\n${JSON.stringify(kbList)}`
    : '';

  const dbRecords = options?.databaseRecords || userMessage?.databaseRecords || [];
  const dbContext = (Array.isArray(dbRecords) && dbRecords.length > 0)
    ? `\n\nVerified Live Database Records & Product Catalog:\n${JSON.stringify(dbRecords.slice(0, 50))}`
    : '';

  const userKeys = getUserApiKeys();
  const effectiveGroqKey = (apiKey && apiKey.startsWith('gsk_')) ? apiKey : userKeys.groqKey;
  const effectiveGeminiKey = (apiKey && (apiKey.startsWith('AIza') || !apiKey.startsWith('gsk_'))) ? apiKey : userKeys.geminiKey;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const baseIdentity = promptContext;
  const isCustomerMode = options?.mode === 'customer' || options?.isLiveWidget;
  const platformKnowledgeBlock = isCustomerMode ? '' : `
PLATFORM & INTEGRATION KNOWLEDGE (EXACT FACTS):
- Free Groq API Key (<200ms latency): Obtained for free from https://console.groq.com/keys by clicking "Create API Key". Format starts with 'gsk_'.
- Free Google Gemini API Key: Obtained for free from Google AI Studio at https://aistudio.google.com/app/apikey.
- Adding Keys: Users enter and save their personal key by clicking the Settings (gear icon) in the left sidebar or the API Keys tab. Keys are stored 100% locally in the browser (BYOK).
- Embedding on Website: Simply add this single script line right before the closing </body> tag:
  <script src="${currentOrigin}/widget.js" data-agent-id="${agentDisplayName}" data-api-key="YOUR_GROQ_KEY"></script>
- Multilingual Support: The agent supports English, Hindi (हिंदी), and Marathi (मराठी) with auto-detection for voice recognition and spoken responses.
`;

  const systemInstructions = `${baseIdentity}${kbContext}${dbContext}

CORE MISSION & ASSIGNMENT:
You are "${agentDisplayName}", the dedicated omni-channel AI Customer Support & Help Desk Agent. Your primary mission is to assist customers and website visitors with empathy, exceptional politeness, clarity, speed, and accuracy through BOTH real-time spoken voice and interactive chat. You answer questions about products, services, pricing, technical issues, and general company policies, guiding customers every step of the way.

POLITE MANNERS & ETIQUETTE:
You are exceptionally polite, respectful, warm, and well-mannered at all times. Use courteous phrasing (e.g. "Namaskar", "Hello, I would be delighted to assist", "Please feel free to ask", "Certainly"). Treat every visitor with patience and kindness.

EVERYDAY KNOWLEDGE & GENERAL INTELLIGENCE:
You possess broad everyday common knowledge, general facts, time/date awareness, and everyday conversational intelligence. When customers engage in small talk, greetings, general inquiries, or everyday conversation, answer them warmly, intelligently, and politely. Never refuse casual conversation or claim you can only discuss business FAQs.

MANDATORY TURN-LEVEL CODE-SWITCHING RULE (CRITICAL):
You MUST independently evaluate the language of the LATEST user message on EVERY turn, regardless of what language was used in previous conversation history turns.
- Mid-Conversation Language Switching: If the customer starts a conversation in English and switches to Marathi mid-conversation (in Devanagari script or Romanized/Marathish like 'kasa ahes', 'mala sanga', 'ahe', 'kay ahe', 'kuthe ahe'), you MUST IMMEDIATELY switch your response to polite, natural Marathi (मराठी).
- If the customer switches to Hindi (Devanagari or Hinglish like 'kaise ho', 'kya hai', 'bataiye'), you MUST reply in polite, natural Hindi (हिंदी).
- If the customer switches back to English, reply in natural English.
- NEVER remain stuck in the previous turn's language when the customer has switched languages!
${platformKnowledgeBlock}
CRITICAL OPERATIONAL & FORMATTING RULES:
1. Pure Spoken & Chat Text: Always output neat, direct conversational paragraphs or structured numbered steps.
2. NEVER Output JSON Or Config Schemas: You are in DIRECT CHAT / VOICE MODE. You MUST NEVER output JSON configurations, code schemas, or objects like {"agent_config": ...}.
3. Dual-Channel Excellence: Keep answers crisp, polite, and helpful so they sound natural when spoken aloud and look neat and readable in chat.
4. STRICT CUSTOMER-ONLY INTERACTIONS: You are talking directly to customers, shoppers, and site visitors—NOT developers or database engineers. Only answer customer questions (products, pricing, availability, store services, ordering). NEVER answer technical database queries, schema questions, SQL statements, table architectures, or developer backend logic. If asked about database internals or queries, politely decline and offer to help with store products and services.`;

  // 1. Try Groq with User-Provided Key (Ultra-Fast < 200ms with llama-3.1-8b-instant)
  if (effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    try {
      const groqModel = options?.model || 'llama-3.1-8b-instant';
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveGroqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            {
              role: 'system',
              content: systemInstructions
            },
            {
              role: 'user',
              content: cleanMessage
            }
          ],
          max_tokens: 300,
          temperature: 0.4
        })
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return sanitizeSpokenResponse(data.choices[0].message.content, cleanMessage, { ...options, agentName: agentDisplayName });
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
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemInstructions }]
          },
          contents: [{
            parts: [{
              text: cleanMessage
            }]
          }],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.5
          }
        })
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          return sanitizeSpokenResponse(data.candidates[0].content.parts[0].text, cleanMessage, { ...options, agentName: agentDisplayName });
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
            { role: 'user', content: cleanMessage }
          ],
          max_tokens: 800,
          temperature: 0.5
        })
      });

      if (openAiRes.ok) {
        const data = await openAiRes.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return sanitizeSpokenResponse(data.choices[0].message.content, cleanMessage, { ...options, agentName: agentDisplayName });
        }
      }
    } catch (err) {
      console.warn("OpenAI request failed:", err);
    }
  }

  // 3. Fallback to Local Knowledge Base Matching (100% Keyless Offline Rule-Based Engine)
  const lower = cleanMessage.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);

  // English conversational queries & greetings
  if (/^(hi|hello|hey|howdy|greetings|good\s+(morning|afternoon|evening))\b/i.test(lower)) {
    return "Hello! I am your AI assistant. How can I help you today?";
  }
  if (/\b(how are you|how is it going|how are you doing)\b/i.test(lower)) {
    return "I'm doing great, thank you for asking! How can I assist you today?";
  }
  if (/\b(who are you|what is your name|introduce yourself)\b/i.test(lower)) {
    return "I am your AI voice assistant, here to answer your questions and guide you. What would you like to know?";
  }
  if (/\b(what can you do|how can you help|help me)\b/i.test(lower)) {
    return "I can answer questions about our services, products, and policies, as well as have general everyday conversations. What's on your mind?";
  }
  if (/\b(thank you|thanks|appreciate it)\b/i.test(lower)) {
    return "You're very welcome! Let me know if there's anything else I can help with.";
  }
  if (/\b(bye|goodbye|see you|have a nice day)\b/i.test(lower)) {
    return "Goodbye! Have a wonderful day ahead!";
  }

  // Marathi conversational queries
  if (/(नमस्कार|कसे आहात|काय चाललंय|हाय|हॅलो|शुभ सकाळ|शुभ संध्याकाळ)/i.test(cleanMessage) || /\b(kasa ahes|kase ahat|namaskar)\b/i.test(lower)) {
    return "नमस्कार! मी आपला व्हॉइस असिस्टंट आहे. मी आपल्याला कशी मदत करू शकतो?";
  }
  if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)/i.test(cleanMessage) || /\b(tumhi kon ahat)\b/i.test(lower)) {
    return "मी आपला अधिकृत एआय व्हॉइस असिस्टंट आहे. मी आपल्या सर्व प्रश्नांची उत्तरे देण्यासाठी उपलब्ध आहे.";
  }
  if (/(तुम्ही काय करू शकता|मदत करा|सेवा|वैशिष्ट्ये)/i.test(cleanMessage) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
    return "मी आपल्या सेवांची माहिती देऊ शकतो आणि आपल्या सर्व शंकांचे निरसन करू शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
  }
  if (/(धन्यवाद|आभार|खूप छान)/i.test(cleanMessage) || /\b(dhanyavad|dhanyavaad|aabhar)\b/i.test(lower)) {
    return "आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?";
  }
  if (/(अलविदा|बाय|पुन्हा भेटू|काळजी घ्या)/i.test(cleanMessage)) {
    return "धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.";
  }

  // Hindi conversational queries
  if (/(नमस्ते|प्रणाम|हेलो|हाय|कैसे हो|क्या हाल है|शुभ प्रभात)/i.test(cleanMessage) || /\b(namaste|kaise ho|kya haal)\b/i.test(lower)) {
    return "नमस्ते! मैं आपका एआई वॉइस असिस्टेंट हूँ। मैं आज आपकी क्या सहायता कर सकता हूँ?";
  }
  if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)/i.test(cleanMessage) || /\b(aap kaun hain)\b/i.test(lower)) {
    return "मैं आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड हूँ। मैं आपकी सभी पूछताछ में मदद कर सकता हूँ।";
  }
  if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं|सेवाएं)/i.test(cleanMessage) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
    return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
  }
  if (/(धन्यवाद|शुक्रिया|बहुत अच्छा)/i.test(cleanMessage) || /\b(dhanyawad|shukriya)\b/i.test(lower)) {
    return "आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?";
  }
  if (/(अलविदा|बाय|फिर मिलेंगे)/i.test(cleanMessage)) {
    return "धन्यवाद! आपका दिन शुभ हो, फिर मिलेंगे।";
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

  // Check live database records first if provided
  if (Array.isArray(dbRecords) && dbRecords.length > 0) {
    if (/\b(what products|list products|what do you sell|all products|available products|show products|what models|what cars|what services|offerings|catalog|all meds|list of all meds|list all meds|medicines)\b/i.test(lower)) {
      const summary = dbRecords.slice(0, 6).map(r => `${r.name}${r.price ? ` (${r.price})` : ''}`).join(', ');
      return `Our live database includes: ${summary}. You can ask me for real-time stock or details on any item!`;
    }
    const matchedRecord = dbRecords.find(r => {
      const rName = (r.name || '').toLowerCase();
      return rName && (lower.includes(rName) || rName.includes(lower));
    });
    if (matchedRecord) {
      return `${matchedRecord.name} is in our database${matchedRecord.price ? ` at ${matchedRecord.price}` : ''}.${matchedRecord.stock !== null && matchedRecord.stock !== undefined ? ` Current stock: ${matchedRecord.stock} ${matchedRecord.unit || 'units'}.` : ''}`;
    }
  }

  // Check products / offerings
  if (/\b(what products|list products|what do you sell|all products|available products|show products|what models|what cars|what services|offerings|catalog)\b/i.test(lower)) {
    const productEntry = kbList.find(k => /\b(what products|models do you offer|catalog|services do you offer)\b/i.test(k.q));
    if (productEntry && productEntry.a && !productEntry.a.includes('[')) {
      return productEntry.a;
    }
    const productTitles = kbList
      .map(k => k.q.replace(/^(?:what is|what are|tell me about)\s+/i, '').replace(/\?$/, '').trim())
      .filter(t => t.length > 2 && !/^(?:this website|main point|contact|support|hours|pricing)/i.test(t));
    if (productTitles.length > 0) {
      return `Our flagship products and offerings include: ${productTitles.slice(0, 6).join(', ')}. Which would you like to explore in detail?`;
    }
  }

  let bestMatch = null;
  let highestScore = 0;

  for (const item of kbList) {
    const qLower = (item.q || '').toLowerCase();
    const aLower = (item.a || '').toLowerCase();
    if (aLower.includes('[')) continue; // Never return bracket placeholders
    if (lower.includes(qLower) || qLower.includes(lower)) {
      return item.a;
    }
    const matchCount = words.filter(w => qLower.includes(w) || aLower.includes(w)).length;
    if (matchCount > highestScore) {
      highestScore = matchCount;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore >= 1) {
    return bestMatch.a;
  }

  const inputLang = detectTextLanguage(cleanMessage);

  // 4. If no user API key was configured and no match found
  if (!userKeys.hasKey && !apiKey) {
    if (options?.throwOnMissingKey) {
      const error = new Error('MISSING_USER_API_KEY');
      error.code = 'MISSING_USER_API_KEY';
      throw error;
    }
    if (inputLang === 'mr-IN') {
      return `आपल्या प्रश्नाबद्दल धन्यवाद! मी आपल्या सर्व सेवा आणि उत्पादनांबद्दल माहिती देण्यासाठी उपलब्ध आहे. कृपया मला आणखी तपशील सांगा.`;
    }
    if (inputLang === 'hi-IN') {
      return `आपके प्रश्न के लिए धन्यवाद! मैं हमारी सेवाओं और उत्पादों के बारे में आपकी सहायता के लिए तैयार हूँ। कृपया मुझे और विवरण बताएं।`;
    }
    return `No personal API key configured. You can ask about our indexed products, or add your personal Groq or Gemini API key in Settings to unlock real-time AI reasoning.`;
  }

  if (inputLang === 'mr-IN') {
    return `मी आपल्या प्रश्नाचे मनःपूर्वक स्वागत करतो! आपण आमच्या सेवा, उत्पादने, किंमती किंवा वेळापत्रकांबद्दल विचारू शकता. मी कशी मदत करू?`;
  }
  if (inputLang === 'hi-IN') {
    return `मैं आपके प्रश्न का स्वागत करता हूँ! आप हमारी सेवाओं, उत्पादों, कीमतों या अपॉइंटमेंट के बारे में पूछ सकते हैं। मैं आपकी क्या सहायता करूँ?`;
  }

  return `I am here to assist you with our services, catalog, live inventory, and pricing. Please let me know what details or section you would like to explore!`;
}
