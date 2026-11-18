/**
 * Adaptive Question Understanding, Complexity-Driven Answer Depth,
 * Multi-Part Decomposition & Universal Primary + Related Section Navigation Engine.
 */

import { fuzzyTokenMatch, NLU_STOPWORDS } from './fuzzyNlu.js';
import { isUnclearOrAmbiguousQuery, isGeneralOffTopicQuery } from './questionRelevanceRouter.js';

const TECHNICAL_SIGNAL_RE = /\b(architecture|api|apis|endpoint|endpoints|route|routes|middleware|jwt|oauth|auth|authentication|authorization|database|schema|foreign\s+key|primary\s+key|sql|nosql|prisma|mongoose|firestore|supabase|graphql|rest|webhook|websocket|async|await|promise|closure|react|hook|useeffect|usestate|redux|zustand|state\s+management|component|dom|ssr|csr|cors|csrf|xss|encryption|hashing|index|indexing|query|optimization|algorithm|complexity|dependency|dependencies|circular|docker|ci\/cd|deployment|pipeline|backend|frontend|server|controller|service|protocol|http|https|tcp|dns)\b/i;

const DETAILED_SIGNAL_RE = /\b(explain|describe|elaborate|walk\s+me\s+through|step\s+by\s+step|in\s+detail|detailed|comprehensive|thorough|everything\s+about|full\s+details|complete\s+guide|how\s+does|how\s+do|why\s+does|why\s+is|break\s+down|overview|with\s+examples?|give\s+(?:me\s+)?(?:an\s+)?examples?|pros\s+and\s+cons|advantages|benefits|workflow|process|procedure)\b/i;

const FOLLOW_UP_REF_RE = /\b(that|this|it|them|those|these|the\s+same|previous|above|earlier|more\s+about|tell\s+me\s+more|go\s+deeper|elaborate|in\s+more\s+detail|give\s+(?:me\s+)?(?:an\s+)?example|what\s+else|anything\s+else|how\s+about\s+the\s+(?:second|third|next|other|first)|where\s+(?:is|can\s+i\s+find)\s+(?:that|this|it))\b/i;

const MULTI_ASPECT_NOUNS_RE = /\b(fee|fees|fee\s+structure|price|pricing|cost|eligibility|criteria|documents?|syllabus|curriculum|subjects?|timings?|hours|schedule|admission|process|procedure|steps?|scholarship|facilities|hostel|placement|contact|warranty|shipping|delivery|returns?|refund|ingredients?|calories|amenities|check-?in|check-?out|features?|specs|specifications|architecture|routes?|middleware|schema|relationships?|dependencies|diagnostics?|errors?|coverage)\b/i;

const LINK_STOPWORDS = new Set([
  ...NLU_STOPWORDS,
  'show', 'take', 'open', 'jump', 'navigate', 'go', 'view', 'see', 'find', 'tell', 'give',
  'explain', 'detail', 'details', 'please', 'section', 'page', 'website', 'site', 'more', 'about',
  'help', 'want', 'need', 'know', 'would', 'like', 'there', 'here', 'their', 'which', 'where'
]);

/**
 * Decomposes complex multi-part and comma-separated multi-aspect questions into
 * clean individual sub-questions while preserving "compare X and Y" intact.
 */
