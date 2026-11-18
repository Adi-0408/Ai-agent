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
      'Microsoft AndrewMultilingual Online (Natural) - English (United States)',
      'Microsoft BrianMultilingual Online (Natural) - English (United States)',
      'Microsoft AndrewMultilingual',
      'Microsoft BrianMultilingual',
      'Microsoft Guy Online (Natural) - English (United States)',
      'Microsoft Christopher Online (Natural) - English (United States)',
      'Microsoft Guy',
      'Microsoft Christopher',
      'Google US English Male',
      'Microsoft David',
      'Daniel',
      'Alex'
    ],
    keywords: ['andrewmultilingual', 'brianmultilingual', 'guy', 'christopher', 'david', 'mark', 'daniel', 'alex', 'male', 'natural'],
    pitch: 0.90,
    rate: 0.97
  },
  rachel: {
    name: 'Rachel',
    gender: 'female',
    description: 'Warm, friendly, ultra-natural conversational tone with zero robotic monotone',
    elevenLabsId: '21m00Tcm4TlvDq8ikWAM',
    primaryVoices: [
      'Microsoft AvaMultilingual Online (Natural) - English (United States)',
      'Microsoft EmmaMultilingual Online (Natural) - English (United States)',
      'Microsoft AvaMultilingual',
      'Microsoft EmmaMultilingual',
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
    keywords: ['avamultilingual', 'emmamultilingual', 'jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female', 'natural'],
    pitch: 1.02,
    rate: 0.98
  },
  clara: {
    name: 'Clara',
    gender: 'female',
    description: 'Empathetic and clear professional female voice',
    primaryVoices: [
      'Microsoft EmmaMultilingual Online (Natural) - English (United States)',
      'Microsoft AvaMultilingual Online (Natural) - English (United States)',
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Jenny',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Google US English',
      'Microsoft Zira',
      'Samantha',
      'Victoria'
    ],
    keywords: ['emmamultilingual', 'avamultilingual', 'jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female'],
    pitch: 1.05,
    rate: 1.0
  },
  elliot: {
    name: 'Elliot',
    gender: 'male',
    primaryVoices: [
      'Microsoft BrianMultilingual Online (Natural) - English (United States)',
      'Microsoft AndrewMultilingual Online (Natural) - English (United States)',
      'Microsoft Guy Online (Natural) - English (United States)',
      'Microsoft Guy',
      'Microsoft David',
      'Microsoft Mark',
      'Daniel',
      'Alex'
    ],
    keywords: ['brianmultilingual', 'andrewmultilingual', 'guy', 'david', 'mark', 'daniel', 'alex', 'male'],
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

const MULTILINGUAL_MALE_VOICES = [
  'microsoft andrewmultilingual online (natural)',
  'microsoft brianmultilingual online (natural)',
  'microsoft andrewmultilingual',
  'microsoft brianmultilingual',
  'microsoft remymultilingual',
  'microsoft florianmultilingual',
  'microsoft giuseppemultilingual'
];

const MULTILINGUAL_FEMALE_VOICES = [
  'microsoft avamultilingual online (natural)',
  'microsoft emmamultilingual online (natural)',
  'microsoft avamultilingual',
  'microsoft emmamultilingual',
  'microsoft viviennemultilingual',
  'microsoft seraphinamultilingual'
];

const KNOWN_FEMALE_INDIC_TOKENS = [
  'aarohi', 'swara', 'kalpana', 'heera', 'neerja', 'ananya', 'kavya', 'priya',
  'female', 'woman', 'google हिन्दी', 'mr-in-x-mra', 'hi-in-x-hia'
];

const KNOWN_MALE_MARATHI_PRIORITY = [
  'microsoft manohar online (natural)',
  'microsoft manohar',
  'manohar',
  'mr-in-x-mrb',
  'google marathi male'
];

const KNOWN_MALE_HINDI_PRIORITY = [
  'microsoft madhur online (natural)',
  'microsoft madhur',
  'madhur',
  'microsoft hemant online (natural)',
  'microsoft hemant',
  'hemant',
  'hi-in-x-hie',
  'hi-in-x-hid',
  'google hindi male'
];

const KNOWN_FEMALE_MARATHI_PRIORITY = [
  'microsoft aarohi online (natural)',
  'microsoft aarohi',
  'aarohi',
  'mr-in-x-mra',
  'google marathi'
];

const KNOWN_FEMALE_HINDI_PRIORITY = [
  'microsoft swara online (natural)',
  'microsoft swara',
  'swara',
  'microsoft kalpana online (natural)',
  'microsoft kalpana',
  'kalpana',
  'google हिन्दी',
  'hi-in-x-hia'
];

const lockedLangVoiceMap = new Map(); // `${personaKey}__${lang}` -> { voice, pitch, rate, lang }
let loggedBaritoneFallbackNotice = false;

function normalizeLanguageHint(hint) {
  if (!hint) return '';
  const h = String(hint).toLowerCase().trim();
  if (h === 'mr' || h === 'mr-in' || h.includes('marathi') || h.includes('मराठी')) return 'mr-IN';
  if (h === 'hi' || h === 'hi-in' || h.includes('hindi') || h.includes('हिंदी') || h.includes('हिन्दी')) return 'hi-IN';
  if (h === 'en' || h === 'en-us' || h === 'en-in' || h.includes('english')) return 'en-US';
  return '';
}

const MR_DEVANAGARI_WORDS = new Set([
  'आहे', 'आहेत', 'नाही', 'नाहीत', 'काय', 'कसे', 'कसा', 'कशी', 'करा', 'करावे',
  'होय', 'मला', 'तुम्ही', 'आपण', 'आपले', 'आपली', 'आपल्या', 'नमस्कार', 'सांगा',
  'सांगू', 'पाहिजे', 'झाले', 'झाली', 'झाला', 'करतो', 'करते', 'आहात', 'माझे',
  'माझं', 'माझी', 'तुझे', 'तुझं', 'तुझी', 'कुठे', 'कधी', 'कोण', 'कोणते', 'कोणता',
  'कोणती', 'कसं', 'आमचे', 'आमची', 'आमचा', 'तुमचे', 'तुमची', 'तुमचा', 'नक्की',
  'छान', 'विचारू', 'शकता', 'शकतो', 'शकते', 'द्या', 'येथे', 'तिथे', 'बद्दल',
  'आज', 'उद्या', 'काल', 'कळवा', 'माहिती', 'प्रवेश', 'किती', 'दाखवा', 'भरा',
  'भरायचा', 'भरायचे', 'भरायची', 'करायचा', 'करायचे', 'करायची', 'मिळते', 'मिळतात',
  'मिळेल', 'हवे', 'हवा', 'हवी', 'असेल', 'असतात', 'कृपया', 'धन्यवाद', 'आभार'
]);

const HI_DEVANAGARI_WORDS = new Set([
  'है', 'हैं', 'हो', 'हूँ', 'हूं', 'था', 'थी', 'थे', 'क्या', 'कैसे', 'कैसा',
  'कैसी', 'कहाँ', 'कहा', 'कब', 'कौन', 'कौनसा', 'कौनसी', 'कितना', 'कितनी', 'कितने',
  'बताओ', 'बताइए', 'बताएं', 'बताये', 'चाहिए', 'आपकी', 'आपका', 'आपके', 'मेरा',
  'मेरी', 'मेरे', 'हमारा', 'हमारी', 'हमारे', 'मुझे', 'हमे', 'हमें', 'नहीं',
  'शुक्रिया', 'नमस्ते', 'कृपया', 'करना', 'करने', 'करनी', 'करते', 'करता', 'करती',
  'सकते', 'सकता', 'सकती', 'होगा', 'होगी', 'होंगे', 'होता', 'होती', 'होते',
  'की', 'के', 'का', 'को', 'में', 'से', 'पर', 'बारे', 'लिए', 'मिलता', 'मिलती',
  'मिलेगा', 'मिलेगी', 'भरना', 'भरें', 'दीजिए', 'वाला', 'वाली', 'वाले', 'अभी',
  'यहाँ', 'वहाँ', 'ठीक', 'अच्छा', 'क्यों', 'क्योंकि'
]);

const MR_ROMAN_STRONG = new Set([
  'kasa', 'kase', 'kashi', 'kashala', 'ahes', 'aahes', 'ahe', 'aahe', 'ahet', 'aahet',
  'nahit', 'kaay', 'kay', 'tumhi', 'tumi', 'mala', 'amhi', 'aamhi', 'sanga', 'sangu',
  'sang', 'pahije', 'zhala', 'jhala', 'zhali', 'jhali', 'zhal', 'kuthe', 'kuth',
  'aapan', 'aple', 'apli', 'apla', 'aapla', 'aapli', 'aaple', 'shakto', 'shakte',
  'shakta', 'vichara', 'baddal', 'sathi', 'madhye', 'madhe', 'udya', 'kiti',
  'tumche', 'tumcha', 'tumchi', 'aamche', 'amche', 'amcha', 'amchi', 'tula',
  'majha', 'maza', 'mazi', 'maze', 'bharaycha', 'bharayche', 'bharaychi',
  'karaycha', 'karayche', 'karaychi', 'karave', 'karto', 'karte', 'kartat',
  'konte', 'konta', 'konti', 'mahiti', 'dakhva', 'milte', 'miltat', 'milnar',
  'asel', 'asnar', 'asta', 'astat', 'hava', 'havi', 'namaskar', 'dhanyavad',
  'aabhar', 'krupaya', 'nakki', 'chhan', 'yethe', 'tithe', 'kadhi', 'kon', 'hoy',
  'paryant', 'pasun', 'kade', 'cha', 'chi', 'che', 'chya', 'bhara', 'ghya', 'dya'
]);

const HI_ROMAN_STRONG = new Set([
  'kya', 'kaise', 'kaisa', 'kaisi', 'hai', 'hain', 'hoon', 'hun', 'nahin',
  'namaste', 'shukriya', 'kripya', 'mujhe', 'mujhko', 'aap', 'aapka', 'aapki',
  'aapke', 'mera', 'meri', 'mere', 'humara', 'hamara', 'hamari', 'tumhara',
  'hume', 'humein', 'batao', 'bataiye', 'bataye', 'batana', 'bata', 'chahiye',
  'chaiye', 'hoga', 'hogi', 'honge', 'hota', 'hoti', 'hote', 'theek', 'thik',
  'accha', 'achha', 'kahan', 'kidhar', 'kitna', 'kitni', 'kitne', 'konsa',
  'konsi', 'kaunsa', 'kaunsi', 'kyu', 'kyun', 'kab', 'kaun', 'milega', 'milegi',
  'milta', 'milti', 'karna', 'karne', 'karni', 'karo', 'kijiye', 'kariye',
  'bharna', 'bhare', 'bhariye', 'dijiye', 'dena', 'lena', 'jaana', 'jana',
  'sakta', 'sakti', 'sakte', 'baare', 'wala', 'wali', 'wale', 'iske', 'iska',
  'iski', 'uske', 'uska', 'uski', 'abhi', 'yahan', 'wahan', 'mein', 'ki', 'ke', 'ko'
]);

const SHARED_INDIC_ROMAN = new Set(['nahi', 'ka', 'aaj', 'kal', 'hum']);

const MR_ROMAN_BIGRAMS = /\b(ahe\s+ka|aahe\s+ka|nahi\s+ka|kasa\s+bharaycha|kashi\s+bharaychi|kase\s+bharayche|kasa\s+karaycha|kay\s+ahe|kay\s+aahe|kiti\s+ahe|kiti\s+aahe|chi\s+fee|chi\s+fees|cha\s+fee|cha\s+fees|che\s+timing|cha\s+timing|baddal\s+sanga|baddal\s+mahiti)\b/g;
const HI_ROMAN_BIGRAMS = /\b(ke\s+bare|ke\s+baare|bare\s+me|baare\s+me|bare\s+mein|baare\s+mein|ki\s+fee|ki\s+fees|ka\s+fee|ka\s+fees|me\s+bata|mein\s+bata|ke\s+liye|ka\s+time|ka\s+timing|ki\s+timing|kab\s+hai|kya\s+hai|kitna\s+hai|kitni\s+hai|kitne\s+hai|kaise\s+kare|kaise\s+bhare)\b/g;

/**
 * Checks if a user message is a goodbye/farewell so auto-listening loops stop gracefully.
 */
export function isFarewellMessage(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  const lower = clean.toLowerCase();
  return (
    /\b(bye+|goodbye|good\s*bye|see\s+you|take\s+care|alvida|stop\s+listening|stop\s+mic|turn\s+off\s+mic)\b/i.test(lower) ||
    /(अलविदा|बाय|बंद\s*करा|माइक\s*बंद|माईक\s*बंद)/.test(clean)
  );
}

/**
 * Detect language from text content: 'mr-IN' (Marathi), 'hi-IN' (Hindi), or 'en-US' (English).
 * Handles Devanagari + English and Romanized Marathish/Hinglish + English code-mixing accurately.
 * @param {string} text
 * @param {{ whisperLang?: string, previousLang?: string }} options
 * @returns {'mr-IN' | 'hi-IN' | 'en-US'}
 */
export function detectTextLanguage(text, options = {}) {
  if (!text || typeof text !== 'string') return 'en-US';
  const clean = text.trim();
  if (!clean) return 'en-US';

  const lower = clean.toLowerCase();
  const whisperHint = normalizeLanguageHint(options?.whisperLang);
  const prevHint = normalizeLanguageHint(options?.previousLang);

  // 0. Explicit language switch requests always win immediately
  if (/\b(?:speak|talk|reply|answer|switch|change)\s+(?:to\s+|in\s+)?marathi\b/i.test(lower) || /मराठी(?:त|मध्ये)/.test(clean)) {
    return 'mr-IN';
  }
  if (/\b(?:speak|talk|reply|answer|switch|change)\s+(?:to\s+|in\s+)?hindi\b/i.test(lower) || /(?:हिंदी|हिन्दी)\s*में/.test(clean)) {
    return 'hi-IN';
  }
  if (/\b(?:speak|talk|reply|answer|switch|change)\s+(?:to\s+|in\s+)?english\b/i.test(lower) || /\benglish\s+please\b/i.test(lower)) {
    return 'en-US';
  }

  // 1. Devanagari script detection (\u0900 to \u097F) — Unicode-safe tokenization (avoids JS \b ASCII bug)
  const devanagariMatches = clean.match(/[\u0900-\u097F]/g);
  if (devanagariMatches && devanagariMatches.length > 0) {
    let mrScore = 0;
    let hiScore = 0;

    // ळ (\u0933) is uniquely Marathi (never used in standard Hindi)
    if (clean.includes('ळ')) mrScore += 4;

    const tokens = clean.split(/[\s,?.!।;:'"()\-/]+/).filter(Boolean);
    for (const tok of tokens) {
      if (MR_DEVANAGARI_WORDS.has(tok)) mrScore += 3;
      if (HI_DEVANAGARI_WORDS.has(tok)) hiScore += 3;
      if (/(ंच्या|च्या|तील|वरून|साठी|बद्दल|कडून|नुसार|मध्ये|तून|पर्यंत|पासून)$/.test(tok)) mrScore += 3;
      if (/(यचा|यचे|यची|तोय|तेय|ताहेत|तात|णार|लेलं|लेला|लेली|लेले)$/.test(tok)) mrScore += 3;
    }

    if (mrScore > hiScore) return 'mr-IN';
    if (hiScore > mrScore) return 'hi-IN';

    // Tie-breaker: trust acoustic Whisper LID or active conversation language
    if (whisperHint === 'mr-IN' || whisperHint === 'hi-IN') return whisperHint;
    if (prevHint === 'mr-IN' || prevHint === 'hi-IN') return prevHint;

    if (/(आहे|च्या|सांगा|काय|कसा|कसे|कशी|नाही|माहिती|प्रवेश)/.test(clean)) return 'mr-IN';
    return 'hi-IN';
  }

  // 2. Romanized Marathi (Marathish) & Hindi (Hinglish) — code-mix resilient
  let mrRomanScore = 0;
  let hiRomanScore = 0;
  let sharedCount = 0;

  const romanTokens = lower.replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const tok of romanTokens) {
    if (MR_ROMAN_STRONG.has(tok)) mrRomanScore += 3;
    if (HI_ROMAN_STRONG.has(tok)) hiRomanScore += 3;
    if (SHARED_INDIC_ROMAN.has(tok)) sharedCount += 1;
  }

  const mrBi = lower.match(MR_ROMAN_BIGRAMS);
  if (mrBi) mrRomanScore += mrBi.length * 3;
  const hiBi = lower.match(HI_ROMAN_BIGRAMS);
  if (hiBi) hiRomanScore += hiBi.length * 3;

  // Even a single strong Marathi/Hindi marker in an English-heavy sentence wins over English
  if (mrRomanScore > hiRomanScore && mrRomanScore >= 2) return 'mr-IN';
  if (hiRomanScore > mrRomanScore && hiRomanScore >= 2) return 'hi-IN';

  // If tied or only shared words (e.g. "admission nahi ka"), resolve via Whisper LID or previous language
  if (mrRomanScore > 0 || hiRomanScore > 0 || sharedCount > 0) {
    if (whisperHint === 'mr-IN' || whisperHint === 'hi-IN') return whisperHint;
    if (prevHint === 'mr-IN' || prevHint === 'hi-IN') return prevHint;
    return mrRomanScore >= hiRomanScore ? 'mr-IN' : 'hi-IN';
  }

  // 3. No Marathi/Hindi tokens in text: check Whisper acoustic LID & sticky short follow-ups
  const hasExplicitEnglishGrammar = /\b(what|where|when|who|how|why|which|is|are|was|were|do|does|did|can|could|would|should|will|tell|show|give|please|thank|thanks|hello|hi|hey|about|your|our|the|this|that|for|with|from|need|want|have)\b/i.test(lower);

  if ((whisperHint === 'mr-IN' || whisperHint === 'hi-IN') && !hasExplicitEnglishGrammar) {
    return whisperHint;
  }

  // Sticky follow-up: e.g. user was speaking Marathi/Hindi and asks short English noun phrase ("BCA fees?", "Admission form?")
  if ((prevHint === 'mr-IN' || prevHint === 'hi-IN') && romanTokens.length > 0 && romanTokens.length <= 4 && !hasExplicitEnglishGrammar) {
    return prevHint;
  }

  return 'en-US';
}

function findVoiceByPriorityList(voices, priorityNames) {
  for (const target of priorityNames) {
    const tLower = target.toLowerCase();
    const match = voices.find(v => (v.name || '').toLowerCase().includes(tLower));
    if (match) return match;
  }
  return null;
}

function isKnownFemaleIndicVoice(voice) {
  const n = (voice?.name || '').toLowerCase();
  const uri = (voice?.voiceURI || '').toLowerCase();
  return KNOWN_FEMALE_INDIC_TOKENS.some(tok => n.includes(tok) || uri.includes(tok));
}

/**
 * Resolves the optimal voice for speaking a text message in English, Hindi, or Marathi.
 * Tier 1: Gender-matched Multilingual Neural voice (same single speaker across EN/HI/MR!).
 * Tier 2: Strict gender-matched native Marathi/Hindi voice (blocks female voices for Male Adam).
 * Tier 3: Baritone pitch calibration fallback if OS/Chrome only exposes female Google Hindi.
 *
 * @param {string} personaName - 'Adam', 'Rachel', etc.
 * @param {string} text - The text to be spoken
 * @param {SpeechSynthesisVoice[]|null} explicitVoices - Optional voice list override for testing
 * @returns {{ voice: SpeechSynthesisVoice|null, pitch: number, rate: number, lang: string }}
 */
export function resolveVoiceForText(personaName = 'Adam', text = '', explicitVoices = null) {
  const detectedLang = detectTextLanguage(text);
  const personaKey = String(personaName || 'adam').toLowerCase().trim();
  const spec = VOICE_SPECS[personaKey] || VOICE_SPECS.adam || VOICE_SPECS.rachel;
  const isFemale = spec?.gender === 'female' || ['rachel', 'clara', 'layla', 'emma', 'savannah', 'priya', 'aarohi'].includes(personaKey);
  const basePitch = spec?.pitch ?? (isFemale ? 1.04 : 0.90);
  const baseRate = spec?.rate ?? 0.97;

  const voices = Array.isArray(explicitVoices)
    ? explicitVoices
    : (typeof window !== 'undefined' && window.speechSynthesis
        ? ((cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [])
        : []);

  if (!voices.length) {
    return { voice: null, pitch: basePitch, rate: baseRate, lang: detectedLang };
  }

  // TIER 1: True Single-Voice Multilingual Neural Voice (identical speaker across English, Hindi & Marathi!)
  const multilingualList = isFemale ? MULTILINGUAL_FEMALE_VOICES : MULTILINGUAL_MALE_VOICES;
  const multilingualVoice = findVoiceByPriorityList(voices, multilingualList);
  if (multilingualVoice) {
    return {
      voice: multilingualVoice,
      pitch: basePitch,
      rate: baseRate,
      lang: detectedLang
    };
  }

  // English path when no Multilingual voice exists
  if (detectedLang === 'en-US') {
    if (Array.isArray(explicitVoices)) {
      const enMatch = findVoiceByPriorityList(voices, spec.primaryVoices || []) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('en')) ||
        voices[0];
      return { voice: enMatch || null, pitch: basePitch, rate: baseRate, lang: enMatch?.lang || 'en-US' };
    }
    const resolved = resolveLockedVoice(personaName);
    return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
  }

  // Check per-(persona, lang) lock cache (only when using live browser voices)
  const langCacheKey = `${personaKey}__${detectedLang}`;
  if (!Array.isArray(explicitVoices) && lockedLangVoiceMap.has(langCacheKey)) {
    return lockedLangVoiceMap.get(langCacheKey);
  }

  const cacheAndReturn = (result) => {
    if (!Array.isArray(explicitVoices) && result?.voice) {
      lockedLangVoiceMap.set(langCacheKey, result);
    }
    return result;
  };

  // TIER 2: Strict Gender-Matched Native Marathi / Hindi Voice
  if (detectedLang === 'mr-IN') {
    if (isFemale) {
      const mrFemale = findVoiceByPriorityList(voices, KNOWN_FEMALE_MARATHI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('mr') || (v.name || '').toLowerCase().includes('marathi')) && isKnownFemaleIndicVoice(v)) ||
        findVoiceByPriorityList(voices, KNOWN_FEMALE_HINDI_PRIORITY) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('mr')) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('hi'));

      if (mrFemale) {
        const vLang = (mrFemale.lang || '').toLowerCase().startsWith('mr') ? 'mr-IN' : 'hi-IN';
        return cacheAndReturn({ voice: mrFemale, pitch: basePitch, rate: baseRate, lang: vLang });
      }
    } else {
      // Male persona (e.g. Adam): strictly prefer Male Marathi -> Male Hindi, NEVER pick Swara/Aarohi/Kalpana/Google Hindi female if a male exists!
      const mrMale = findVoiceByPriorityList(voices, KNOWN_MALE_MARATHI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('mr') || (v.name || '').toLowerCase().includes('marathi')) && !isKnownFemaleIndicVoice(v));
      if (mrMale) {
        return cacheAndReturn({ voice: mrMale, pitch: basePitch, rate: baseRate, lang: 'mr-IN' });
      }

      const hiMale = findVoiceByPriorityList(voices, KNOWN_MALE_HINDI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('hindi')) && !isKnownFemaleIndicVoice(v));
      if (hiMale) {
        return cacheAndReturn({ voice: hiMale, pitch: basePitch, rate: baseRate, lang: 'hi-IN' });
      }

      // TIER 3: OS/Chrome fallback when ONLY female Devanagari voice exists (apply baritone pitch calibration so Adam stays deep)
      const anyDevanagari = voices.find(v => (v.lang || '').toLowerCase().startsWith('mr')) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('हिन्दी') || (v.name || '').toLowerCase().includes('hindi'));
      if (anyDevanagari) {
        if (!loggedBaritoneFallbackNotice) {
          loggedBaritoneFallbackNotice = true;
          console.info('[Echo AI Voice] No native male Marathi/Hindi voice detected in this browser; applying baritone pitch calibration for persona:', personaName);
        }
        const baritonePitch = Math.max(0.72, Math.min(0.80, basePitch - 0.12));
        const vLang = (anyDevanagari.lang || '').toLowerCase().startsWith('mr') ? 'mr-IN' : 'hi-IN';
        return cacheAndReturn({ voice: anyDevanagari, pitch: baritonePitch, rate: baseRate, lang: vLang });
      }
    }
  }

  if (detectedLang === 'hi-IN') {
    if (isFemale) {
      const hiFemale = findVoiceByPriorityList(voices, KNOWN_FEMALE_HINDI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('hindi')) && isKnownFemaleIndicVoice(v)) ||
        voices.find(v => (v.lang || '').toLowerCase().startsWith('hi'));

      if (hiFemale) {
        return cacheAndReturn({ voice: hiFemale, pitch: basePitch, rate: baseRate, lang: 'hi-IN' });
      }
    } else {
      const hiMale = findVoiceByPriorityList(voices, KNOWN_MALE_HINDI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('hindi')) && !isKnownFemaleIndicVoice(v));
      if (hiMale) {
        return cacheAndReturn({ voice: hiMale, pitch: basePitch, rate: baseRate, lang: 'hi-IN' });
      }

      const mrMale = findVoiceByPriorityList(voices, KNOWN_MALE_MARATHI_PRIORITY) ||
        voices.find(v => ((v.lang || '').toLowerCase().startsWith('mr') || (v.name || '').toLowerCase().includes('marathi')) && !isKnownFemaleIndicVoice(v));
      if (mrMale) {
        return cacheAndReturn({ voice: mrMale, pitch: basePitch, rate: baseRate, lang: 'mr-IN' });
      }

      // TIER 3: Chrome fallback when only female Devanagari voice exists
      const anyHindi = voices.find(v => (v.lang || '').toLowerCase().startsWith('hi') || (v.name || '').toLowerCase().includes('हिन्दी') || (v.name || '').toLowerCase().includes('hindi'));
      if (anyHindi) {
        if (!loggedBaritoneFallbackNotice) {
          loggedBaritoneFallbackNotice = true;
          console.info('[Echo AI Voice] No native male Hindi voice detected in this browser; applying baritone pitch calibration for persona:', personaName);
        }
        const baritonePitch = Math.max(0.72, Math.min(0.80, basePitch - 0.12));
        return cacheAndReturn({ voice: anyHindi, pitch: baritonePitch, rate: baseRate, lang: 'hi-IN' });
      }
    }
  }

  // Final Fallback
  const resolved = resolveLockedVoice(personaName);
  return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
}

