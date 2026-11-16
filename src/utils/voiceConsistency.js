/**
 * Voice Locking & Consistency Engine
 * Prevents AI voice changes by:
 * 1. Preloading & caching system voices on page start
 * 2. Deterministically resolving each persona (Clara, Elliot, etc.) to consistent system voices
 * 3. Permanently locking the chosen voice URI in memory/sessionStorage
 */

export const VOICE_SPECS = {
  adam: {
    name: 'Adam',
    gender: 'male',
    description: 'Deep, resonant, and calm baritone with natural human cadence (Studio Quality)',
    elevenLabsId: 'pNInz6obpgDQGcFmaJgB',
    primaryVoices: [
      'Microsoft Guy Online (Natural) - English (United States)',
      'Microsoft Christopher Online (Natural) - English (United States)',
      'Microsoft Guy',
      'Microsoft Christopher',
      'Google US English Male',
      'Microsoft David',
      'Daniel',
      'Alex'
    ],
    keywords: ['guy', 'christopher', 'david', 'mark', 'daniel', 'alex', 'male', 'natural'],
    pitch: 0.90,
    rate: 0.97
  },
  rachel: {
    name: 'Rachel',
    gender: 'female',
    description: 'Warm, friendly, ultra-natural conversational tone with zero robotic monotone',
    elevenLabsId: '21m00Tcm4TlvDq8ikWAM',
    primaryVoices: [
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Jenny',
      'Microsoft Aria',
      'Google US English Female',
      'Google US English',
      'Microsoft Zira',
      'Samantha',
      'Victoria'
    ],
    keywords: ['jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female', 'natural'],
    pitch: 1.02,
    rate: 0.98
  },
  clara: {
    name: 'Clara',
    gender: 'female',
    description: 'Empathetic and clear professional female voice',
    primaryVoices: [
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Jenny',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Google US English',
      'Microsoft Zira',
      'Samantha',
      'Victoria'
    ],
    keywords: ['jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female'],
    pitch: 1.05,
    rate: 1.0
  },
  elliot: {
    name: 'Elliot',
    gender: 'male',
    primaryVoices: [
      'Microsoft Guy Online (Natural) - English (United States)',
      'Microsoft Guy',
      'Microsoft David',
      'Microsoft Mark',
      'Daniel',
      'Alex'
    ],
    keywords: ['guy', 'david', 'mark', 'daniel', 'alex', 'male'],
    pitch: 0.95,
    rate: 1.0
  },
  godfrey: {
    name: 'Godfrey',
    gender: 'male',
    primaryVoices: [
      'Microsoft George',
      'Microsoft David',
      'Google UK English Male',
      'Daniel'
    ],
    keywords: ['george', 'david', 'daniel', 'male', 'uk'],
    pitch: 0.84,
    rate: 0.96
  },
  layla: {
    name: 'Layla',
    gender: 'female',
    primaryVoices: [
      'Microsoft Sonia Online (Natural)',
      'Microsoft Sonia',
      'Microsoft Jenny',
      'Google US English',
      'Microsoft Zira',
      'Samantha'
    ],
    keywords: ['sonia', 'jenny', 'zira', 'samantha', 'female'],
    pitch: 1.14,
    rate: 1.02
  },
  emma: {
    name: 'Emma',
    gender: 'female',
    primaryVoices: [
      'Microsoft Libby Online (Natural) - English (United Kingdom)',
      'Microsoft Libby',
      'Google UK English Female',
      'Microsoft Hazel',
      'Fiona'
    ],
    keywords: ['libby', 'hazel', 'stephanie', 'female', 'uk', 'gb'],
    pitch: 1.08,
    rate: 1.0
  },
  sid: {
    name: 'Sid',
    gender: 'male',
    primaryVoices: [
      'Microsoft Guy Online (Natural)',
      'Microsoft David',
      'Google US English Male',
      'Alex'
    ],
    keywords: ['guy', 'david', 'male'],
    pitch: 1.0,
    rate: 1.04
  },
  savannah: {
    name: 'Savannah',
    gender: 'female',
    primaryVoices: [
      'Microsoft Aria Online (Natural)',
      'Microsoft Aria',
      'Google US English',
      'Samantha'
    ],
    keywords: ['aria', 'natural', 'female'],
    pitch: 1.15,
    rate: 0.98
  },
  kai: {
    name: 'Kai',
    gender: 'male',
    primaryVoices: [
      'Microsoft Guy',
      'Microsoft David',
      'Google US English'
    ],
    keywords: ['guy', 'david', 'natural', 'male'],
    pitch: 0.98,
    rate: 1.02
  },
  nico: {
    name: 'Nico',
    gender: 'male',
    primaryVoices: [
      'Microsoft Ryan Online (Natural)',
      'Microsoft David',
      'Alex'
    ],
    keywords: ['ryan', 'david', 'male'],
    pitch: 0.92,
    rate: 1.0
  },
  sagar: {
    name: 'Sagar',
    gender: 'male',
    primaryVoices: [
      'Microsoft Ravi',
      'Microsoft Heera',
      'Google UK English Male',
      'Microsoft David'
    ],
    keywords: ['ravi', 'heera', 'indian', 'male'],
    pitch: 0.95,
    rate: 1.0
  },
  aarav: {
    name: 'Aarav',
    gender: 'male',
    description: 'Polite and clear Hindi male voice with natural cadence',
    primaryVoices: [
      'Microsoft Hemant Online (Natural) - Hindi (India)',
      'Microsoft Hemant',
      'Google हिन्दी',
      'hi-in-x-hie-local',
      'hi-IN'
    ],
    keywords: ['hemant', 'hindi', 'हिन्दी', 'male', 'india'],
    pitch: 0.95,
    rate: 0.98
  },
  priya: {
    name: 'Priya',
    gender: 'female',
    description: 'Warm and courteous Hindi female voice',
    primaryVoices: [
      'Microsoft Kalpana Online (Natural) - Hindi (India)',
      'Microsoft Kalpana',
      'Google हिन्दी',
      'hi-in-x-hia-local',
      'hi-IN'
    ],
    keywords: ['kalpana', 'hindi', 'हिन्दी', 'female', 'india'],
    pitch: 1.05,
    rate: 0.98
  },
  manohar: {
    name: 'Manohar',
    gender: 'male',
    description: 'Respectful and fluent Marathi male voice',
    primaryVoices: [
      'Microsoft Manohar Online (Natural) - Marathi (India)',
      'Microsoft Manohar',
      'Google मराठी',
      'Microsoft Hemant',
      'Google हिन्दी',
      'mr-IN'
    ],
    keywords: ['manohar', 'marathi', 'मराठी', 'hemant', 'male'],
    pitch: 0.95,
    rate: 0.98
  },
  aarohi: {
    name: 'Aarohi',
    gender: 'female',
    description: 'Gentle and expressive Marathi female voice',
    primaryVoices: [
      'Microsoft Aarohi Online (Natural) - Marathi (India)',
      'Microsoft Aarohi',
      'Google मराठी',
      'Microsoft Kalpana',
      'Google हिन्दी',
      'mr-IN'
    ],
    keywords: ['aarohi', 'marathi', 'मराठी', 'kalpana', 'female'],
    pitch: 1.05,
    rate: 0.98
  }
};

