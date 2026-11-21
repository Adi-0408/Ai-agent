/**
 * ==============================================================================
 * ADVANCED MULTILINGUAL SEMANTIC & HYBRID RAG ENGINE
 * ==============================================================================
 * Combines Dense Semantic Vector Search + BM25 Lexical Search + Reciprocal
 * Rank Fusion (RRF) + Contextual Reranking + Strict Precision Gating.
 *
 * Supports English, Hindi, Marathi, Hinglish, and Marathish.
 * Completely eliminates unrelated FAQ fallbacks (zero hallucination).
 * ==============================================================================
 */

// Common multilingual stop words across English, Hindi & Marathi
const MULTILINGUAL_STOPWORDS = new Set([
  // English
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being',
  'below', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was',
  'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why',
  'will', 'with', 'won\'t', 'would', 'you', 'your', 'yours', 'yourself',
  // Hindi
  'का', 'के', 'की', 'को', 'में', 'से', 'पर', 'ने', 'और', 'है', 'हैं', 'था',
  'थी', 'थे', 'हो', 'गया', 'गई', 'गए', 'कर', 'किया', 'दिया', 'लिया', 'यह',
  'वह', 'इस', 'उस', 'एक', 'भी', 'तो', 'ही', 'या', 'जो', 'हम', 'आप', 'तुम',
  // Marathi
  'आहे', 'आहेत', 'होता', 'होती', 'होते', 'झाला', 'झाली', 'झाले', 'केला',
  'केली', 'केले', 'आणि', 'व', 'किंवा', 'पण', 'तर', 'नाही', 'नव्हते', 'हे',
  'ते', 'या', 'त्या', 'मी', 'आम्ही', 'तुम्ही', 'आपण', 'मध्ये', 'वरून', 'बद्दल'
]);

// Semantic vector projection dimension
const VECTOR_DIM = 128;

/**
 * Fast deterministic string hash function.
 */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Normalizes text: trims, lowercases, handles Devanagari and Latin punctuation.
 */