export function decomposeComplexQuestion(rawQuery = '') {
  const str = String(rawQuery || '').replace(/\s+/g, ' ').trim();
  if (!str || str.length < 14) return [str].filter(Boolean);

  // Preserve single comparison queries intact ("compare A and B", "difference between A and B")
  if (/\b(compare|comparison|difference\s+between|versus|\bvs\.?\b|between\s+\S+\s+and\s+\S+)\b/i.test(str) && !/\?\s*\S/.test(str)) {
    return [str];
  }

  // 1. Multiple explicit question-mark sentences ("What is X? And how do I Y?")
  if (str.includes('?')) {
    const qParts = str
      .split(/\?\s+/)
      .map(s => s.replace(/^(?:and|also|plus|then)\s+/i, '').trim())
      .filter(s => s.length >= 6);
    if (qParts.length >= 2) {
      return qParts.slice(0, 4).map(p => (p.endsWith('?') ? p : `${p}?`));
    }
  }

  // 2. Sequential / compound conjunction split ("... and how ...", "..., and also ...", "first ... then ...")
  const seqParts = str
    .split(/(?:\s*,?\s*\band\s+also\b\s*|\s*;\s*(?:also\s+)?|\s*,?\s*\band\s+(?=(?:how|what|which|where|when|who|why|can|do|does|is|are|explain|show|list|tell|check|verify|give|trace|compare|summarize)\b)|\s+\balso\s+(?=(?:how|what|which|where|when|explain|show|list|tell|check|trace)\b)|\s+\bthen\s+(?=(?:explain|show|tell|how|what)\b))/i)
    .map(s => s.replace(/^(?:first|firstly)\s+/i, '').trim())
    .filter(s => s.length >= 6);
  if (seqParts.length >= 2) {
    return seqParts.slice(0, 4);
  }

  // 3. Comma-separated multi-aspect queries carrying a shared subject:
  //    e.g. "Explain the fee structure, eligibility criteria, and documents needed for Class 11 Science"
  const aspectMatch = str.match(/^(?:(?:please\s+)?(?:explain|tell\s+me\s+about|give\s+me|what\s+are|share|describe|list|show)\s+(?:the\s+)?)?(.+?,\s*.+?\s+and\s+.+?)(?:\s+(for|of|in|about|on)\s+(.+?))?[?.!]*$/i);
  if (aspectMatch) {
    const listSegment = aspectMatch[1] || '';
    const prep = aspectMatch[2] || '';
    const sharedSubject = (aspectMatch[3] || '').trim();
    const rawItems = listSegment
      .split(/,\s*(?:and\s+)?|\s+and\s+/i)
      .map(s => s.replace(/^(?:the|a|an|all)\s+/i, '').trim())
      .filter(s => s.length >= 3 && s.length <= 55);

    const aspectHits = rawItems.filter(item => MULTI_ASPECT_NOUNS_RE.test(item));
    if (rawItems.length >= 2 && aspectHits.length >= 2) {
      return rawItems.slice(0, 4).map(item =>
        sharedSubject ? `${item} ${prep} ${sharedSubject}` : item
      );
    }
  }

  return [str];
}

/**
 * Resolves follow-up context, classifies question complexity & intent, and builds
 * an adaptive depth directive + required-parts checklist for the AI.
 */