let cachedVoices = [];
let voiceCacheReady = false;
const lockedVoiceMap = new Map(); // personaKey -> SpeechSynthesisVoice

export function initVoiceEngine() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  function refreshVoices() {
    cachedVoices = window.speechSynthesis.getVoices() || [];
    if (cachedVoices.length > 0) {
      voiceCacheReady = true;
    }
  }

  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

// Auto-run initialization in browser
if (typeof window !== 'undefined') {
  initVoiceEngine();
}

/**
 * Resolves and locks a single consistent voice for a given persona name
 * @param {string} personaName - e.g. 'Clara', 'Elliot', 'Layla'
 * @returns {{ voice: SpeechSynthesisVoice|null, pitch: number, rate: number }}
 */
export function resolveLockedVoice(personaName = 'Adam') {
  const personaKey = String(personaName || 'adam').toLowerCase().trim();
  const spec = VOICE_SPECS[personaKey] || VOICE_SPECS.adam || VOICE_SPECS.rachel;

  // Return already locked voice if present
  if (lockedVoiceMap.has(personaKey)) {
    return {
      voice: lockedVoiceMap.get(personaKey),
      pitch: spec.pitch,
      rate: spec.rate
    };
  }

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return { voice: null, pitch: spec.pitch, rate: spec.rate };
  }

  const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];
  if (!voices.length) {
    return { voice: null, pitch: spec.pitch, rate: spec.rate };
  }

  // 1. Check session storage for saved locked voiceURI
  try {
    const savedURI = sessionStorage.getItem(`vhd_locked_${personaKey}`);
    if (savedURI) {
      const match = voices.find(v => v.voiceURI === savedURI);
      if (match) {
        lockedVoiceMap.set(personaKey, match);
        return { voice: match, pitch: spec.pitch, rate: spec.rate };
      }
    }
  } catch (e) {}

  // 2. Check prioritized list of exact high-quality voice names
  for (const name of spec.primaryVoices) {
    const match = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (match) {
      lockedVoiceMap.set(personaKey, match);
      try {
        sessionStorage.setItem(`vhd_locked_${personaKey}`, match.voiceURI);
      } catch (e) {}
      return { voice: match, pitch: spec.pitch, rate: spec.rate };
    }
  }

  // 3. Fallback: match by gender & keywords
  const isFemale = spec.gender === 'female';
  const candidate = voices.find(v => {
    const n = v.name.toLowerCase();
    const isEnglish = v.lang.startsWith('en');
    if (!isEnglish) return false;
    const matchesKeyword = spec.keywords.some(k => n.includes(k));
    const hasFemaleTag = n.includes('female') || n.includes('zira') || n.includes('jenny') || n.includes('aria') || n.includes('samantha');
    const hasMaleTag = n.includes('male') || n.includes('david') || n.includes('guy') || n.includes('mark') || n.includes('george');
    return matchesKeyword || (isFemale ? hasFemaleTag : hasMaleTag);
  });

  if (candidate) {
    lockedVoiceMap.set(personaKey, candidate);
    try {
      sessionStorage.setItem(`vhd_locked_${personaKey}`, candidate.voiceURI);
    } catch (e) {}
    return { voice: candidate, pitch: spec.pitch, rate: spec.rate };
  }

  // 4. Fallback to any English Natural or first English voice
  const fallback = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                   voices.find(v => v.lang.startsWith('en')) ||
                   voices[0];

  if (fallback) {
    lockedVoiceMap.set(personaKey, fallback);
    try {
      sessionStorage.setItem(`vhd_locked_${personaKey}`, fallback.voiceURI);
    } catch (e) {}
    return { voice: fallback, pitch: spec.pitch, rate: spec.rate };
  }

  return { voice: null, pitch: spec.pitch, rate: spec.rate };
}