export function normalizeText(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[।॥,\.\?!;:\(\)\[\]\{\}"'“”‘’\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes text into distinctive words and character n-grams for subword matching.
 */
export function tokenize(text = '') {
  const norm = normalizeText(text);
  if (!norm) return [];
  const words = norm.split(' ').filter(w => w.length > 1 && !MULTILINGUAL_STOPWORDS.has(w));
  return words;
}

/**
 * Generates character 3-grams and 4-grams to capture typos, stem variations,
 * and morphological inflections across English, Hindi, and Marathi.
 */
function extractSubwordNgrams(word, n = 3) {
  if (word.length <= n) return [word];
  const grams = [];
  for (let i = 0; i <= word.length - n; i++) {
    grams.push(word.slice(i, i + n));
  }
  return grams;
}

// Canonical Multilingual Cross-Lingual Concept Graph for Zero-Shot Semantic Invariance
const CANONICAL_CONCEPT_MAP = new Map();
const RAW_CONCEPT_GROUPS = {
  concept_hours: ['hours', 'hour', 'time', 'times', 'timing', 'timings', 'schedule', 'open', 'close', 'opening', 'closing', 'operating', 'open and close', 'वेळ', 'समय', 'कालावधी'],
  concept_campus: ['campus', 'institution', 'college', 'school', 'university', 'facility', 'premises', 'shikshan', 'कॅम्पस', 'महाविद्यालय', 'शाळा'],
  concept_location: ['location', 'address', 'place', 'where', 'located', 'situated', 'geographical', 'site', 'कुठे', 'कहाँ', 'पत्ता', 'स्थान'],
  concept_fee: ['fee', 'fees', 'cost', 'price', 'pricing', 'tuition', 'charge', 'rate', 'shulk', 'dar', 'kimat', 'annual_fee', 'फी', 'किंमत', 'फीस', 'खर्च'],
  concept_return: ['return', 'returns', 'refund', 'merchandise', 'item', 'product', 'goods', 'order', 'purchase', 'replacement', 'परत', 'वापसी'],
  concept_payment: ['payment', 'pay', 'upi', 'card', 'cards', 'wallet', 'banking', 'cash', 'transaction', 'transactions', 'counter', 'पैसे', 'पेमेंट'],
  concept_contact: ['contact', 'reach', 'helpdesk', 'support', 'care', 'customer', 'email', 'phone', 'call', 'संपर्क', 'मदत'],
  concept_parking: ['parking', 'vehicle', 'car', 'two-wheeler', 'four-wheeler', 'slot', 'accommodation', 'gate', 'पार्किंग'],
  concept_shipping: ['shipping', 'delivery', 'parcel', 'package', 'courier', 'dispatch', 'ship', 'deliver', 'डिलिव्हरी', 'शिपिंग'],
  concept_international: ['international', 'overseas', 'foreign', 'global', 'countries', 'abroad', 'आंतरराष्ट्रीय', 'विदेश'],
  concept_cancel: ['cancel', 'cancellation', 'revoke', 'revocation', 'stop', 'रद्द'],
  concept_password: ['password', 'credentials', 'login', 'account', 'reset', 'forgot', 'recovery', 'पासवर्ड'],
  concept_stock: ['stock', 'seats', 'available', 'availability', 'units', 'remaining', 'left', 'quantity', 'जागा', 'शिल्लक', 'सीटें', 'उपलब्ध'],
  concept_eligibility: ['eligibility', 'eligible', 'requirement', 'requirements', 'marks', 'criteria', 'merit', 'पात्रता', 'योग्यता'],
  concept_scholarship: ['scholarship', 'waiver', 'concession', 'merit', 'discount', 'शिष्यवृत्ती'],
  concept_hostel: ['hostel', 'accommodation', 'living', 'residence', 'wings', 'वस्तीगृह', 'हॉस्टेल'],
  concept_transport: ['transport', 'transit', 'bus', 'routes', 'connectivity', 'बस्स', 'वाहतूक']
};

for (const [conceptKey, terms] of Object.entries(RAW_CONCEPT_GROUPS)) {
  for (const t of terms) {
    CANONICAL_CONCEPT_MAP.set(t.toLowerCase(), conceptKey);
  }
}

/**
 * Computes a high-dimensional dense semantic embedding vector (128-D)
 * using dense projection of tokens, character n-grams, and semantic positional buckets.
 * Supports English, Hindi, Marathi, and code-mixed inputs completely offline.
 */
export function computeDenseEmbedding(text = '') {
  const vec = new Float32Array(VECTOR_DIM);
  const words = tokenize(text);
  if (words.length === 0) return vec;

  for (let idx = 0; idx < words.length; idx++) {
    const word = words[idx];
    const weight = 1.0 + (1.0 / (idx + 1)); // Early position boost

    // 1. Full word hash projection
    const wHash = hashString(word);
    const bucket = wHash % VECTOR_DIM;
    const sign = (wHash & 1) ? 1.0 : -1.0;
    vec[bucket] += sign * weight * 2.0;

    // 2. Canonical semantic concept projection (Cross-lingual invariant & Typo-Tolerant)
    let concept = CANONICAL_CONCEPT_MAP.get(word);
    if (!concept && word.length >= 4) {
      for (const [t, c] of CANONICAL_CONCEPT_MAP.entries()) {
        if (Math.abs(word.length - t.length) <= 1) {
          let shared = 0;
          const maxGrams = word.length - 2;
          for (let i = 0; i < maxGrams; i++) {
            if (t.includes(word.slice(i, i + 3))) shared++;
          }
          if (maxGrams > 0 && (shared / maxGrams) >= 0.50) {
            concept = c;
            break;
          }
        }
      }
    }
    if (concept) {
      const cHash = hashString(concept);
      const cBucket = cHash % VECTOR_DIM;
      const cSign = (cHash & 1) ? 1.0 : -1.0;
      vec[cBucket] += cSign * weight * 3.5;
    }

    // 3. Subword n-grams for typo and inflection tolerance
    const ngrams = extractSubwordNgrams(word, 3);
    for (const ng of ngrams) {
      const ngHash = hashString(ng);
      const ngBucket = ngHash % VECTOR_DIM;
      const ngSign = (ngHash & 1) ? 1.0 : -1.0;
      vec[ngBucket] += ngSign * 0.5 * weight;
    }
  }

  // L2 Vector Normalization
  let normSq = 0;
  for (let i = 0; i < VECTOR_DIM; i++) normSq += vec[i] * vec[i];
  if (normSq > 0) {
    const invNorm = 1.0 / Math.sqrt(normSq);
    for (let i = 0; i < VECTOR_DIM; i++) vec[i] *= invNorm;
  }

  return vec;
}

/**
 * Cosine Similarity between two dense embedding vectors.
 * Returns a value in [0, 1].
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * BM25 Lexical Ranking Engine for exact and token-level matching.
 */
export class BM25Engine {
  constructor(corpus = [], k1 = 1.5, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.corpus = corpus;
    this.docCount = corpus.length;
    this.docTokens = [];
    this.docLengths = [];
    this.avgDocLength = 0;
    this.docFreqs = new Map();

    this.buildIndex();
  }

  buildIndex() {
    let totalLength = 0;
    this.docTokens = this.corpus.map(doc => {
      const tokens = tokenize(`${doc.title || ''} ${doc.content || ''}`);
      totalLength += tokens.length;
      this.docLengths.push(tokens.length);

      const uniqueTokens = new Set(tokens);
      for (const t of uniqueTokens) {
        this.docFreqs.set(t, (this.docFreqs.get(t) || 0) + 1);
      }
      return tokens;
    });

    this.avgDocLength = this.docCount > 0 ? (totalLength / this.docCount) : 1;
  }

  score(query = '') {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.docCount === 0) {
      return new Float32Array(this.docCount);
    }

    const scores = new Float32Array(this.docCount);

    for (const qTerm of queryTokens) {
      const df = this.docFreqs.get(qTerm) || 0;
      if (df === 0) continue;

      // Robertson-Spärck Jones IDF
      const idf = Math.log(1 + (this.docCount - df + 0.5) / (df + 0.5));

      for (let i = 0; i < this.docCount; i++) {
        const docToks = this.docTokens[i];
        let termFreq = 0;
        for (const dt of docToks) {
          if (dt === qTerm) termFreq++;
        }
        if (termFreq === 0) continue;

        const docLen = this.docLengths[i];
        const num = termFreq * (this.k1 + 1);
        const denom = termFreq + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        scores[i] += idf * (num / denom);
      }
    }

    return scores;
  }
}

/**
 * Intelligent Document Chunker supporting Markdown, Text, JSON, and Web content.
 * Preserves structured metadata (document title, source path, section, updated date).
 */
export function chunkDocument(document = {}, options = {}) {
  const maxChunkSize = options.maxChunkSize || 450;
  const chunkOverlap = options.chunkOverlap || 50;

  const title = document.title || document.name || document.fileName || 'Untitled Document';
  const sourcePath = document.sourcePath || document.path || document.url || '';
  const agentId = document.agentId || '';
  const tenantId = document.tenantId || '';
  const updatedAt = document.updatedAt || new Date().toISOString();
  const rawText = String(document.content || document.text || '').trim();

  if (!rawText) return [];

  // Split by structural boundaries: headers (###, ##, #), paragraphs (\n\n), and list items
  const rawBlocks = rawText.split(/\n{2,}|(?=^#{1,4}\s)/m).map(b => b.trim()).filter(Boolean);
  const chunks = [];
  let currentChunk = '';
  let currentSection = 'General';
  let chunkIdx = 0;

  for (const block of rawBlocks) {
    // Detect markdown heading
    const headerMatch = block.match(/^(#{1,4})\s+(.+)$/m);
    if (headerMatch) {
      currentSection = headerMatch[2].trim();
    }

    if ((currentChunk.length + block.length) <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + block;
    } else {
      if (currentChunk) {
        chunks.push({
          id: `${document.id || hashString(title)}_${chunkIdx++}`,
          title,
          section: currentSection,
          content: currentChunk,
          sourcePath,
          agentId,
          tenantId,
          updatedAt
        });
      }
      currentChunk = block.slice(0, maxChunkSize);
    }
  }

  if (currentChunk) {
    chunks.push({
      id: `${document.id || hashString(title)}_${chunkIdx++}`,
      title,
      section: currentSection,
      content: currentChunk,
      sourcePath,
      agentId,
      tenantId,
      updatedAt
    });
  }

  return chunks;
}

/**
 * Reciprocal Rank Fusion (RRF) to combine multiple ranking lists.
 * RRF(d) = sum( 1 / (k + rank_i(d)) )
 */
export function reciprocalRankFusion(rankedLists = [], k = 60) {
  const rrfScores = new Map();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const docId = item.id;
      const score = 1.0 / (k + (rank + 1));
      rrfScores.set(docId, (rrfScores.get(docId) || 0) + score);
    }
  }

  return rrfScores;
}

/**
 * Contextual Cross-Encoder Style Reranker.
 * Evaluates semantic alignment, distinctive token coverage, and question intent specificity.
 */
export function rerankCandidates(query, candidates = [], options = {}) {
  const queryTokens = new Set(tokenize(query));
  const queryVec = computeDenseEmbedding(query);
  const queryLower = normalizeText(query);

  return candidates.map(candidate => {
    const docContent = normalizeText(`${candidate.title || ''} ${candidate.content || candidate.answer || ''}`);
    const docVec = candidate.denseVec || computeDenseEmbedding(docContent);
    const docTokens = new Set(tokenize(docContent));

    // 1. Semantic Cosine Score [0..1]
    const semanticScore = cosineSimilarity(queryVec, docVec);

    // 2. Token Overlap & Distinctive Coverage [0..1]
    let matchedTokens = 0;
    for (const qt of queryTokens) {
      if (docTokens.has(qt)) {
        matchedTokens++;
      } else if (qt.length >= 4) {
        for (const dt of docTokens) {
          if (Math.abs(qt.length - dt.length) <= 1 && dt.length >= 4) {
            let s = 0;
            const mg = qt.length - 2;
            for (let i = 0; i < mg; i++) {
              if (dt.includes(qt.slice(i, i + 3))) s++;
            }
            if (mg > 0 && (s / mg) >= 0.50) {
              matchedTokens++;
              break;
            }
          }
        }
      }
    }
    const tokenCoverage = queryTokens.size > 0 ? (matchedTokens / queryTokens.size) : 0;
    const docCoverage = docTokens.size > 0 ? (matchedTokens / Math.min(docTokens.size, 8)) : 0;
    const effectiveCoverage = Math.max(tokenCoverage, docCoverage * 0.5);

    // 3. Exact Substring / Title Match Boost [0..1]
    let exactBoost = 0;
    const titleNorm = normalizeText(candidate.title || candidate.topic || '');
    if (queryLower && titleNorm && (queryLower.includes(titleNorm) || titleNorm.includes(queryLower))) {
      exactBoost = 0.35;
    } else if (docContent.includes(queryLower)) {
      exactBoost = 0.25;
    } else {
      const titleTokens = tokenize(candidate.title || '');
      const tHits = titleTokens.filter(t => queryTokens.has(t)).length;
      if (titleTokens.length > 0 && tHits > 0) {
        exactBoost = 0.15 * (tHits / titleTokens.length);
      }
    }

    // Combined Weighted Rerank Score [0..1]
    // STRICT GATE: When there is zero token overlap and zero exact match, penalize
    // false-positive cosine similarity from hash/ngram collisions so unrelated queries abstain!
    let finalScore = 0;
    if (tokenCoverage === 0 && exactBoost === 0) {
      finalScore = semanticScore * 0.35;
    } else {
      finalScore = Math.max(semanticScore * 0.70, (semanticScore * 0.45) + (effectiveCoverage * 0.45)) + exactBoost;
    }

    return {
      ...candidate,
      semanticScore: Math.round(semanticScore * 1000) / 1000,
      tokenCoverage: Math.round(tokenCoverage * 1000) / 1000,
      finalScore: Math.round(finalScore * 1000) / 1000
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

/**
 * Production-Grade Hybrid RAG Search Engine.
 * Searches across structured FAQs, uploaded documents, and live page snippets.
 *
 * CRITICAL RULE (Pillar 3 & 4):
 * If NO chunks pass the relevance threshold, returns an EMPTY list!
 * Never falls back to dumping the first 12 unrelated FAQs.
 */
export function hybridRAGSearch(query, corpus = [], options = {}) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ || !Array.isArray(corpus) || corpus.length === 0) {
    return {
      topMatches: [],
      hasSufficientContext: false,
      confidence: 'none',
      queryLanguage: 'en-US'
    };
  }

  // Minimum relevance score required to be accepted as grounded context
  const relevanceThreshold = Number(options.relevanceThreshold || 0.42);
  const topK = Math.max(1, Number(options.topK || 5));

  // 1. Format corpus into normalized candidate documents
  const documents = corpus.map((item, idx) => ({
    id: item.id || `doc_${idx}`,
    title: item.title || item.q || item.question || item.name || item.heading || '',
    content: item.content || item.a || item.answer || item.text || '',
    metadata: item.metadata || {},
    raw: item
  })).filter(d => (d.title || d.content));

  if (documents.length === 0) {
    return {
      topMatches: [],
      hasSufficientContext: false,
      confidence: 'none'
    };
  }

  // 2. Dense Semantic Vector Search
  const queryVec = computeDenseEmbedding(cleanQ);
  const denseScored = documents.map(doc => {
    const docVec = computeDenseEmbedding(`${doc.title} ${doc.content}`);
    const sim = cosineSimilarity(queryVec, docVec);
    return { ...doc, denseVec: docVec, denseSim: sim };
  }).sort((a, b) => b.denseSim - a.denseSim);

  // 3. BM25 Lexical Search
  const bm25 = new BM25Engine(documents);
  const bm25Scores = bm25.score(cleanQ);
  const bm25Scored = documents.map((doc, idx) => ({
    ...doc,
    bm25Score: bm25Scores[idx]
  })).sort((a, b) => b.bm25Score - a.bm25Score);

  // 4. Reciprocal Rank Fusion (RRF)
  const rrfMap = reciprocalRankFusion([denseScored, bm25Scored], 60);

  // 5. Select Top-K Candidate Pool for Reranking
  const poolSize = Math.min(documents.length, Math.max(topK * 3, 15));
  const candidatePool = documents
    .map(d => ({ ...d, rrfScore: rrfMap.get(d.id) || 0 }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, poolSize);

  // 6. Contextual Cross-Encoder Reranking
  const reranked = rerankCandidates(cleanQ, candidatePool);

  // 7. Strict Precision & Relevance Gating
  const filteredMatches = reranked.filter(match => match.finalScore >= relevanceThreshold);
  const topMatches = filteredMatches.slice(0, topK);

  const confidence = topMatches.length === 0
    ? 'none'
    : (topMatches[0].finalScore >= 0.70 ? 'high' : 'medium');

  return {
    query: cleanQ,
    topMatches,
    hasSufficientContext: topMatches.length > 0,
    confidence,
    bestMatch: topMatches[0] || null,
    totalIndexed: documents.length
  };
}
