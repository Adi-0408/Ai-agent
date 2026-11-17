/**
 * Universal Zero-Dependency Typo-Tolerant & Word-Order-Independent NLU Engine
 * Works across ALL 10 website archetypes (Academic, E-Commerce, Healthcare, Food, SaaS,
 * Hospitality, Automotive, Financial, Real Estate, General) in < 2ms.
 */

export function damerauLevenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (s === t) return 0;
  if (Math.abs(m - n) > 3) return Math.abs(m - n);

  const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let val = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        val = Math.min(val, d[i - 2][j - 2] + 1); // transposition
      }
      d[i][j] = val;
    }
  }
  return d[m][n];
}

export function bigramSimilarity(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 1;
  if (s.length < 2 || t.length < 2) return 0;
  const sBigrams = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    sBigrams.set(bg, (sBigrams.get(bg) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < t.length - 1; i++) {
    const bg = t.slice(i, i + 2);
    const cnt = sBigrams.get(bg) || 0;
    if (cnt > 0) {
      overlap++;
      sBigrams.set(bg, cnt - 1);
    }
  }
  return (2 * overlap) / (s.length - 1 + t.length - 1);
}

export function stemWord(w) {
  const s = String(w || '').toLowerCase();
  if (s.length <= 3) return s;
  if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
  if (s.endsWith('es') && s.length > 4 && /(ch|sh|x|z|o|ss)es$/.test(s)) return s.slice(0, -2);
  if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/**
 * Adaptive length-scaled typo matcher with strict short-word & collision safety guards.
 * Returns match quality: 0 (no match), 2 (fuzzy), 3 (stem/prefix), 4 (exact).
 */
export function fuzzyTokenMatch(inputTok, targetTok) {
  const a = String(inputTok || '').toLowerCase().trim();
  const b = String(targetTok || '').toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 4;

  const sa = stemWord(a);
  const sb = stemWord(b);
  if (sa === sb) return 3;

  // Numbers/digits must match exactly (never confuse 11th with 12th or 650 with 500!)
  if (/\d/.test(a) || /\d/.test(b)) {
    const digA = a.replace(/\D/g, '');
    const digB = b.replace(/\D/g, '');
    if (digA !== digB) return 0;
    if (a.length >= 4 && b.length >= 4 && damerauLevenshtein(a, b) <= 1) return 2;
    return 0;
  }

  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if (minLen <= 2) return 0;

  // Prefix match for 4+ char truncated words (e.g. "paracet" -> "paracetamol")
  if (minLen >= 4 && (b.startsWith(a) || a.startsWith(b)) && (maxLen - minLen) <= 4) {
    return 3;
  }

  // Length 3: only allow 1-char transposition/substitution if first letter matches and target is len 4+ (e.g. "dlo" -> "dolo")
  if (minLen === 3) {
    if (maxLen <= 4 && a[0] === b[0] && damerauLevenshtein(a, b) === 1) return 2;
    return 0;
  }

  const dist = Math.min(damerauLevenshtein(a, b), damerauLevenshtein(sa, sb));
  if (maxLen <= 5) {
    return dist <= 1 ? 2 : 0;
  }
  if (maxLen <= 8) {
    if (dist <= 1) return 2;
    if (dist === 2 && (a[0] === b[0] || bigramSimilarity(a, b) >= 0.45)) return 2;
    return 0;
  }
  if (maxLen <= 10) {
    return dist <= 2 ? 2 : 0;
  }
  return dist <= 3 && bigramSimilarity(a, b) >= 0.45 ? 2 : 0;
}

export const SHORTHAND_MAP = {
  u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please',
  wat: 'what', wht: 'what', whch: 'which', hw: 'how', abt: 'about',
  bcoz: 'because', cuz: 'because', info: 'information', amt: 'amount',
  prce: 'price', prise: 'price', fess: 'fees', feess: 'fees',
  avail: 'available', avilable: 'available', avlbl: 'available',
  reg: 'registration', elig: 'eligibility', elgibility: 'eligibility',
  doc: 'documents', docs: 'documents', req: 'required', dept: 'department',
  thx: 'thanks', ty: 'thanks', thnks: 'thanks', hv: 'have', shw: 'show',
  nxt: 'next', prvide: 'provide', dtls: 'details', detals: 'details',
  wanna: 'want', gonna: 'going', gimme: 'give', tellme: 'tell',
  rx: 'prescription', cod: 'cash on delivery', qty: 'quantity',
  med: 'medicine', meds: 'medicines', roms: 'rooms', hotl: 'hotel'
};

export const UNIVERSAL_CONCEPT_VOCAB = [
  // Greetings & conversational
  'hello', 'hey', 'hi', 'morning', 'afternoon', 'evening', 'namaste', 'namaskar', 'thanks', 'thank', 'goodbye', 'bye',
  'yes', 'sure', 'okay', 'more', 'next', 'continue', 'first', 'second', 'third', 'fourth', 'fifth', 'last',
  // Exploration & question words
  'what', 'which', 'where', 'when', 'who', 'how', 'tell', 'show', 'give', 'list', 'all', 'details', 'information',
  'overview', 'about', 'know', 'want', 'need', 'provide', 'offer', 'have', 'available', 'availability', 'stock',
  'sell', 'serve', 'teach', 'study', 'learn', 'eat', 'drink', 'browse', 'explore', 'options', 'catalog', 'catalogue', 'inventory',
  // Money & pricing
  'price', 'prices', 'pricing', 'fee', 'fees', 'cost', 'costs', 'rate', 'rates', 'charge', 'charges', 'structure',
  'tuition', 'pay', 'payment', 'money', 'budget', 'rent', 'tariff', 'mrp', 'amount', 'discount', 'expensive', 'cheap', 'much',
  // Categories across all 10 archetypes
  'course', 'courses', 'program', 'programs', 'stream', 'streams', 'class', 'classes', 'subject', 'subjects', 'degree', 'diploma', 'syllabus', 'curriculum', 'college', 'school', 'academy',
  'product', 'products', 'item', 'items', 'shoes', 'sneakers', 'laptop', 'phone', 'watch', 'clothing',
  'medicine', 'medicines', 'drug', 'drugs', 'tablet', 'tablets', 'capsule', 'syrup', 'pharmacy', 'clinic', 'hospital', 'doctor',
  'dish', 'dishes', 'food', 'meal', 'meals', 'menu', 'restaurant', 'pizza', 'burger', 'biryani', 'paneer',
  'plan', 'plans', 'tier', 'tiers', 'subscription', 'software', 'trial', 'billing', 'invoice', 'feature', 'features',
  'room', 'rooms', 'suite', 'suites', 'stay', 'hotel', 'resort', 'checkin', 'checkout', 'amenities',
  'vehicle', 'vehicles', 'car', 'cars', 'bike', 'bikes', 'model', 'models', 'showroom', 'drive', 'test', 'servicing',
  'property', 'properties', 'flat', 'flats', 'apartment', 'apartments', 'plot', 'plots', 'visit', 'site', 'floor',
  'service', 'services', 'loan', 'loans', 'tax', 'gst', 'audit', 'consultation', 'account', 'policy', 'policies', 'package', 'packages',
  // Procedure, eligibility, documents & policies
  'admission', 'admissions', 'apply', 'application', 'join', 'enroll', 'enrollment', 'register', 'registration',
  'order', 'buy', 'purchase', 'book', 'booking', 'reserve', 'reservation', 'reservations', 'schedule', 'process', 'procedure', 'steps', 'form', 'started',
  'eligibility', 'eligible', 'criteria', 'qualify', 'qualification', 'requirement', 'requirements', 'marks', 'percentage', 'score', 'cutoff', 'prerequisite', 'pass', 'allowed',
  'document', 'documents', 'paper', 'papers', 'certificate', 'marksheet', 'leaving', 'bring', 'submit', 'required', 'needed',
  'prescription', 'dosage', 'note', 'return', 'returns', 'refund', 'exchange', 'replace', 'back', 'send', 'warranty', 'guarantee',
  'shipping', 'delivery', 'deliver', 'arrive', 'cancel', 'cancellation', 'scholarship', 'emi', 'installment', 'parking', 'wifi', 'dietary', 'vegetarian', 'vegan',
  // Contact & timings
  'address', 'location', 'located', 'map', 'directions', 'phone', 'call', 'number', 'mobile', 'contact', 'email', 'hours', 'timing', 'timings', 'open', 'close',
  // Common academic/general terms
  'science', 'commerce', 'arts', 'engineering', 'medical', 'foundation', 'integrated', 'standard'
];

export const NLU_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'is', 'are', 'was', 'were',
  'be', 'been', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'am', 'i', 'me', 'my', 'we', 'us', 'our',
  'you', 'your', 'they', 'them', 'it', 'its', 'this', 'that', 'these', 'those', 'here', 'there', 'if', 'doesnt', 'dont',
  'please', 'just', 'some', 'any', 'also', 'very', 'really', 'so', 'too', 'about', 'into', 'like'
]);