/**
 * Detect language from text content: 'mr-IN' (Marathi), 'hi-IN' (Hindi), or 'en-US' (English)
 * @param {string} text
 * @returns {'mr-IN' | 'hi-IN' | 'en-US'}
 */
export function detectTextLanguage(text) {
  if (!text || typeof text !== 'string') return 'en-US';
  const clean = text.trim();

  // 1. Devanagari script detection (\u0900 to \u097F)
  const devanagariCount = (clean.match(/[\u0900-\u097F]/g) || []).length;
  if (devanagariCount > 0) {
    // Check for distinctive Marathi vocabulary and grammatical markers
    const marathiPattern = /\b(आहे|आहेत|नाही|नाहीत|काय|कसे|कसा|कशी|करा|करावे|होय|मला|तुम्ही|आपण|नमस्कार|सांगा|पाहिजे|झाले|झाली|झाला|करतो|करते|आहात|माझे|माझं|तुझे|तुझं|कशा|कोठे|कुठे|कधी|कोण|कसं|होते|होती|होता|आमचे|तुमचे|का|नक्की|छान|मित्रा|मित्रांनो)\b/i;
    const marathiSuffixes = /(ंच्या|च्या|तील|वरून|साठी|प्रमाणे|बद्दल|कडे)\b/;

    if (marathiPattern.test(clean) || marathiSuffixes.test(clean)) {
      return 'mr-IN';
    }
    return 'hi-IN';
  }

  // 2. Romanized Hindi (Hinglish) & Romanized Marathi detection
  const lower = clean.toLowerCase();
  const marathiRoman = /\b(kasa|kase|kashi|ahes|ahe|ahet|nahi|kaay|kay|tumhi|tumi|mala|namaskar|dhanyavad|sang|sanga|pahije|zhala|jhala|zhal|karto|karte|kuth|kuthe|aapan|kasa\s+ahes|kay\s+chalalay)\b/i;
  if (marathiRoman.test(lower)) {
    return 'mr-IN';
  }

  const hindiRoman = /\b(kya|kaise|kaisa|kaisi|hai|hain|nahi|nahin|namaste|dhanyawad|dhanyavad|shukriya|mujhe|aap|hum|batao|bataiye|chahiye|karo|karna|hoga|hogi|theek|accha|achha|kaise\s+ho|kya\s+haal)\b/i;
  if (hindiRoman.test(lower)) {
    return 'hi-IN';
  }

  return 'en-US';
}

