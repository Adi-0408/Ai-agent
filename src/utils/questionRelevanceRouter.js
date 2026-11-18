/**
 * 6-Way Question Relevance, Unclear-Query Clarification & Off-Topic / General Knowledge Router.
 *
 * Classifies user questions so the assistant handles every category intelligently:
 *  1. Project / Website-related -> Specific grounded answer
 *  2. Frontend / Backend implementation -> Relevant code/architecture analysis
 *  3. General knowledge -> Helpful accurate answer if known
 *  4. Off-topic -> Helpful accurate answer if sufficient knowledge exists
 *  5. Unclear / ambiguous -> Politely ask for clarification instead of guessing
 *  6. Unknown / unverifiable -> Politely apologize, explain limitation & ask user to try another question
 */

const GREETING_OR_COURTESY_RE = /^(?:hi+|hello+|hey+|hii+|helo+|hola|namaste|namaskar|good\s+(?:morning|afternoon|evening|day)|thanks?|thank\s+you|thx|ok(?:ay)?|bye+|goodbye|see\s+you|नमस्कार|नमस्ते|धन्यवाद|अलविदा|बाय)$/i;

const EXPLICIT_UNCLEAR_RE = /^(?:[?!.,…\-_]+|hmm+|hm+|uh+|um+|eh+|huh|what\??|why\??|how\??|who\??|where\??|when\??|this|that|it|something|anything|stuff|things|tell\s+me|explain|help|help\s+me|info|information|details|check|test|testing|idk|nothing|none|asdf+|qwerty|xyz+|abc+|काय\??|का\??|हे|ते|सांगा|क्या\??|क्यों\??|यह|वह|बताओ|बताइए)$/i;

const DOMAIN_OR_PROJECT_SIGNAL_RE = /\b(course|courses|program|programs|admission|admissions|fee|fees|tuition|syllabus|eligibility|scholarship|campus|college|school|academy|batch|batches|medicine|medicines|tablet|syrup|capsule|prescription|pharmacy|doctor|clinic|product|products|price|prices|cost|stock|inventory|available|availability|order|cart|checkout|shipping|return|warranty|menu|dish|dishes|food|table|room|rooms|suite|hotel|booking|reserve|plan|plans|pricing|subscription|car|vehicle|suv|flat|apartment|loan|tax|gst|contact|phone|mobile|whatsapp|email|address|location|hours|timing|timings|form|apply|register|dashboard|chart|graph|report|kpi|revenue|metric|metrics|summary|frontend|backend|api|endpoint|route|routes|database|schema|table|tables|middleware|component|components|dependency|dependencies|coverage|files?|folder|module|modules|bug|bugs|error|errors|diagnostics?|architecture|code|project)\b/i;

const GENERAL_KNOWLEDGE_PROMPT_RE = /\b(what\s+is\s+(?:the\s+)?(?:capital\s+of|meaning\s+of|definition\s+of|formula\s+for|speed\s+of|boiling\s+point|freezing\s+point|largest|smallest|tallest|longest|highest|oldest|population\s+of|currency\s+of|square\s+root\s+of|value\s+of)|who\s+(?:invented|discovered|wrote|painted|was\s+the\s+first|is\s+the\s+(?:president|prime\s+minister|father\s+of))|when\s+(?:did|was)\s+(?:world\s+war|india|america|the\s+internet)|explain\s+(?:what\s+is\s+)?(?:photosynthesis|gravity|osmosis|mitosis|dna|rna|ai|artificial\s+intelligence|machine\s+learning|blockchain|cloud\s+computing|inflation|compound\s+interest|newton'?s\s+laws?|pythagorean|relativity|democracy|climate\s+change|http|https|dns|tcp|sql|html|css|javascript|python)|how\s+(?:many\s+(?:days|hours|minutes|seconds|months|weeks|continents|planets|bones|states)|does\s+(?:photosynthesis|gravity|electricity|the\s+internet|a\s+computer|compound\s+interest)\s+work)|what\s+(?:day|date|time|year)\s+is\s+(?:it|today)|today'?s?\s+date|current\s+(?:date|time)|calculate|compute|convert\s+\d+)\b/i;

const PURE_MATH_RE = /(?:^|\b)(?:(?:what\s+is|calculate|compute|solve|evaluate)\s+)?(\d+(?:\.\d+)?)\s*(?:%\s*of\s*(\d+(?:\.\d+)?)|([+\-*/x×÷^])\s*(\d+(?:\.\d+)?))(?:\s*\?*)?$/i;

/**
 * Detects whether a user query is too vague/fragmented/unclear to answer reliably.
 * NEVER flags valid follow-ups when an activeItem or activeTopic is present, or greetings/domain queries.
 */
export function isUnclearOrAmbiguousQuery(rawQuery = '', context = null) {
  const clean = String(rawQuery || '').trim();
  if (!clean) return true;
  if (GREETING_OR_COURTESY_RE.test(clean)) return false;

  const hasActiveAnchor = Boolean(
    context && (
      context.activeItem ||
      (context.activeTopic && context.activeTopic !== 'unclear') ||
      (Array.isArray(context.lastDisplayedItems) && context.lastDisplayedItems.length > 0)
    )
  );

  // If the user is replying to an active item/topic (e.g. "yes", "details", "this", "more"), let continuity handle it!
  if (hasActiveAnchor && /^(?:yes|yeah|yep|ok|okay|sure|more|details|this|that|it|tell\s+me|explain|show\s+more|first\s+one|second\s+one|हो|होय|हाँ|जी|अधिक|विस्तार)$/i.test(clean)) {
    return false;
  }

  // Punctuation-only or 1-2 character gibberish (excluding digits like "1" or "2" when choosing from a list)
  const strippedAlphaNum = clean.replace(/[^\p{L}\p{N}]/gu, '');
  if (strippedAlphaNum.length === 0) return true;
  if (strippedAlphaNum.length <= 2 && !hasActiveAnchor && !/^(hi|ok|no)$/i.test(strippedAlphaNum)) {
    return true;
  }

  if (EXPLICIT_UNCLEAR_RE.test(clean)) {
    return true;
  }

  // Single short vague filler word with no domain meaning and no active anchor
  const words = clean.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 1 && !hasActiveAnchor && !DOMAIN_OR_PROJECT_SIGNAL_RE.test(clean) && /^(?:please|pls|plz|wait|bro|sir|madam|mam|friend|buddy|question|doubt|query|problem|issue|need|want|looking|ask|say)$/i.test(words[0])) {
    return true;
  }

  return false;
}