export const GENERIC_CATEGORY_NOUNS = new Set([
  'course', 'courses', 'program', 'programs', 'programme', 'programmes', 'stream', 'streams', 'class', 'classes',
  'subject', 'subjects', 'degree', 'degrees', 'diploma', 'admission', 'admissions', 'college', 'school',
  'product', 'products', 'item', 'items', 'goods', 'shoe', 'shoes', 'sneaker', 'sneakers', 'shop', 'store',
  'medicine', 'medicines', 'med', 'meds', 'drug', 'drugs', 'tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'pill', 'pills',
  'dish', 'dishes', 'food', 'foods', 'meal', 'meals', 'menu', 'drink', 'drinks', 'restaurant',
  'plan', 'plans', 'tier', 'tiers', 'subscription', 'subscriptions', 'software', 'feature', 'features',
  'room', 'rooms', 'suite', 'suites', 'stay', 'stays', 'hotel', 'resort',
  'vehicle', 'vehicles', 'car', 'cars', 'bike', 'bikes', 'model', 'models',
  'property', 'properties', 'flat', 'flats', 'apartment', 'apartments', 'plot', 'plots', 'listing', 'listings',
  'service', 'services', 'offering', 'offerings', 'option', 'options', 'package', 'packages', 'catalog', 'catalogue', 'inventory',
  'price', 'prices', 'pricing', 'fee', 'fees', 'cost', 'costs', 'rate', 'rates', 'charge', 'charges', 'structure', 'details', 'detail', 'info', 'information', 'list', 'stock', 'available', 'availability'
]);