/**
 * Resolves the optimal voice for speaking a text message in English, Hindi, or Marathi
 * Automatically matches gender of the preferred persona (Adam -> Male, Rachel -> Female)
 * @param {string} personaName - 'Adam', 'Rachel', etc.
 * @param {string} text - The text to be spoken
 * @returns {{ voice: SpeechSynthesisVoice|null, pitch: number, rate: number, lang: string }}
 */
export function resolveVoiceForText(personaName = 'Adam', text = '') {
  const detectedLang = detectTextLanguage(text);
  const personaKey = String(personaName || 'adam').toLowerCase().trim();
  const isFemale = VOICE_SPECS[personaKey]?.gender === 'female' || personaKey === 'rachel' || personaKey === 'clara' || personaKey === 'layla' || personaKey === 'emma';

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return { voice: null, pitch: 1.0, rate: 1.0, lang: detectedLang };
  }

  const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];

  if (detectedLang === 'mr-IN') {
    // 1. Look for explicit Marathi voice
    const mrVoice = voices.find(v => {
      const n = v.name.toLowerCase();
      const l = (v.lang || '').toLowerCase();
      const isMr = l.startsWith('mr') || n.includes('marathi') || n.includes('मराठी') || n.includes('manohar') || n.includes('aarohi');
      if (!isMr) return false;
      return isFemale ? (n.includes('female') || n.includes('aarohi') || n.includes('heera')) : (!n.includes('female') && !n.includes('aarohi'));
    }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('mr') || v.name.toLowerCase().includes('marathi'));

    if (mrVoice) {
      return { voice: mrVoice, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'mr-IN' };
    }

    // 2. Fallback to Hindi voice for Devanagari (Hindi synthesizers speak Devanagari Marathi with high fidelity)
    const hiFallback = voices.find(v => {
      const n = v.name.toLowerCase();
      const l = (v.lang || '').toLowerCase();
      const isHi = l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी') || n.includes('hemant') || n.includes('kalpana');
      if (!isHi) return false;
      return isFemale ? (n.includes('female') || n.includes('kalpana')) : (!n.includes('female') && !n.includes('kalpana'));
    }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('hi'));

    if (hiFallback) {
      return { voice: hiFallback, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'hi-IN' };
    }
  }

  if (detectedLang === 'hi-IN') {
    const hiVoice = voices.find(v => {
      const n = v.name.toLowerCase();
      const l = (v.lang || '').toLowerCase();
      const isHi = l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी') || n.includes('hemant') || n.includes('kalpana');
      if (!isHi) return false;
      return isFemale ? (n.includes('female') || n.includes('kalpana')) : (!n.includes('female') && !n.includes('kalpana'));
    }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi'));

    if (hiVoice) {
      return { voice: hiVoice, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'hi-IN' };
    }
  }

  // English or Default persona voice
  const resolved = resolveLockedVoice(personaName);
  return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
}