/**
 * Active timers for speech heartbeat & watchdog
 */
let activeHeartbeatTimer = null;
let activeWatchdogTimer = null;

let activeSpeechSessionId = 0;

/**
 * Splits long replies into natural sentence chunks (< 175 chars) so Chromium/Edge
 * SpeechSynthesis NEVER cuts off or freezes mid-answer on long explanations.
 */
export function splitTextIntoSpeechChunks(text, maxLen = 175) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];

  const rawSentences = clean.match(/[^.!?।]+(?:[.!?।]+(?=\s|$)|$)/g) || [clean];
  const chunks = [];
  let current = '';

  const pushSubChunks = (seg) => {
    const trimmed = seg.trim();
    if (!trimmed) return;
    if (trimmed.length <= maxLen) {
      chunks.push(trimmed);
      return;
    }
    const parts = trimmed.split(/(?<=[,;:])\s+/);
    let buf = '';
    for (const p of parts) {
      if ((buf ? buf.length + 1 : 0) + p.length <= maxLen) {
        buf = buf ? `${buf} ${p}` : p;
      } else {
        if (buf) chunks.push(buf);
        if (p.length <= maxLen) {
          buf = p;
        } else {
          const words = p.split(/\s+/);
          let wBuf = '';
          for (const w of words) {
            if ((wBuf ? wBuf.length + 1 : 0) + w.length <= maxLen) {
              wBuf = wBuf ? `${wBuf} ${w}` : w;
            } else {
              if (wBuf) chunks.push(wBuf);
              wBuf = w;
            }
          }
          buf = wBuf;
        }
      }
    }
    if (buf) chunks.push(buf);
  };

  for (const sent of rawSentences) {
    const s = sent.trim();
    if (!s) continue;
    if ((current ? current.length + 1 : 0) + s.length <= maxLen) {
      current = current ? `${current} ${s}` : s;
    } else {
      if (current) chunks.push(current);
      if (s.length <= maxLen) {
        current = s;
      } else {
        pushSubChunks(s);
        current = '';
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [clean];
}

/**
 * Safely cancels any active browser speech and resets watchdog timers
 */
export function stopCurrentSpeech() {
  activeSpeechSessionId++;
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
 * Hardened Sentence-Chunked Speech Synthesis execution with GC Pinning & Generous Per-Sentence Watchdog.
 * Eliminates browser voice freezing, 15s Chromium cutoff, Windows pause/resume stops, and hung 'speaking' states.
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
  const mySessionId = activeSpeechSessionId;

  // If paused in Chrome background, force resume
  if (window.speechSynthesis.paused) {
    try { window.speechSynthesis.resume(); } catch (_) {}
  }

  const cleanText = String(text).replace(/[*#_`]/g, '').trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return null;
  }

  const resolved = resolveVoiceForText(personaName, cleanText);
  const chunks = splitTextIntoSpeechChunks(cleanText, 175);
  let chunkIdx = 0;
  let hasStarted = false;
  let hasEnded = false;
  let firstUtterance = null;

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

  const speakNextChunk = () => {
    if (hasEnded || activeSpeechSessionId !== mySessionId) return;
    if (chunkIdx >= chunks.length) {
      finish(false);
      return;
    }

    const chunkText = chunks[chunkIdx++];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    if (!firstUtterance) firstUtterance = utterance;
    if (resolved?.voice) {
      utterance.voice = resolved.voice;
    }
    utterance.pitch = resolved?.pitch || 1.0;
    utterance.rate = resolved?.rate || 1.0;
    utterance.lang = resolved?.lang || 'en-US';

    // CRITICAL GC PINNING: Pin utterance to window so V8 GC cannot collect it mid-speech
    window.__echoActiveUtterance = utterance;
    let chunkSettled = false;

    const finishChunk = (isError = false, errEvent = null) => {
      if (chunkSettled) return;
      chunkSettled = true;
      if (activeWatchdogTimer) {
        clearTimeout(activeWatchdogTimer);
        activeWatchdogTimer = null;
      }
      if (activeSpeechSessionId !== mySessionId) {
        finish(false);
        return;
      }
      if (isError) {
        finish(true, errEvent);
        return;
      }
      speakNextChunk();
    };

    utterance.onstart = () => {
      if (activeSpeechSessionId !== mySessionId) return;
      if (!hasStarted) {
        hasStarted = true;
        if (onStart) onStart();
      }
    };

    utterance.onend = () => finishChunk(false);
    utterance.onerror = (e) => {
      if (e && (e.error === 'interrupted' || e.error === 'canceled')) {
        finish(false);
        return;
      }
      finishChunk(true, e);
    };

    // Generous per-sentence watchdog (170ms/char + 6s buffer, min 12s) so slow/Indic voices NEVER get cut off mid-sentence
    const chunkBudgetMs = Math.max(12000, Math.round(chunkText.length * 170) + 6000);
    if (activeWatchdogTimer) clearTimeout(activeWatchdogTimer);
    activeWatchdogTimer = setTimeout(() => {
      if (!chunkSettled && activeSpeechSessionId === mySessionId) {
        console.warn('[Voice Watchdog] Chunk timed out, advancing.');
        try { window.speechSynthesis.cancel(); } catch (_) {}
        finishChunk(false);
      }
    }, chunkBudgetMs);

    try {
      window.speechSynthesis.speak(utterance);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (err) {
      console.warn('[SpeechSynthesis] speak error:', err);
      finish(true, err);
    }
  };

  speakNextChunk();
  return firstUtterance;
}
