/**
 * Maximum Answer Accuracy, Cross-Source Verification, Hallucination Audit Gate,
 * Technical Implementation Validator, Consistency Ledger & Continuous Telemetry Engine (Pillar 7).
 */

import { parseNumericPrice, buildHonestUncertaintyReply } from './dataAnalyticsEngine.js';
import { fuzzyMatchRecord } from './fuzzyNlu.js';

const AUDIT_STORAGE_KEY = 'echo_accuracy_audit_v1';
const MAX_AUDIT_EVENTS = 100;
const CONSISTENCY_MAX_ENTRIES = 80;

let inMemoryAuditEvents = [];
const consistencyLedger = new Map();

function normalizePhoneDigits(raw = '') {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeEndpointPath(raw = '') {
  const clean = String(raw || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return clean.toLowerCase() || '/';
}

function routeMatchesVerified(citedPath, verifiedRoutes = []) {
  const c = normalizeEndpointPath(citedPath);
  if (!c || c === '/') return true;
  for (const vr of verifiedRoutes) {
    const r = normalizeEndpointPath(vr);
    if (c === r) return true;
    const pattern = '^' + r
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:([a-z0-9_]+)/gi, '[^/]+')
      .replace(/\\\{([a-z0-9_]+)\\\}/gi, '[^/]+')
      .replace(/<([a-z0-9_:]+)>/gi, '[^/]+') + '$';
    try {
      if (new RegExp(pattern, 'i').test(c)) return true;
    } catch (_) {}
  }
  return false;
}

function extractCurrencyMentions(text = '') {
  const str = String(text || '');
  const matches = [];
  const re = /(?:₹|rs\.?\s*|inr\s*|\$|€|£)\s*(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|cr|crore|m|million)?\b/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const parsed = parseNumericPrice(m[0]);
    if (parsed && Number.isFinite(parsed.value)) {
      matches.push({
        raw: m[0].trim(),
        value: parsed.value,
        currency: parsed.currency,
        index: m.index
      });
    }
  }
  return matches;
}

function extractContactMentions(text = '') {
  const str = String(text || '');
  const emails = Array.from(new Set(
    (str.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []).map(e => e.toLowerCase())
  ));
  const rawPhones = str.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4,6}/g) || [];
  const phones = [];
  for (const rp of rawPhones) {
    const digits = normalizePhoneDigits(rp);
    // Avoid matching prices, years, dates, or small counts — real phone numbers have 10–13 digits
    if (digits.length >= 10 && digits.length <= 13 && !/^20\d{2}/.test(digits)) {
      phones.push({ raw: rp.trim(), digits });
    }
  }
  return { emails, phones };
}