/**
 * Active timers for speech heartbeat & watchdog
 */
let activeHeartbeatTimer = null;
let activeWatchdogTimer = null;

/**
 * Safely cancels any active browser speech and resets watchdog timers
 */
export function stopCurrentSpeech() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (activeHeartbeatTimer) {
    clearInterval(activeHeartbeatTimer);
    activeHeartbeatTimer = null;
  }
  if (activeWatchdogTimer) {
    clearTimeout(activeWatchdogTimer);
    activeWatchdogTimer = null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch (_) {}
  window.__echoActiveUtterance = null;
}

/**
 * Hardened Speech Synthesis execution with Chromium GC Pinning, Heartbeat & Watchdog.
 * Eliminates browser voice freezing, premature cutoff, and hung 'speaking' states.
 * 
 * @param {string} text - The text to speak aloud
 * @param {string} personaName - Preferred voice persona name (e.g. 'Clara', 'Adam')
 * @param {{ onStart?: () => void, onEnd?: () => void, onError?: (err: any) => void }} callbacks
 * @returns {SpeechSynthesisUtterance|null}
 */
export function speakTextWithWatchdog(text, personaName = 'Clara', callbacks = {}) {
  const { onStart, onEnd, onError } = callbacks;
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) {
    if (onEnd) onEnd();
    return null;
  }

  // 1. Cleanly cancel any pending or paused speech in browser queue
  stopCurrentSpeech();

  // If paused in Chrome background, force resume
  if (window.speechSynthesis.paused) {
    try { window.speechSynthesis.resume(); } catch (_) {}
  }

  const cleanText = String(text).replace(/[*#_`]/g, '').trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return null;
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const resolved = resolveVoiceForText(personaName, cleanText);
  if (resolved?.voice) {
    utterance.voice = resolved.voice;
  }
  utterance.pitch = resolved?.pitch || 1.0;
  utterance.rate = resolved?.rate || 1.0;
  utterance.lang = resolved?.lang || 'en-US';

  // CRITICAL GC PINNING: Pin utterance to window so V8 GC cannot collect it mid-speech
  window.__echoActiveUtterance = utterance;

  let hasEnded = false;
  const finish = (isError = false, errEvent = null) => {
    if (hasEnded) return;
    hasEnded = true;
    if (activeHeartbeatTimer) {
      clearInterval(activeHeartbeatTimer);
      activeHeartbeatTimer = null;
    }
    if (activeWatchdogTimer) {
      clearTimeout(activeWatchdogTimer);
      activeWatchdogTimer = null;
    }
    window.__echoActiveUtterance = null;
    if (isError) {
      if (onError) onError(errEvent);
      else if (onEnd) onEnd();
    } else {
      if (onEnd) onEnd();
    }
  };

  utterance.onstart = () => {
    if (onStart) onStart();

    // Chromium Heartbeat: Chrome pauses synthesis if utterances run > 8 seconds.
    // Calling pause() and immediately resume() keeps the engine alive without audio glitch.
    if (activeHeartbeatTimer) clearInterval(activeHeartbeatTimer);
    activeHeartbeatTimer = setInterval(() => {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 7000);
  };

  utterance.onend = () => finish(false);
  utterance.onerror = (e) => finish(true, e);

  // Safety Fallback Watchdog Timer:
  // If the browser drops the onend event, automatically release the UI state
  const estimatedDurationMs = Math.max(4000, Math.round((cleanText.length / 10) * 1000) + 3000);
  if (activeWatchdogTimer) clearTimeout(activeWatchdogTimer);
  activeWatchdogTimer = setTimeout(() => {
    if (!hasEnded) {
      console.warn('[Voice Watchdog] Speech timed out, releasing speaking state.');
      try { window.speechSynthesis.cancel(); } catch (_) {}
      finish(false);
    }
  }, estimatedDurationMs);

  try {
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (err) {
    console.warn('[SpeechSynthesis] speak error:', err);
    finish(true, err);
  }

  return utterance;
}