export function buildDynamicVocab(catalogItems = [], kbList = []) {
  const vocab = new Set(UNIVERSAL_CONCEPT_VOCAB);
  const addText = (txt) => {
    const toks = String(txt || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    for (const tok of toks) {
      if (tok.length >= 3 && !/^\d+$/.test(tok)) vocab.add(tok);
    }
  };
  if (Array.isArray(catalogItems)) {
    for (const it of catalogItems.slice(0, 120)) {
      addText(it?.name || it?.title || it?.product || '');
      addText(it?.category || '');
      addText(it?.dosage || it?.description || '');
    }
  }
  if (Array.isArray(kbList)) {
    for (const k of kbList.slice(0, 60)) {
      addText(k?.q || '');
    }
  }
  return Array.from(vocab);
}

/**
 * Normalizes typos, elongated letters, and chat shorthands across English while leaving Devanagari intact.
 */
export function normalizeUserQuery(rawText, catalogItems = [], kbList = []) {
  const str = String(rawText || '').trim();
  if (!str) return '';
  // Preserve Devanagari text directly
  if (/[\u0900-\u097F]/.test(str)) return str;

  const vocabList = buildDynamicVocab(catalogItems, kbList);
  const vocabSet = new Set(vocabList);

  const tokens = str
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const normalized = tokens.map(rawTok => {
    // Collapse 3+ repeated letters ("feesss" -> "fees", "hellooo" -> "hello")
    const tok = rawTok.replace(/(.)\1{2,}/g, '$1$1');
    if (SHORTHAND_MAP[tok]) return SHORTHAND_MAP[tok];
    if (SHORTHAND_MAP[rawTok.replace(/(.)\1+/g, '$1')]) {
      const collapsed = rawTok.replace(/(.)\1+/g, '$1');
      if (SHORTHAND_MAP[collapsed]) return SHORTHAND_MAP[collapsed];
    }
    if (vocabSet.has(tok) || NLU_STOPWORDS.has(tok) || /\d/.test(tok) || tok.length <= 2) {
      return tok;
    }

    // Try collapsing double letters to single (e.g. "feess" -> "fees", "helllo" -> "helo")
    const singleCollapsed = tok.replace(/(.)\1+/g, '$1');
    if (vocabSet.has(singleCollapsed)) return singleCollapsed;

    // Find best Damerau-Levenshtein fuzzy match in vocab
    let bestWord = tok;
    let bestDist = 99;
    let bestSim = 0;

    for (const cand of vocabList) {
      if (Math.abs(cand.length - tok.length) > 2) continue;
      if (fuzzyTokenMatch(tok, cand) >= 2) {
        const d = damerauLevenshtein(tok, cand);
        const sim = bigramSimilarity(tok, cand) + (tok[0] === cand[0] ? 0.15 : 0);
        if (d < bestDist || (d === bestDist && sim > bestSim)) {
          bestDist = d;
          bestSim = sim;
          bestWord = cand;
        }
      }
    }
    return bestWord;
  });

  return normalized.join(' ').replace(/\s+/g, ' ').trim();
}

const CONCEPT_GROUPS = {
  catalog: new Set([
    'course', 'program', 'programme', 'stream', 'class', 'subject', 'degree', 'diploma', 'teach', 'study', 'learn',
    'product', 'item', 'good', 'shoe', 'sneaker', 'laptop', 'phone', 'watch', 'clothing', 'sell', 'shop', 'catalog', 'catalogue', 'inventory',
    'medicine', 'med', 'drug', 'tablet', 'capsule', 'syrup', 'pharmacy',
    'dish', 'food', 'meal', 'menu', 'eat', 'drink', 'serve', 'pizza', 'burger',
    'plan', 'tier', 'subscription', 'software', 'feature',
    'room', 'suite', 'stay', 'villa',
    'vehicle', 'car', 'bike', 'model',
    'property', 'flat', 'apartment', 'plot', 'listing',
    'service', 'offering', 'option', 'package', 'loan', 'treatment', 'test'
  ]),
  explore: new Set([
    'what', 'which', 'list', 'all', 'show', 'give', 'tell', 'know', 'detail', 'info', 'information', 'overview',
    'available', 'availability', 'provide', 'offer', 'have', 'sell', 'serve', 'teach', 'run', 'see', 'view', 'browse', 'explore', 'study', 'eat'
  ]),
  money: new Set([
    'price', 'pricing', 'fee', 'cost', 'rate', 'charge', 'pay', 'payment', 'money', 'budget', 'tuition',
    'rent', 'tariff', 'mrp', 'amount', 'expensive', 'cheap', 'structure', 'much', 'discount'
  ]),
  procedure: new Set([
    'apply', 'application', 'join', 'enroll', 'enrollment', 'admission', 'register', 'registration', 'signup',
    'order', 'buy', 'purchase', 'checkout', 'book', 'booking', 'reserve', 'reservation', 'schedule', 'visit',
    'start', 'started', 'process', 'procedure', 'step', 'form', 'drive'
  ]),
  eligibility: new Set([
    'eligibility', 'eligible', 'criteria', 'qualify', 'qualification', 'requirement', 'mark', 'percentage',
    'score', 'cutoff', 'prerequisite', 'allowed', 'pass', 'passing'
  ]),
  policyDocs: new Set([
    'document', 'paper', 'certificate', 'marksheet', 'leaving', 'lc', 'bring', 'submit',
    'prescription', 'doctor', 'note', 'dosage',
    'return', 'refund', 'exchange', 'replace', 'back', 'send',
    'warranty', 'guarantee', 'shipping', 'delivery', 'deliver', 'arrive',
    'checkin', 'checkout', 'cancel', 'cancellation', 'billing', 'invoice', 'emi', 'installment',
    'scholarship', 'parking', 'wifi', 'dietary', 'vegetarian', 'vegan', 'amenitie', 'amenity'
  ]),
  contact: new Set([
    'address', 'location', 'located', 'where', 'map', 'direction', 'phone', 'call', 'number', 'mobile', 'contact', 'email', 'mail', 'hour', 'timing', 'open', 'close'
  ])
};

/**
 * Word-order-independent Bag-of-Concepts intent classifier.
 */
export function classifyIntentConcepts(normalizedText) {
  const lower = String(normalizedText || '').toLowerCase().trim();
  const rawTokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const stems = rawTokens.map(stemWord);
  const stemSet = new Set(stems);

  const countHits = (groupSet) => {
    let c = 0;
    for (const s of stemSet) {
      if (groupSet.has(s)) c++;
    }
    return c;
  };

  const hasPronounRef = /\b(in that|in this|in it|for that|for this|for it|of that|of this|about that|about this|about it)\b/i.test(lower);
  const catalogHits = countHits(CONCEPT_GROUPS.catalog);
  const exploreHits = countHits(CONCEPT_GROUPS.explore);
  const moneyHits = countHits(CONCEPT_GROUPS.money);
  const procedureHits = countHits(CONCEPT_GROUPS.procedure);
  const eligibilityHits = countHits(CONCEPT_GROUPS.eligibility);
  const policyDocsHits = countHits(CONCEPT_GROUPS.policyDocs);
  const contactHits = countHits(CONCEPT_GROUPS.contact);

  // Special natural paraphrases (order-independent)
  const isWhoCanJoin = stemSet.has('who') && (stemSet.has('apply') || stemSet.has('join') || stemSet.has('enroll') || stemSet.has('eligible') || stemSet.has('admission'));
  const isBringNeed = (stemSet.has('bring') || stemSet.has('paper') || stemSet.has('submit')) && (stemSet.has('need') || stemSet.has('required') || stemSet.has('what') || stemSet.has('which'));
  const isSendBack = (stemSet.has('back') && (stemSet.has('send') || stemSet.has('give') || stemSet.has('take') || stemSet.has('money')));
  const isHowLongShip = (stemSet.has('long') || stemSet.has('day') || stemSet.has('time')) && (stemSet.has('shipping') || stemSet.has('delivery') || stemSet.has('deliver') || stemSet.has('arrive') || stemSet.has('warranty'));

  const isAllConceptWord = (st) => (
    CONCEPT_GROUPS.catalog.has(st) ||
    CONCEPT_GROUPS.explore.has(st) ||
    CONCEPT_GROUPS.money.has(st) ||
    CONCEPT_GROUPS.procedure.has(st) ||
    CONCEPT_GROUPS.eligibility.has(st) ||
    CONCEPT_GROUPS.policyDocs.has(st) ||
    CONCEPT_GROUPS.contact.has(st) ||
    ['want', 'need', 'can', 'could', 'would', 'will', 'please', 'kind', 'type', 'sort', 'store', 'shop', 'college', 'school', 'academy', 'clinic', 'hospital', 'restaurant', 'hotel', 'resort', 'showroom', 'portal', 'website', 'site', 'page', 'today', 'right', 'now', 'currently'].includes(st)
  );
  const unknownSpecificTokens = stems.filter(st => st.length >= 4 && !NLU_STOPWORDS.has(st) && !isAllConceptWord(st));

  const isEligibility = eligibilityHits > 0 || isWhoCanJoin;
  const isPolicyDocs = policyDocsHits > 0 || isBringNeed || isSendBack || isHowLongShip;
  const isPriceOverview = !hasPronounRef && moneyHits > 0 && !isEligibility && !isPolicyDocs && unknownSpecificTokens.length === 0;
  const isProcedure = procedureHits > 0 && !isEligibility && !isPolicyDocs && !isPriceOverview;
  const isCatalogList = !hasPronounRef && !isEligibility && !isPolicyDocs && !isPriceOverview && !isProcedure && unknownSpecificTokens.length === 0 && (
    (catalogHits > 0 && (exploreHits > 0 || rawTokens.length <= 3)) ||
    (stemSet.has('menu') || stemSet.has('catalog') || stemSet.has('catalogue') || stemSet.has('inventory')) ||
    (exploreHits >= 2 && (stemSet.has('provide') || stemSet.has('offer') || stemSet.has('sell') || stemSet.has('serve') || stemSet.has('teach') || stemSet.has('available')))
  );
  const isContact = contactHits > 0 && !isCatalogList && !isPriceOverview && !isEligibility && !isPolicyDocs;

  return {
    isCatalogList,
    isPriceOverview,
    isProcedure,
    isEligibility,
    isPolicyDocs,
    isContact,
    hasPronounRef,
    stems
  };
}

/**
 * Order-independent, typo-tolerant fuzzy catalog item matcher with strict Specific Entity Guard.
 */
export function fuzzyMatchRecord(records, rawQuery, normalizedQuery = '') {
  if (!Array.isArray(records) || records.length === 0) return null;
  const queryText = String(normalizedQuery || rawQuery || '').toLowerCase().trim();
  if (!queryText || queryText.length < 2) return null;

  const cleanQuery = queryText.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const allTokens = cleanQuery.split(' ').filter(w => w.length >= 2);
  const meaningful = allTokens.filter(t => !NLU_STOPWORDS.has(t));
  const specificTokens = meaningful.filter(t => !GENERIC_CATEGORY_NOUNS.has(t) && !CONCEPT_GROUPS.explore.has(stemWord(t)) && !CONCEPT_GROUPS.money.has(stemWord(t)) && !CONCEPT_GROUPS.procedure.has(stemWord(t)));

  // If the query ONLY contains generic category/intent words (e.g. "courses details give me", "plan pricing"), DO NOT match a single item!
  if (specificTokens.length === 0) return null;

  let best = null;
  let maxScore = 0;

  for (const item of records) {
    const rawName = String(item?.name || item?.title || item?.product || '').toLowerCase().trim();
    if (!rawName) continue;
    const cleanName = rawName.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const details = String(item?.description || item?.dosage || item?.composition || item?.category || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

    if (cleanName === cleanQuery) return item;

    const nameTokens = cleanName.split(' ').filter(w => w.length >= 2);
    const detailTokens = details.split(' ').filter(w => w.length >= 2);

    // Entity Guard: at least ONE specific token must fuzzy-match a token in item's name or details
    let specificNameMatches = 0;
    let specificDetailMatches = 0;
    let strongDetailMatch = false;
    let totalScore = 0;

    for (const qTok of specificTokens) {
      let bestNameQuality = 0;
      for (const nTok of nameTokens) {
        const q = fuzzyTokenMatch(qTok, nTok);
        if (q > bestNameQuality) bestNameQuality = q;
      }
      if (bestNameQuality > 0) {
        specificNameMatches++;
        totalScore += bestNameQuality * 3;
      } else {
        let bestDetQuality = 0;
        for (const dTok of detailTokens) {
          const q = fuzzyTokenMatch(qTok, dTok);
          if (q > bestDetQuality) bestDetQuality = q;
        }
        if (bestDetQuality > 0) {
          specificDetailMatches++;
          if ((bestDetQuality >= 3 && qTok.length >= 5) || (bestDetQuality >= 2 && qTok.length >= 6)) strongDetailMatch = true;
          totalScore += bestDetQuality * 2;
        }
      }
    }

    // Require at least one specific token to match in the item name (or a strong 5+ char ingredient/spec match in details)
    if (specificNameMatches === 0 && specificDetailMatches < 2 && !strongDetailMatch) continue;

    // Bonus for extra generic/context tokens also matching the name (e.g. "pro plan" prefers "Pro Plan" over "Pro Camera")
    for (const qTok of meaningful) {
      if (specificTokens.includes(qTok)) continue;
      if (nameTokens.some(nTok => fuzzyTokenMatch(qTok, nTok) >= 3)) {
        totalScore += 2;
      }
    }

    if (totalScore > maxScore) {
      maxScore = totalScore;
      best = item;
    }
  }

  return best && maxScore >= 4 ? best : null;
}

/**
 * Fuzzy + stemmed KB / FAQ entry scorer (order-independent & typo-tolerant).
 */
export function scoreKbEntryFuzzy(normalizedQuery, item) {
  if (!item || !item.q || !item.a) return 0;
  const qLower = String(item.q).toLowerCase();
  const aLower = String(item.a).toLowerCase();
  const qNorm = String(normalizedQuery || '').toLowerCase().trim();
  if (!qNorm) return 0;

  let score = 0;
  if (qNorm.length >= 4 && (qNorm.includes(qLower) || qLower.includes(qNorm))) {
    score += 80;
  }

  const queryToks = qNorm.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !NLU_STOPWORDS.has(w));
  const kbQToks = qLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const kbAToks = aLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);

  for (const qt of queryToks) {
    let bestQ = 0;
    for (const kt of kbQToks) {
      const m = fuzzyTokenMatch(qt, kt);
      if (m > bestQ) bestQ = m;
    }
    if (bestQ >= 3) score += 20;
    else if (bestQ === 2) score += 14;

    let bestA = 0;
    for (const at of kbAToks) {
      const m = fuzzyTokenMatch(qt, at);
      if (m > bestA) bestA = m;
    }
    if (bestA >= 3) score += 8;
    else if (bestA === 2) score += 5;
  }

  return score;
}