/**
 * Builds a warm, polite clarification reply in English, Hindi, or Marathi instead of guessing.
 */
export function buildClarificationReply(rawQuery = '', opts = {}) {
  const { queryLang = 'en-US', profile = null, catalogItems = [] } = opts;
  const topNames = (Array.isArray(catalogItems) ? catalogItems : []).slice(0, 3).map(i => i.name).filter(Boolean);

  if (queryLang === 'mr-IN') {
    const hintMr = topNames.length > 0
      ? ` उदाहरणार्थ, आपण ${topNames.join(', ')} किंवा आपल्या कोणत्याही प्रश्नाबद्दल विचारू शकता.`
      : '';
    return `माफ करा, आपला प्रश्न मला नीट स्पष्ट झाला नाही, त्यामुळे अंदाज लावण्याऐवजी मी विचारतो आहे — कृपया आपल्याला नेमकी कोणती माहिती हवी आहे ते थोडे सविस्तर सांगाल का?${hintMr}`;
  }

  if (queryLang === 'hi-IN') {
    const hintHi = topNames.length > 0
      ? ` उदाहरण के लिए, आप ${topNames.join(', ')} या अपने किसी भी प्रश्न के बारे में पूछ सकते हैं।`
      : '';
    return `क्षमा करें, आपका प्रश्न मुझे पूरी तरह स्पष्ट नहीं हुआ, इसलिए अनुमान लगाने के बजाय मैं पूछना चाहूँगा — कृपया थोड़ा स्पष्ट बताएं कि आप किस विषय के बारे में जानकारी चाहते हैं?${hintHi}`;
  }

  const followUp = (profile && profile.followUpEn) ? profile.followUpEn : '';
  const exampleHint = topNames.length > 0
    ? ` For example, you can ask me about ${topNames.join(', ')}, or any specific question you have in mind.`
    : (followUp ? ` For example, you can ask about ${followUp}, or any other question you have.` : '');
  return `I want to make sure I give you the exact answer you need, so could you please clarify what you are asking about?${exampleHint}`;
}

/**
 * Detects whether a query is a general knowledge / off-topic question unrelated to private business/project records.
 */