function fastStringHash(str = '') {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Computes a deterministic data freshness version hash across catalog, KB, frontend, and project index.
 * Any update to live data automatically invalidates prior consistency-ledger entries!
 */
export function computeDataVersionHash(sources = {}) {
  const catSig = (Array.isArray(sources.catalogItems) ? sources.catalogItems : [])
    .slice(0, 60)
    .map(i => `${i?.name || ''}|${i?.price || ''}|${i?.stock ?? ''}`)
    .join(';');
  const kbSig = (Array.isArray(sources.knowledgeBase) ? sources.knowledgeBase : [])
    .slice(0, 40)
    .map(k => `${k?.q || ''}|${String(k?.a || '').slice(0, 40)}`)
    .join(';');
  const idxSig = sources.deepProjectIndex?.indexedAt || sources.deepProjectIndex?.totalFiles || '';
  const domSig = sources.liveDomVersion ?? '';
  return fastStringHash(`${catSig}#${kbSig}#${idxSig}#${domSig}`);
}

/**
 * Cross-verifies facts across multiple project & website sources using a strict authority hierarchy:
 * Live DOM / Live API > Verified Database Records > Deep Project Index > Frontend Snapshot > Knowledge Base FAQs.
 */
export function crossVerifyProjectSources(sources = {}) {
  const {
    catalogItems = [],
    knowledgeBase = [],
    frontendIndex = null,
    liveFrontendSnapshot = null,
    deepProjectIndex = null,
    projectArch = null,
    hostKnowledge = null,
    promptContext = ''
  } = sources || {};

  const safeCatalog = Array.isArray(catalogItems) ? catalogItems.filter(Boolean) : [];
  const safeKb = Array.isArray(knowledgeBase) ? knowledgeBase.filter(Boolean) : [];

  // 1. Authoritative Catalog Prices & Stock (Tier 1/2 Authority)
  const authoritativeItems = new Map();
  const allVerifiedPriceValues = new Set();
  for (const item of safeCatalog) {
    const name = String(item.name || item.title || item.product || '').trim();
    if (!name) continue;
    const rawPriceStr = item.price ? String(item.price).trim() : '';
    const isPercentNotPrice = /%\s*$/.test(rawPriceStr) && !/[₹$€£]|rs\.?|inr|usd/i.test(rawPriceStr);
    const parsedPrice = (!isPercentNotPrice && rawPriceStr) ? parseNumericPrice(rawPriceStr) : null;
    const stockNum = (item.stock !== null && item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock)))
      ? Number(item.stock)
      : null;
    if (parsedPrice && Number.isFinite(parsedPrice.value)) {
      allVerifiedPriceValues.add(parsedPrice.value);
    }
    authoritativeItems.set(name.toLowerCase(), {
      name,
      rawPrice: isPercentNotPrice ? '' : rawPriceStr,
      priceValue: parsedPrice ? parsedPrice.value : null,
      currency: parsedPrice ? parsedPrice.currency : '',
      stock: stockNum,
      unit: item.unit || 'units',
      description: String(item.description || item.details || item.dosage || '').trim(),
      item
    });
  }

  // Also collect verified numbers from live frontend metrics/tables & KB
  const verifiedMetricNumbers = new Set();
  const allFeMetrics = [...(liveFrontendSnapshot?.metrics || []), ...(frontendIndex?.metrics || [])];
  for (const m of allFeMetrics) {
    const p = parseNumericPrice(m?.value);
    if (p && Number.isFinite(p.value)) verifiedMetricNumbers.add(p.value);
  }
  for (const tbl of [...(liveFrontendSnapshot?.reportTables || []), ...(frontendIndex?.reportTables || [])]) {
    for (const c of extractCurrencyMentions(tbl?.summary || '')) {
      verifiedMetricNumbers.add(c.value);
    }
    for (const row of (tbl?.rows || [])) {
      const rowStr = typeof row === 'object' ? Object.values(row || {}).join(' ') : String(row || '');
      for (const c of extractCurrencyMentions(rowStr)) {
        verifiedMetricNumbers.add(c.value);
      }
    }
  }

  // 2. Cross-Source Conflict Detection: KB FAQ vs Authoritative Live Catalog / DB
  const conflicts = [];
  for (const faq of safeKb) {
    const qAndA = `${faq.q || ''} ${faq.a || ''}`;
    const qAndALower = qAndA.toLowerCase();
    const faqPrices = extractCurrencyMentions(faq.a || '');
    if (faqPrices.length === 0) continue;

    for (const [keyLower, auth] of authoritativeItems.entries()) {
      if (auth.priceValue === null) continue;
      if (qAndALower.includes(keyLower)) {
        // Check if FAQ mentions a different price for this exact item
        const hasAuthPrice = faqPrices.some(fp => Math.abs(fp.value - auth.priceValue) <= 1);
        if (!hasAuthPrice) {
          const conflicting = faqPrices[0];
          conflicts.push({
            type: 'price_conflict',
            entity: auth.name,
            staleSource: 'Knowledge Base FAQ',
            staleValue: conflicting.raw,
            authoritativeSource: 'Verified Live Database / Catalog',
            authoritativeValue: auth.rawPrice,
            resolution: `For "${auth.name}", use the authoritative verified price ${auth.rawPrice} (superseding outdated FAQ value ${conflicting.raw}).`
          });
        }
      }
    }
  }

  // 3. Verified Contacts (Host Page + Knowledge Base + System Prompt Context)
  const verifiedEmails = new Set();
  const verifiedPhoneDigits = new Set();
  const addContactsFromText = (txt) => {
    const { emails, phones } = extractContactMentions(txt);
    emails.forEach(e => verifiedEmails.add(e));
    phones.forEach(p => {
      verifiedPhoneDigits.add(p.digits);
      if (p.digits.length > 10) verifiedPhoneDigits.add(p.digits.slice(-10));
    });
  };
  if (hostKnowledge?.email) addContactsFromText(hostKnowledge.email);
  if (hostKnowledge?.phone) addContactsFromText(hostKnowledge.phone);
  for (const faq of safeKb) {
    addContactsFromText(`${faq.q || ''} ${faq.a || ''}`);
  }
  if (promptContext) addContactsFromText(promptContext);

  // 4. Verified Technical Codebase Ground Truth (Deep Project Index + Project Architecture)
  const verifiedFiles = new Set();
  const verifiedFileBasenames = new Set();
  const verifiedRoutes = new Set();
  const verifiedTables = new Set();

  if (deepProjectIndex) {
    const filesArr = Array.isArray(deepProjectIndex.files)
      ? deepProjectIndex.files
      : Object.values(deepProjectIndex.filesByPath || {});
    for (const f of filesArr) {
      const p = String(f?.path || f || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
      if (!p) continue;
      verifiedFiles.add(p);
      const base = p.split('/').pop();
      if (base) verifiedFileBasenames.add(base);
    }
    for (const r of (deepProjectIndex.backendRoutes || [])) {
      if (r?.path) verifiedRoutes.add(normalizeEndpointPath(r.path));
    }
    for (const t of (deepProjectIndex.databaseTables || [])) {
      const tName = typeof t === 'string' ? t : (t?.name || t?.table || '');
      if (tName) verifiedTables.add(String(tName).toLowerCase());
    }
  }

  if (projectArch) {
    for (const r of (projectArch.backendRoutes || [])) {
      if (r?.path) verifiedRoutes.add(normalizeEndpointPath(r.path));
      if (r?.file) {
        const fp = String(r.file).replace(/\\/g, '/').toLowerCase();
        verifiedFiles.add(fp);
        verifiedFileBasenames.add(fp.split('/').pop());
      }
      for (const tbl of (r?.tables || [])) {
        if (tbl) verifiedTables.add(String(tbl).toLowerCase());
      }
    }
    for (const t of (projectArch.databaseTables || [])) {
      const tName = typeof t === 'string' ? t : (t?.name || t?.table || '');
      if (tName) verifiedTables.add(String(tName).toLowerCase());
    }
  }

  // 5. Build compact prompt injection block
  const lines = [];
  if (conflicts.length > 0) {
    lines.push('CROSS_SOURCE_CONFLICTS_RESOLVED (ALWAYS USE AUTHORITATIVE VALUES):');
    conflicts.slice(0, 6).forEach(c => lines.push(`- ${c.resolution}`));
  }
  if (verifiedRoutes.size > 0 || verifiedTables.size > 0) {
    lines.push(`VERIFIED_CODEBASE_INVENTORY: ${verifiedFiles.size} indexed files, ${verifiedRoutes.size} backend routes, ${verifiedTables.size} database tables. NEVER invent files, API routes, or tables not present in this verified inventory.`);
  }
  if (verifiedEmails.size > 0 || verifiedPhoneDigits.size > 0) {
    const contactSummary = [
      verifiedEmails.size > 0 ? `Emails: ${Array.from(verifiedEmails).slice(0, 3).join(', ')}` : '',
      hostKnowledge?.phone ? `Phone: ${hostKnowledge.phone}` : ''
    ].filter(Boolean).join(' | ');
    if (contactSummary) lines.push(`VERIFIED_CONTACTS_ONLY: ${contactSummary}`);
  }

  const groundTruthBlock = lines.length > 0
    ? `\n\n[CROSS_VERIFIED_GROUND_TRUTH]\n${lines.join('\n')}`
    : '';

  return {
    authoritativeItems,
    allVerifiedPriceValues,
    verifiedMetricNumbers,
    verifiedEmails,
    verifiedPhoneDigits,
    verifiedFiles,
    verifiedFileBasenames,
    verifiedRoutes: Array.from(verifiedRoutes),
    verifiedTables,
    conflicts,
    hasCodeGroundTruth: verifiedFiles.size > 0 || verifiedRoutes.size > 0 || verifiedTables.size > 0,
    groundTruthBlock
  };
}