export function analyzeQuestionUnderstanding(rawQuery = '', context = null, history = [], opts = {}) {
  const clean = String(rawQuery || '').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();
  const catalogItems = Array.isArray(opts.catalogItems) ? opts.catalogItems : [];

  // 1. Check Unclear / Ambiguous first
  if (isUnclearOrAmbiguousQuery(clean, context)) {
    return {
      mode: 'unclear',
      expandedQuery: clean,
      requiredParts: [],
      isFollowUp: false,
      resolvedAnchor: '',
      wantsExamples: false,
      wantsStepByStep: false,
      recommendedMaxTokens: 500,
      depthDirective: 'The question is unclear or ambiguous. Politely ask a clear, friendly clarifying question instead of guessing.'
    };
  }

  // 2. Follow-Up Context Anchor Expansion (activeItem -> activeTopic -> recent conversation turn)
  let resolvedAnchor = '';
  if (context?.activeItem?.name) {
    resolvedAnchor = String(context.activeItem.name).trim();
  } else if (context?.activeTopic && !['catalog_list', 'pricing', 'unclear'].includes(context.activeTopic)) {
    resolvedAnchor = String(context.activeTopic).trim();
  } else if (Array.isArray(history) && history.length > 0) {
    const prevUsers = history
      .filter(m => (m?.role === 'user' || m?.sender === 'user') && String(m.content || m.text || '').trim() !== clean)
      .slice(-3);
    const lastSubstantive = [...prevUsers].reverse().find(m => String(m.content || m.text || '').trim().length >= 8);
    if (lastSubstantive) {
      resolvedAnchor = String(lastSubstantive.content || lastSubstantive.text || '').trim().slice(0, 90);
    }
  }

  const isFollowUp = Boolean(resolvedAnchor && FOLLOW_UP_REF_RE.test(lower) && clean.length < 140);
  const expandedQuery = (isFollowUp && resolvedAnchor && !lower.includes(resolvedAnchor.toLowerCase()))
    ? `${clean} (regarding: ${resolvedAnchor})`
    : clean;

  // 3. Decompose multi-part / multi-aspect questions
  const requiredParts = decomposeComplexQuestion(clean);
  const isMultiPart = requiredParts.length >= 2;
  const isTechnical = TECHNICAL_SIGNAL_RE.test(expandedQuery);
  const wantsExamples = /\b(example|examples|sample|illustration|for\s+instance|e\.g\.)\b/i.test(lower);
  const wantsStepByStep = /\b(step\s+by\s+step|steps|procedure|process|how\s+to|walk\s+me\s+through|guide)\b/i.test(lower);
  const isDetailedAsk = DETAILED_SIGNAL_RE.test(lower) || wantsExamples || wantsStepByStep || clean.split(/\s+/).length >= 11;
  const isGeneralOffTopic = isGeneralOffTopicQuery(clean, { catalogItems });

  let mode = 'simple';
  let recommendedMaxTokens = 1000;
  let depthDirective = 'SIMPLE / DIRECT QUESTION: Provide a clear, polite, direct, and accurate answer addressing the exact question with helpful context and next steps.';

  if (isMultiPart) {
    mode = 'complex_multi_part';
    recommendedMaxTokens = 1500;
    depthDirective = `COMPLEX MULTI-PART QUESTION (${requiredParts.length} PARTS): You MUST thoroughly address EVERY SINGLE part below in clear logical order without skipping any part: ${requiredParts.map((p, i) => `(${i + 1}) ${p}`).join('; ')}. Include relevant specifics, steps, or examples for each part.`;
  } else if (isTechnical) {
    mode = 'technical';
    recommendedMaxTokens = 1500;
    depthDirective = `TECHNICAL QUESTION: Provide a comprehensive, accurate technical explanation covering how the relevant components/concepts work, step-by-step data or execution flow, concrete examples${wantsExamples ? ' (explicitly requested by user)' : ''}, and important details or caveats.`;
  } else if (isDetailedAsk) {
    mode = 'detailed';
    recommendedMaxTokens = 1400;
    depthDirective = `DETAILED EXPLANATION REQUESTED: Provide a complete, well-structured, polite, and thorough explanation including key specifics, ${wantsStepByStep ? 'clear step-by-step instructions, ' : ''}${wantsExamples ? 'concrete examples, ' : ''}practical details, and helpful next steps — do NOT give a brief 1-line summary.`;
  } else if (isGeneralOffTopic) {
    mode = 'general_off_topic';
    recommendedMaxTokens = 1200;
    depthDirective = 'GENERAL KNOWLEDGE / OFF-TOPIC QUESTION: Answer accurately, politely, and clearly using your verified knowledge without forcing unrelated project or website content. If you do not know reliably, politely apologize and invite another question.';
  } else if (isFollowUp) {
    mode = 'follow_up';
    recommendedMaxTokens = 1300;
    depthDirective = `FOLLOW-UP QUESTION (ANCHORED TO: "${resolvedAnchor}"): Use the prior conversation context directly without asking the user to repeat themselves, and provide a thorough, specific answer building on what was already discussed.`;
  }

  return {
    mode,
    expandedQuery,
    requiredParts,
    isFollowUp,
    resolvedAnchor,
    wantsExamples,
    wantsStepByStep,
    isGeneralOffTopic,
    recommendedMaxTokens,
    depthDirective
  };
}

function tokenizeForLinks(str = '') {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !LINK_STOPWORDS.has(w));
}