export function isGeneralOffTopicQuery(rawQuery = '', opts = {}) {
  const clean = String(rawQuery || '').trim();
  if (!clean) return false;

  const catalogItems = Array.isArray(opts.catalogItems) ? opts.catalogItems : [];
  const lower = clean.toLowerCase();

  // If the query explicitly matches an item in this website's catalog, it is ON-TOPIC, never off-topic!
  if (catalogItems.some(item => item?.name && lower.includes(String(item.name).toLowerCase()))) {
    return false;
  }

  // Pure math / percentage calculations are always general knowledge
  if (PURE_MATH_RE.test(clean)) return true;

  // Date/time or clear general-knowledge patterns (when not asking about website/project domain terms)
  if (GENERAL_KNOWLEDGE_PROMPT_RE.test(clean) && !/\b(this\s+website|this\s+project|your\s+(?:website|company|school|college|store|clinic|hotel|restaurant|app|code|database|fees?|prices?|stock))\b/i.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Safe deterministic offline general-knowledge responder (arithmetic, percentages, date/day/time,
 * and select verified foundational concepts). Returns null for anything uncertain so the AI
 * NEVER fabricates and cleanly transitions to a polite apology.
 */
export function tryAnswerGeneralKnowledgeLocally(rawQuery = '', queryLang = 'en-US') {
  const clean = String(rawQuery || '').trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  // 1. Safe Percentage & Arithmetic Calculator ("what is 15% of 400?", "24 * 18", "1250 - 340")
  const mathMatch = clean.match(PURE_MATH_RE);
  if (mathMatch) {
    const a = Number(mathMatch[1]);
    if (mathMatch[2] !== undefined) {
      const b = Number(mathMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const res = Number(((a / 100) * b).toFixed(4));
        if (queryLang === 'mr-IN') return `नक्कीच! ${b} चे ${a}% म्हणजे ${res} होतात. आपल्याला आणखी कोणती गणना किंवा माहिती हवी असल्यास कृपया विचारा!`;
        if (queryLang === 'hi-IN') return `ज़रूर! ${b} का ${a}% बराबर ${res} होता है। कृपया बताएं यदि आपको कोई और जानकारी चाहिए!`;
        return `Certainly! ${a}% of ${b} is ${res}. Please let me know if there is anything else I can help you with!`;
      }
    } else if (mathMatch[3] && mathMatch[4] !== undefined) {
      const op = mathMatch[3].toLowerCase();
      const b = Number(mathMatch[4]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        let res = null;
        if (op === '+') res = a + b;
        else if (op === '-') res = a - b;
        else if (op === '*' || op === 'x' || op === '×') res = a * b;
        else if (op === '/' || op === '÷') res = b !== 0 ? Number((a / b).toFixed(4)) : null;
        else if (op === '^') res = Math.abs(b) <= 12 ? Number(Math.pow(a, b).toFixed(4)) : null;

        if (res !== null && Number.isFinite(res)) {
          const prettyOp = op === 'x' ? '×' : op;
          if (queryLang === 'mr-IN') return `नक्कीच! ${a} ${prettyOp} ${b} = ${res}. आपल्याला आणखी काही मदत हवी असल्यास कृपया विचारा!`;
          if (queryLang === 'hi-IN') return `ज़रूर! ${a} ${prettyOp} ${b} = ${res}। कृपया बताएं यदि मैं किसी और चीज़ में मदद कर सकूँ!`;
          return `Certainly! ${a} ${prettyOp} ${b} equals ${res}. Please let me know if there is anything else I can help you with!`;
        }
      }
    }
  }

  // 2. Current Date / Day / Time
  if (/\b(what\s+(?:day|date)\s+is\s+(?:it|today)|today'?s?\s+date|current\s+date)\b/i.test(lower)) {
    const now = new Date();
    const formatted = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (queryLang === 'mr-IN') return `नक्कीच! आजची तारीख ${formatted} आहे. मी आपल्याला आणखी कशी मदत करू शकतो?`;
    if (queryLang === 'hi-IN') return `ज़रूर! आज की तारीख ${formatted} है। मैं आपकी और किस प्रकार सहायता कर सकता हूँ?`;
    return `Certainly! Today is ${formatted}. Please let me know if there is anything else I can help you with!`;
  }
  if (/\b(what\s+time\s+is\s+it|current\s+time)\b/i.test(lower)) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Certainly! The current local time is ${timeStr}. Please let me know if I can assist you with anything else!`;
  }

  // 3. Verified Foundational General-Knowledge Reference (offline fallback when no LLM key is connected)
  const verifiedFacts = [
    {
      re: /\bcapital\s+of\s+india\b/i,
      a: 'Certainly! The capital of India is New Delhi.'
    },
    {
      re: /\bcapital\s+of\s+japan\b/i,
      a: 'Certainly! The capital of Japan is Tokyo.'
    },
    {
      re: /\bcapital\s+of\s+(?:the\s+)?(?:usa|united\s+states)\b/i,
      a: 'Certainly! The capital of the United States is Washington, D.C.'
    },
    {
      re: /\bcapital\s+of\s+(?:the\s+)?(?:uk|united\s+kingdom|england)\b/i,
      a: 'Certainly! The capital of the United Kingdom is London.'
    },
    {
      re: /\bcapital\s+of\s+france\b/i,
      a: 'Certainly! The capital of France is Paris.'
    },
    {
      re: /\bphotosynthesis\b/i,
      a: 'Certainly! Photosynthesis is the biological process by which green plants, algae, and some bacteria convert sunlight, water, and carbon dioxide into glucose (energy) and release oxygen.'
    },
    {
      re: /\bboiling\s+point\s+of\s+water\b/i,
      a: 'Certainly! At standard atmospheric pressure (sea level), pure water boils at 100°C (212°F).'
    },
    {
      re: /\bspeed\s+of\s+light\b/i,
      a: 'Certainly! The speed of light in a vacuum is approximately 299,792 kilometers per second (about 3 × 10⁸ meters per second).'
    },
    {
      re: /\bcompound\s+interest\b/i,
      a: 'Certainly! Compound interest is interest calculated on both the initial principal and the accumulated interest from previous periods, following the formula A = P(1 + r/n)^(nt).'
    }
  ];

  for (const fact of verifiedFacts) {
    if (fact.re.test(clean)) {
      return `${fact.a} Please let me know if you have any other questions!`;
    }
  }

  return null;
}