/**
 * Post-Generation Fact-Verification & Hallucination Audit Gate.
 * Checks generated responses against cross-verified ground truth BEFORE displaying to the user.
 */
export function verifyAnswerAccuracy(candidateReply = '', ctx = {}) {
  const {
    query = '',
    groundTruth = null,
    catalogItems = [],
    matchedItem = null,
    verifiedFallback = '',
    honestUncertaintyFallback = '',
    isCustomerMode = false,
    isGeneralOffTopic = false,
    isGreeting = false,
    isUnclear = false,
    hasVerifiedContext = true,
    queryLang = 'en-US'
  } = ctx || {};

  let text = String(candidateReply || '').trim();
  const issues = [];
  let repaired = false;

  if (!text) {
    if (verifiedFallback) {
      return { text: verifiedFallback.trim(), passed: false, issues: [{ type: 'empty_reply_repaired', detail: 'Empty reply replaced with verified fallback' }], repaired: true, confidence: 'high' };
    }
    return { text: '', passed: true, issues: [], repaired: false, confidence: 'low' };
  }

  const gt = (groundTruth && groundTruth.authoritativeItems instanceof Map)
    ? groundTruth
    : crossVerifyProjectSources(groundTruth || { catalogItems });

  // 1. False Error / False "Not Available" Override when verified data exists
  const looksLikeFalseError = /\b(not\s+available\s+right\s+now|cannot\s+find|could\s+not\s+find|no\s+information\s+available|i\s+don'?t\s+have\s+(?:exact\s+)?information|unable\s+to\s+find)\b/i.test(text);
  if (looksLikeFalseError && verifiedFallback && verifiedFallback.trim().length > 10) {
    issues.push({ type: 'false_error_override', detail: 'Replaced false unavailability claim with verified grounded answer' });
    text = verifiedFallback.trim();
    repaired = true;
  }

  // Skip domain entity/price/code hallucination checks for pure greetings, unclear prompts, and general off-topic questions
  if (!isGeneralOffTopic && !isGreeting && !isUnclear) {
    // 2. Price / Fee & Stock Fact-Check against Authoritative Catalog Records
    const textLower = text.toLowerCase();
    const mentionedAuthItems = [];
    if (matchedItem && matchedItem.name) {
      const found = gt.authoritativeItems.get(String(matchedItem.name).toLowerCase());
      if (found) mentionedAuthItems.push(found);
    }
    if (mentionedAuthItems.length === 0) {
      for (const auth of gt.authoritativeItems.values()) {
        if (auth.name.length >= 3 && textLower.includes(auth.name.toLowerCase())) {
          mentionedAuthItems.push(auth);
        }
      }
    }

    if (mentionedAuthItems.length === 1) {
      const target = mentionedAuthItems[0];
      const citedPrices = extractCurrencyMentions(text);

      // A. Verify price matches authoritative catalog value
      if (target.priceValue !== null && citedPrices.length > 0) {
        const anyMatchesTarget = citedPrices.some(cp => Math.abs(cp.value - target.priceValue) <= 1);
        const allExistSomewhere = citedPrices.every(cp =>
          Math.abs(cp.value - target.priceValue) <= 1 ||
          gt.allVerifiedPriceValues.has(cp.value) ||
          gt.verifiedMetricNumbers.has(cp.value)
        );
        if (!anyMatchesTarget || !allExistSomewhere) {
          const badPrice = citedPrices.find(cp => Math.abs(cp.value - target.priceValue) > 1);
          issues.push({
            type: 'price_mismatch',
            entity: target.name,
            cited: badPrice?.raw || '',
            expected: target.rawPrice,
            detail: `Cited price ${badPrice?.raw} for ${target.name} contradicts authoritative ${target.rawPrice}`
          });
          if (verifiedFallback && verifiedFallback.trim().length > 10) {
            text = verifiedFallback.trim();
          } else if (badPrice?.raw) {
            text = text.replace(badPrice.raw, target.rawPrice);
          }
          repaired = true;
        }
      }

      // B. Verify stock / seat count matches authoritative catalog value
      if (target.stock !== null) {
        const stockMentionRe = /\b(\d{1,5})\s+(?:seats?|units?|items?|rooms?|slots?|spots?|in\s+stock|available)\b/gi;
        let sm;
        while ((sm = stockMentionRe.exec(text)) !== null) {
          const citedCount = Number(sm[1]);
          if (Number.isFinite(citedCount) && citedCount !== target.stock) {
            issues.push({
              type: 'stock_mismatch',
              entity: target.name,
              cited: String(citedCount),
              expected: String(target.stock),
              detail: `Cited availability count ${citedCount} for ${target.name} contradicts authoritative ${target.stock}`
            });
            if (verifiedFallback && verifiedFallback.trim().length > 10) {
              text = verifiedFallback.trim();
            } else {
              text = text.replace(sm[0], `${target.stock} ${target.unit || 'units'}`);
            }
            repaired = true;
            break;
          }
        }
      }
    }

    // 3. Fabricated Contact Details Guard (Phone Numbers & Emails)
    const citedContacts = extractContactMentions(text);
    for (const email of citedContacts.emails) {
      if (!gt.verifiedEmails.has(email)) {
        issues.push({
          type: 'fabricated_contact',
          cited: email,
          detail: `Removed unverified email address "${email}" not found in verified website or KB sources`
        });
        text = text.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'our official contact page');
        repaired = true;
      }
    }
    for (const ph of citedContacts.phones) {
      const last10 = ph.digits.length > 10 ? ph.digits.slice(-10) : ph.digits;
      if (!gt.verifiedPhoneDigits.has(ph.digits) && !gt.verifiedPhoneDigits.has(last10)) {
        issues.push({
          type: 'fabricated_contact',
          cited: ph.raw,
          detail: `Removed unverified phone number "${ph.raw}" not found in verified website or KB sources`
        });
        text = text.replace(ph.raw, 'our official contact section');
        repaired = true;
      }
    }

    // 4. Technical Implementation Validator (Studio / Project Mode Only!)
    if (!isCustomerMode && gt.hasCodeGroundTruth) {
      const invalidRoutes = [];
      const invalidFiles = [];
      const invalidTables = [];

      // 4a. Validate cited API routes (e.g., GET /api/orders, POST /api/stripe/charge)
      if (gt.verifiedRoutes.length > 0) {
        const routeRe = /\b(?:(?:GET|POST|PUT|PATCH|DELETE)\s+)?(\/(?:api|v[1-9])\/[a-z0-9_/:.-]+)/gi;
        let rm;
        const checkedRoutes = new Set();
        while ((rm = routeRe.exec(text)) !== null) {
          const citedRoute = rm[1].replace(/[.,;:!?)\]`'"]+$/, '');
          const norm = normalizeEndpointPath(citedRoute);
          if (checkedRoutes.has(norm)) continue;
          checkedRoutes.add(norm);
          if (!routeMatchesVerified(norm, gt.verifiedRoutes)) {
            invalidRoutes.push(citedRoute);
          }
        }
      }

      // 4b. Validate cited project file paths (e.g., src/services/phantomAuth.js)
      if (gt.verifiedFiles.size > 0) {
        const fileRe = /\b((?:src|server|backend|frontend|api|routes|controllers|middleware|models|db|utils|components|pages|public|lib)\/[a-z0-9_./-]+\.(?:jsx?|tsx?|mjs|cjs|py|sql|prisma|json|html|css))\b/gi;
        let fm;
        const checkedFiles = new Set();
        while ((fm = fileRe.exec(text)) !== null) {
          const citedFile = fm[1].replace(/\\/g, '/');
          const normFile = citedFile.toLowerCase();
          if (checkedFiles.has(normFile)) continue;
          checkedFiles.add(normFile);
          const base = normFile.split('/').pop();
          const exists =
            gt.verifiedFiles.has(normFile) ||
            Array.from(gt.verifiedFiles).some(vf => vf.endsWith(`/${normFile}`) || vf.endsWith(normFile)) ||
            (base && gt.verifiedFileBasenames.has(base));
          if (!exists) {
            invalidFiles.push(citedFile);
          }
        }
      }

      // 4c. Validate explicitly named DB tables ("table `billing_invoices`", "table 'orders'", "SQL table users")
      if (gt.verifiedTables.size > 0) {
        const tableRe = /\b(?:database|db|sql)?\s*table\s+[`'"]([a-z_][a-z0-9_]{2,40})[`'"]/gi;
        let tm;
        const checkedTables = new Set();
        while ((tm = tableRe.exec(text)) !== null) {
          const citedTable = tm[1].toLowerCase();
          if (checkedTables.has(citedTable)) continue;
          checkedTables.add(citedTable);
          if (!gt.verifiedTables.has(citedTable)) {
            invalidTables.push(tm[1]);
          }
        }
      }

      if (invalidRoutes.length > 0) {
        issues.push({ type: 'invalid_route', cited: invalidRoutes.join(', '), detail: `Unverified API route(s) not present in project index: ${invalidRoutes.join(', ')}` });
      }
      if (invalidFiles.length > 0) {
        issues.push({ type: 'invalid_file', cited: invalidFiles.join(', '), detail: `Unverified file path(s) not present in project index: ${invalidFiles.join(', ')}` });
      }
      if (invalidTables.length > 0) {
        issues.push({ type: 'invalid_table', cited: invalidTables.join(', '), detail: `Unverified database table(s) not present in project schema: ${invalidTables.join(', ')}` });
      }

      if (invalidRoutes.length > 0 || invalidFiles.length > 0 || invalidTables.length > 0) {
        repaired = true;
        if (verifiedFallback && verifiedFallback.trim().length > 15) {
          text = verifiedFallback.trim();
        } else {
          const verifiedBits = [];
          if (invalidRoutes.length > 0 && gt.verifiedRoutes.length > 0) {
            verifiedBits.push(`Verified API routes in this project: ${gt.verifiedRoutes.slice(0, 8).join(', ')}`);
          }
          if (invalidTables.length > 0 && gt.verifiedTables.size > 0) {
            verifiedBits.push(`Verified database tables: ${Array.from(gt.verifiedTables).slice(0, 8).join(', ')}`);
          }
          if (invalidFiles.length > 0 && gt.verifiedFiles.size > 0) {
            verifiedBits.push(`Verified indexed files include: ${Array.from(gt.verifiedFiles).slice(0, 8).join(', ')}`);
          }
          const unverifiedList = [...invalidRoutes, ...invalidFiles, ...invalidTables].join(', ');
          text = `I apologize — I want to verify strictly against the actual project code rather than guess. The item(s) "${unverifiedList}" do not exist in the indexed project.${verifiedBits.length > 0 ? ` ${verifiedBits.join('. ')}.` : ''}`;
        }
      }
    }

    // 5. Strict Uncertainty Gate when NO verified context supports a concrete numeric/price claim
    if (!hasVerifiedContext && !repaired) {
      const hasUngroundedPrice = extractCurrencyMentions(text).some(cp =>
        !gt.allVerifiedPriceValues.has(cp.value) && !gt.verifiedMetricNumbers.has(cp.value)
      );
      if (hasUngroundedPrice) {
        issues.push({ type: 'ungrounded_claim', detail: 'Blocked unverified price/figure when no grounded source matched the question' });
        text = honestUncertaintyFallback || buildHonestUncertaintyReply(query, { queryLang, catalogItems });
        repaired = true;
      }
    }
  }

  return {
    text,
    passed: issues.length === 0,
    issues,
    repaired,
    confidence: issues.length === 0 ? 'verified' : (repaired ? 'repaired' : 'low')
  };
}

/**
 * Canonicalizes rephrased versions of the same factual question into a stable key
 * so asking "What is the fee for Class 11 Science?" vs "How much does Class 11 Science cost?"
 * always yields consistent, non-contradictory verified facts.
 */
export function canonicalizeQueryForConsistency(rawQuery = '', opts = {}) {
  const clean = String(rawQuery || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 4) return '';
  const lower = clean.toLowerCase();
  const lang = opts.queryLang || 'en-US';
  const catalogItems = Array.isArray(opts.catalogItems) ? opts.catalogItems : [];

  // Do not collapse pronoun follow-ups unless an explicit activeItem anchor is provided
  const hasPronoun = /\b(that|this|it|them|those|first\s+one|second\s+one)\b/i.test(lower);
  let entityKey = '';
  if (opts.activeItem?.name && hasPronoun) {
    entityKey = String(opts.activeItem.name).toLowerCase().trim();
  } else if (catalogItems.length > 0) {
    const matched = fuzzyMatchRecord(catalogItems, clean, lower);
    if (matched?.name) entityKey = String(matched.name).toLowerCase().trim();
  }

  // Classify canonical aspect
  let aspect = '';
  if (/\b(fee|fees|price|cost|charges?|rate|rates|how\s+much|tuition|mrp)\b/i.test(lower)) aspect = 'price';
  else if (/\b(stock|available|availability|seats?|quantity|how\s+many|in\s+stock)\b/i.test(lower)) aspect = 'stock';
  else if (/\b(eligibility|criteria|marks|percentage|qualification|requirements?)\b/i.test(lower)) aspect = 'eligibility';
  else if (/\b(documents?|marksheet|leaving\s+certificate|certificates?|papers?)\b/i.test(lower)) aspect = 'documents';
  else if (/\b(how\s+to\s+apply|admission\s+process|procedure|steps|register|enroll|apply)\b/i.test(lower)) aspect = 'procedure';
  else if (/\b(details?|subjects?|syllabus|curriculum|what\s+is\s+included|features?|about)\b/i.test(lower)) aspect = 'details';

  // Only create a canonical entity+aspect key when BOTH are clearly identified (avoid over-merging distinct questions!)
  if (entityKey && aspect && !/\b(compare|versus|\bvs\.?\b|and\s+.*and)\b/i.test(lower)) {
    return `${entityKey}::${aspect}::${lang}`;
  }
  return '';
}

export function lookupConsistentAnswer(canonicalKey = '', versionHash = '') {
  if (!canonicalKey || !versionHash) return null;
  const entry = consistencyLedger.get(canonicalKey);
  if (!entry) return null;
  if (entry.versionHash !== versionHash) {
    consistencyLedger.delete(canonicalKey);
    return null;
  }
  return entry.answer;
}

export function storeConsistentAnswer(canonicalKey = '', versionHash = '', answer = '') {
  if (!canonicalKey || !versionHash || !answer) return;
  if (consistencyLedger.size >= CONSISTENCY_MAX_ENTRIES) {
    const oldestKey = consistencyLedger.keys().next().value;
    if (oldestKey) consistencyLedger.delete(oldestKey);
  }
  consistencyLedger.set(canonicalKey, {
    versionHash,
    answer: String(answer).trim(),
    storedAt: Date.now()
  });
}

export function clearConsistencyLedger() {
  consistencyLedger.clear();
}

function loadAuditEvents() {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryAuditEvents = parsed.slice(-MAX_AUDIT_EVENTS);
          return inMemoryAuditEvents;
        }
      }
    } catch (_) {}
  }
  return inMemoryAuditEvents;
}

