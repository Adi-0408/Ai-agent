/**
 * Strict 100% Bring-Your-Own-Key (BYOK) AI Completion Service
 * Zero developer keys baked in. Reads strictly from user state / localStorage.
 */

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

      // Whisper Hallucination Guard: filters out low-audio / silence hallucinations
      const isHallucination = /^(thank you|thanks for watching|thank you for watching|bye|subtitles by|you|amara\.org)[\.!]?$/i.test(rawText);
      const cleanText = isHallucination ? '' : rawText;

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
 * Cleans and sanitizes raw model output into natural, spoken text.
 * Strips raw JSON objects, schema configs, markdown asterisks, or stray formatting.
 */
export function sanitizeSpokenResponse(rawText) {
  if (!rawText) return "Hello! How can I assist you today?";
  let text = String(rawText).trim();

  // If response accidentally begins with or contains JSON format like {"agent_config": ...}
  if (text.startsWith('{') || text.startsWith('[') || text.includes('"agent_config"') || text.includes('"personality"')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.message) return sanitizeSpokenResponse(parsed.message);
      if (parsed.response) return sanitizeSpokenResponse(parsed.response);
      if (parsed.description) return sanitizeSpokenResponse(parsed.description);
      if (parsed.agent_config?.description) return sanitizeSpokenResponse(parsed.agent_config.description);
      if (parsed.personality?.summary) return sanitizeSpokenResponse(parsed.personality.summary);
    } catch (_) {
      // Partial / truncated JSON extraction
      const descMatch = text.match(/"description"\s*:\s*"([^"]+)"/i);
      if (descMatch) return sanitizeSpokenResponse(descMatch[1]);
      const nameMatch = text.match(/"agent_name"\s*:\s*"([^"]+)"/i);
      if (nameMatch) return `I am ${nameMatch[1]}, ready to assist you. How can I help you today?`;
      const msgMatch = text.match(/"message"\s*:\s*"([^"]+)"/i);
      if (msgMatch) return sanitizeSpokenResponse(msgMatch[1]);
    }
    return "I am configured and ready to assist you. How can I help you today?";
  }

  // Remove markdown asterisks, bolding, hashes, and code blocks
  return text.replace(/[*#_`]/g, '').replace(/```[\s\S]*?```/g, '').trim();
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
  const baseIdentity = promptContext || 'You are the official AI Customer Support & Help Desk Agent for this business.';
  const systemInstructions = `${baseIdentity}${kbContext}

CORE MISSION & ASSIGNMENT:
You are the dedicated omni-channel AI Customer Support & Help Desk Agent. Your primary mission is to assist customers and website visitors with empathy, clarity, speed, and accuracy through BOTH real-time spoken voice and interactive chat. You answer questions about products, services, pricing, technical issues, and general company policies, guiding customers every step of the way.

CRITICAL OPERATIONAL RULES:
1. Dual-Channel Excellence (Voice & Chat): You serve customers seamlessly whether they speak via microphone or type in text chat. Keep answers clear, conversational, and direct (1 to 2 spoken sentences) so they sound completely natural when spoken aloud while remaining crisp and readable in chat. Never use markdown asterisks (*), hashtags (#), bullet points, or raw JSON.
2. Customer Advocate & Problem Solver: Greet visitors warmly, address customer concerns with patience, and help them find solutions. For business, pricing, or product inquiries, accurately reference the Verified Knowledge Base Facts above.
3. Everyday & Normal Questions: Warmly and helpfully answer everyday inquiries, greetings, pleasantries, small talk, and general knowledge questions. Never refuse ordinary conversation or claim you cannot answer casual pleasantries.
4. Output Format: ALWAYS output pure spoken/chat conversational text directly. NEVER output JSON objects, schema configs, or code blocks.
5. Multilingual Fluency: You are fully fluent in English, Hindi (हिंदी), and Marathi (मराठी). You MUST always detect the language of the user's message (Hindi, Marathi, or English) and reply in that EXACT SAME language. If the customer asks in Hindi, answer in polite, natural Hindi. If the customer asks in Marathi, answer in polite, natural Marathi. If the customer asks in English, answer in English.`;

  // 1. Try Groq with User-Provided Key (Ultra-Fast < 200ms)
  if (effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    try {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveGroqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
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
          max_tokens: 160,
          temperature: 0.6
        })
      });

      if (groqRes.ok) {
        const data = await groqRes.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return sanitizeSpokenResponse(data.choices[0].message.content);
        }
      }
    } catch (err) {
      console.warn("Groq request failed, trying Gemini fallback:", err);
    }
  }

  // 2. Try Gemini API with User-Provided Key
  if (effectiveGeminiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${effectiveGeminiKey}`;
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemInstructions}\n\nUser Question: ${cleanMessage}`
            }]
          }]
        })
      });

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0]) {
          return sanitizeSpokenResponse(data.candidates[0].content.parts[0].text);
        }
      }
    } catch (err) {
      console.warn("Gemini request failed, falling back to local KB:", err);
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
  if (/(नमस्कार|कसे आहात|काय चाललंय|हाय|हॅलो|शुभ सकाळ|शुभ संध्याकाळ)\b/i.test(cleanMessage) || /\b(kasa ahes|kase ahat|namaskar)\b/i.test(lower)) {
    return "नमस्कार! मी आपला व्हॉइस असिस्टंट आहे. मी आपल्याला कशी मदत करू शकतो?";
  }
  if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)\b/i.test(cleanMessage) || /\b(tumhi kon ahat)\b/i.test(lower)) {
    return "मी आपला अधिकृत एआय व्हॉइस असिस्टंट आहे. मी आपल्या सर्व प्रश्नांची उत्तरे देण्यासाठी उपलब्ध आहे.";
  }
  if (/(तुम्ही काय करू शकता|मदत करा|सेवा|वैशिष्ट्ये)\b/i.test(cleanMessage) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
    return "मी आपल्या सेवांची माहिती देऊ शकतो आणि आपल्या सर्व शंकांचे निरसन करू शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
  }
  if (/(धन्यवाद|आभार|खूप छान)\b/i.test(cleanMessage) || /\b(dhanyavad|dhanyavaad|aabhar)\b/i.test(lower)) {
    return "आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?";
  }
  if (/(अलविदा|बाय|पुन्हा भेटू|काळजी घ्या)\b/i.test(cleanMessage)) {
    return "धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.";
  }

  // Hindi conversational queries
  if (/(नमस्ते|प्रणाम|हेलो|हाय|कैसे हो|क्या हाल है|शुभ प्रभात)\b/i.test(cleanMessage) || /\b(namaste|kaise ho|kya haal)\b/i.test(lower)) {
    return "नमस्ते! मैं आपका एआई वॉइस असिस्टेंट हूँ। मैं आज आपकी क्या सहायता कर सकता हूँ?";
  }
  if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)\b/i.test(cleanMessage) || /\b(aap kaun hain)\b/i.test(lower)) {
    return "मैं आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड हूँ। मैं आपकी सभी पूछताछ में मदद कर सकता हूँ।";
  }
  if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं|सेवाएं)\b/i.test(cleanMessage) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
    return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
  }
  if (/(धन्यवाद|शुक्रिया|बहुत अच्छा)\b/i.test(cleanMessage) || /\b(dhanyawad|shukriya)\b/i.test(lower)) {
    return "आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?";
  }
  if (/(अलविदा|बाय|फिर मिलेंगे)\b/i.test(cleanMessage)) {
    return "धन्यवाद! आपका दिन शुभ हो, फिर मिलेंगे।";
  }

  // Check website purpose / main point
  if (/\b(main point|subject of this website|what is this website|about this website|about the website|what does this website do|purpose of this website)\b/i.test(lower)) {
    const aboutEntry = kbList.find(k => /\b(about|subject|purpose|what is this website|main point)\b/i.test(k.q));
    if (aboutEntry && aboutEntry.a && !aboutEntry.a.includes('[')) {
      return aboutEntry.a;
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

  // 4. If no user API key was configured and no match found
  if (!userKeys.hasKey && !apiKey) {
    if (opt.throwOnMissingKey) {
      const error = new Error('MISSING_USER_API_KEY');
      error.code = 'MISSING_USER_API_KEY';
      throw error;
    }
    return `No personal API key configured. You can ask about our indexed products, or add your personal Groq or Gemini API key in Settings to unlock real-time AI reasoning.`;
  }

  return `I understand your question about "${cleanMessage}". While I check our database, feel free to ask about our flagship products, engineering specifications, or consultation options!`;
}