function scoreLinkCandidate(queryTokens, replyTokens, fields = []) {
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  if (!hay) return { primaryScore: 0, replyScore: 0, matchedQueryCount: 0 };
  const hayWords = hay.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2);

  let primaryScore = 0;
  let matchedQueryCount = 0;
  for (const t of queryTokens) {
    if (hayWords.includes(t)) {
      primaryScore += 10;
      matchedQueryCount++;
    } else if (hay.includes(t) && t.length >= 4) {
      primaryScore += 7;
      matchedQueryCount++;
    } else if (hayWords.some(hw => hw.length >= 4 && fuzzyTokenMatch(t, hw) >= 2)) {
      primaryScore += 5;
      matchedQueryCount++;
    }
  }

  let replyScore = 0;
  for (const rt of replyTokens) {
    if (hayWords.includes(rt)) replyScore += 3;
    else if (hay.includes(rt) && rt.length >= 5) replyScore += 2;
  }

  return { primaryScore, replyScore, matchedQueryCount };
}

/**
 * Universal Primary + Related Clickable Section Link Resolver.
 * Scans siteBlueprint (sections, forms, routes), frontendIntelligence (pages, charts, dashboards, report tables),
 * and optional live DOM sections to return 1 Primary Direct Link + up to 2 Related Reference Links!
 */