function saveAuditEvents(events) {
  inMemoryAuditEvents = events.slice(-MAX_AUDIT_EVENTS);
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(inMemoryAuditEvents));
    } catch (_) {}
  }
}

/**
 * Continuous Improvement Telemetry: records verification results & caught accuracy issues
 * so recurring gaps or stale-data conflicts can be identified and fixed.
 */
export function recordAccuracyAuditEvent(event = {}) {
  const events = loadAuditEvents();
  const normalized = {
    timestamp: Date.now(),
    agentName: String(event.agentName || 'Default').slice(0, 60),
    query: String(event.query || '').slice(0, 120),
    passed: Boolean(event.passed),
    repaired: Boolean(event.repaired),
    conflictCount: Number(event.conflictCount || 0),
    issues: Array.isArray(event.issues)
      ? event.issues.slice(0, 5).map(i => ({ type: String(i.type || 'unknown'), detail: String(i.detail || '').slice(0, 140) }))
      : []
  };
  events.push(normalized);
  saveAuditEvents(events);
  return normalized;
}

export function getAccuracyAuditSummary(agentNameFilter = '') {
  const all = loadAuditEvents();
  const filtered = agentNameFilter
    ? all.filter(e => e.agentName.toLowerCase() === String(agentNameFilter).toLowerCase())
    : all;

  const totalChecked = filtered.length;
  const verifiedCleanCount = filtered.filter(e => e.passed && !e.repaired).length;
  const repairedCount = filtered.filter(e => e.repaired || !e.passed).length;
  const totalConflictsResolved = filtered.reduce((acc, e) => acc + (e.conflictCount || 0), 0);

  const issuesByCategory = {};
  const gapCounts = new Map();
  for (const ev of filtered) {
    for (const iss of (ev.issues || [])) {
      issuesByCategory[iss.type] = (issuesByCategory[iss.type] || 0) + 1;
    }
    if (!ev.passed || ev.repaired) {
      const qKey = (ev.query || '').toLowerCase().trim();
      if (qKey) gapCounts.set(qKey, (gapCounts.get(qKey) || 0) + 1);
    }
  }

  const topRecurringGaps = Array.from(gapCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([query, count]) => ({ query, count }));

  const passRate = totalChecked > 0 ? Math.round((verifiedCleanCount / totalChecked) * 100) : 100;

  return {
    totalChecked,
    verifiedCleanCount,
    repairedCount,
    totalConflictsResolved,
    passRate,
    issuesByCategory,
    topRecurringGaps,
    recentEvents: filtered.slice(-10).reverse()
  };
}

export function clearAccuracyAuditLog() {
  inMemoryAuditEvents = [];
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AUDIT_STORAGE_KEY);
    } catch (_) {}
  }
}