export function findRelevantSectionLinks(query = '', replyText = '', sources = {}, options = {}) {
  const { maxLinks = 3, isGeneralOffTopic = false, isUnclear = false, currentPath = '/' } = options;
  if (!query || isGeneralOffTopic || isUnclear) return [];

  const queryTokens = Array.from(new Set(tokenizeForLinks(query))).slice(0, 14);
  const replyTokens = Array.from(new Set(tokenizeForLinks(replyText))).slice(0, 16);
  if (queryTokens.length === 0 && replyTokens.length === 0) return [];

  const blueprint = sources?.siteBlueprint || null;
  const feIdx = sources?.frontendIntelligence || blueprint?.frontendIndex || null;
  const liveDomSections = Array.isArray(sources?.liveDomSections) ? sources.liveDomSections : [];

  const normCurr = String(currentPath || '/').toLowerCase().replace(/\/index\.html?$/, '/') || '/';
  const candidates = [];

  // 1. Blueprint Sections (#id or /page#id)
  if (Array.isArray(blueprint?.sections)) {
    for (const s of blueprint.sections) {
      const label = String(s.label || s.id || '').trim();
      const href = s.href || (s.id ? `#${s.id}` : '');
      if (!label || !href) continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, s.id, s.excerpt, ...(s.keywords || [])]);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 7 || total >= 12) {
        const sPath = String(s.path || '/').toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        const isCrossPage = Boolean(s.path && sPath !== '/' && sPath !== normCurr);
        candidates.push({
          label,
          href,
          sectionId: s.id || '',
          redirectUrl: isCrossPage ? href : null,
          isCrossPage,
          targetType: 'section',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
  }

  // 2. Blueprint Forms
  if (Array.isArray(blueprint?.forms)) {
    for (const f of blueprint.forms) {
      const label = String(f.title || f.label || f.id || '').trim();
      const secId = f.sectionId || f.id || '';
      const href = f.href || (secId ? `#${secId}` : '');
      if (!label || !href) continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, f.id, f.submitLabel, ...(f.fields || []), ...(f.keywords || []), 'form apply register inquiry contact']);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 7 || total >= 12) {
        const fPath = String(f.path || '/').toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        const isCrossPage = Boolean(f.path && fPath !== '/' && fPath !== normCurr);
        candidates.push({
          label,
          href,
          sectionId: secId,
          redirectUrl: isCrossPage ? href : null,
          isCrossPage,
          targetType: 'form',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
  }

  // 3. Blueprint Routes / Pages
  if (Array.isArray(blueprint?.routes)) {
    for (const r of blueprint.routes) {
      const label = String(r.label || r.path || '').trim();
      const href = r.path || '';
      if (!label || !href || href === '/') continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, href, r.file, ...(r.keywords || [])]);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 7 || total >= 12) {
        const rPath = href.toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        candidates.push({
          label,
          href,
          sectionId: '',
          redirectUrl: href,
          isCrossPage: rPath !== normCurr,
          targetType: 'page',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
  }

  // 4. Frontend Dashboards, Charts & Report Tables
  if (feIdx) {
    const pages = Array.isArray(feIdx.pages) ? feIdx.pages : [];
    for (const p of pages) {
      const label = String(p.pageLabel || p.pagePath || '').trim();
      const href = p.pagePath || '/';
      if (!label) continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, href, p.summary]);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 7 || total >= 12) {
        const pNorm = href.toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        candidates.push({
          label,
          href,
          sectionId: '',
          redirectUrl: pNorm !== normCurr ? href : null,
          isCrossPage: pNorm !== normCurr,
          targetType: /dashboard|report|analytics|chart/i.test(`${label} ${href}`) ? 'dashboard' : 'page',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
    for (const ch of (feIdx.charts || [])) {
      const label = String(ch.title || '').trim();
      const href = ch.pagePath || '/';
      if (!label) continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, ch.summary, ch.pageLabel, 'chart graph trend']);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 8 || total >= 14) {
        const pNorm = href.toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        candidates.push({
          label: ch.pageLabel && ch.pageLabel !== label ? `${label} (${ch.pageLabel})` : label,
          href,
          sectionId: ch.sectionId || '',
          redirectUrl: pNorm !== normCurr ? href : null,
          isCrossPage: pNorm !== normCurr,
          targetType: 'dashboard',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
    for (const tbl of (feIdx.reportTables || [])) {
      const label = String(tbl.title || '').trim();
      const href = tbl.pagePath || '/';
      if (!label) continue;
      const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, tbl.summary, tbl.pageLabel, ...(tbl.headers || []), 'report table']);
      const total = sc.primaryScore + Math.min(sc.replyScore, 9);
      if (sc.primaryScore >= 8 || total >= 14) {
        const pNorm = href.toLowerCase().replace(/\/index\.html?$/, '/') || '/';
        candidates.push({
          label: tbl.pageLabel && tbl.pageLabel !== label ? `${label} (${tbl.pageLabel})` : label,
          href,
          sectionId: tbl.sectionId || '',
          redirectUrl: pNorm !== normCurr ? href : null,
          isCrossPage: pNorm !== normCurr,
          targetType: 'report',
          score: total,
          primaryScore: sc.primaryScore
        });
      }
    }
  }

  // 5. Optional Live DOM Sections
  for (const domSec of liveDomSections) {
    const label = String(domSec.label || domSec.id || '').trim();
    const secId = domSec.id || '';
    if (!label || !secId) continue;
    const sc = scoreLinkCandidate(queryTokens, replyTokens, [label, secId, domSec.textPreview || '']);
    const total = sc.primaryScore + Math.min(sc.replyScore, 9);
    if (sc.primaryScore >= 7 || total >= 12) {
      candidates.push({
        label,
        href: `#${secId}`,
        sectionId: secId,
        redirectUrl: null,
        isCrossPage: false,
        targetType: domSec.targetType || 'section',
        element: domSec.element || null,
        sectionInfo: domSec.element ? domSec : null,
        score: total + 2,
        primaryScore: sc.primaryScore
      });
    }
  }

  candidates.sort((a, b) => (b.primaryScore - a.primaryScore) || (b.score - a.score));

  const selected = [];
  const seenKeys = new Set();
  for (const c of candidates) {
    const dedupeKey = `${(c.sectionId || c.href || '').toLowerCase()}::${c.label.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const hrefKey = (c.href || '').toLowerCase();
    if (seenKeys.has(dedupeKey) || (hrefKey && hrefKey !== '/' && seenKeys.has(`href::${hrefKey}`))) continue;
    seenKeys.add(dedupeKey);
    if (hrefKey && hrefKey !== '/') seenKeys.add(`href::${hrefKey}`);

    selected.push({
      ...c,
      role: selected.length === 0 ? 'primary' : 'related'
    });
    if (selected.length >= maxLinks) break;
  }

  return selected;
}

/**
 * Formats clickable markdown section links for Studio / text responses.
 */
export function formatSectionLinksMarkdown(links = []) {
  if (!Array.isArray(links) || links.length === 0) return '';
  const items = links.slice(0, 3).map(l => `[${l.label}](${l.href || (l.sectionId ? `#${l.sectionId}` : '/')})`);
  return `Relevant sections: ${items.join(' · ')}`;
}
