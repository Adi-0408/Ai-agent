/**
 * Universal Deterministic Data Analytics, Precision-Gated RAG & Anti-Repetition Engine
 * Works across ALL 10 website archetypes (Academic, E-Commerce, Healthcare, Food, SaaS,
 * Hospitality, Automotive, Financial, Real Estate, General) with zero external dependencies.
 */

import { fuzzyTokenMatch, stemWord, NLU_STOPWORDS } from './fuzzyNlu.js';

// Generic words that should NEVER be the sole reason a KB FAQ or snippet matches a query
export const GENERIC_DOMAIN_WORDS = new Set([
  'course', 'courses', 'program', 'programs', 'programme', 'programmes', 'stream', 'streams', 'class', 'classes',
  'product', 'products', 'item', 'items', 'good', 'goods', 'service', 'services', 'plan', 'plans', 'tier', 'tiers',
  'room', 'rooms', 'dish', 'dishes', 'food', 'menu', 'medicine', 'medicines', 'drug', 'drugs', 'vehicle', 'vehicles',
  'car', 'cars', 'property', 'properties', 'option', 'options', 'offering', 'offerings', 'package', 'packages',
  'price', 'prices', 'pricing', 'fee', 'fees', 'cost', 'costs', 'rate', 'rates', 'charge', 'charges',
  'detail', 'details', 'info', 'information', 'about', 'website', 'site', 'page', 'portal', 'store', 'shop',
  'college', 'school', 'academy', 'clinic', 'hospital', 'restaurant', 'hotel', 'company', 'business', 'system',
  'available', 'availability', 'provide', 'offer', 'have', 'give', 'show', 'tell', 'know', 'want', 'need',
  'help', 'assist', 'support', 'question', 'answer', 'what', 'which', 'where', 'when', 'who', 'how', 'much', 'many'
]);

/**
 * Parse any formatted currency/price string into a normalized numeric object.
 * Supports: "₹25,000 / year", "Rs. 1,250", "$49.99/mo", "€150", "£89", "25k", "1.5 lakh", "25000"
 */
export function parseNumericPrice(rawPrice) {
  if (rawPrice === null || rawPrice === undefined || rawPrice === '') return null;
  if (typeof rawPrice === 'number') {
    return isFinite(rawPrice) && rawPrice >= 0 ? { value: rawPrice, currency: '', period: '', raw: String(rawPrice) } : null;
  }

  const str = String(rawPrice).trim();
  if (!str) return null;

  // Free / ₹0 detection
  if (/^\s*free\b/i.test(str)) {
    return { value: 0, currency: '', period: '', raw: str };
  }

  let currency = '';
  if (/₹|rs\.?|inr/i.test(str)) currency = '₹';
  else if (/\$|usd/i.test(str)) currency = '$';
  else if (/€|eur/i.test(str)) currency = '€';
  else if (/£|gbp/i.test(str)) currency = '£';

  const periodMatch = str.match(/\/\s*(yr|year|yr\.|mo|month|day|night|hr|hour|week|strip|unit|pack|seat|semester|sem)\b/i);
  const period = periodMatch ? `/${periodMatch[1].toLowerCase()}` : '';

  // Match number with optional multiplier ("25k", "1.5 lakh", "2 lac", "1.2 cr")
  const numMatch = str.match(/(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs|cr|crore|m|million)?\b/i);
  if (!numMatch) return null;

  let val = parseFloat(numMatch[1].replace(/,/g, ''));
  if (!isFinite(val)) return null;

  const mult = (numMatch[2] || '').toLowerCase();
  if (mult === 'k' || mult === 'thousand') val *= 1000;
  else if (mult === 'lakh' || mult === 'lakhs' || mult === 'lac' || mult === 'lacs') val *= 100000;
  else if (mult === 'cr' || mult === 'crore') val *= 10000000;
  else if (mult === 'm' || mult === 'million') val *= 1000000;

  return { value: val, currency, period, raw: str };
}

/**
 * Format a numeric value cleanly with currency symbol for human-friendly speech & chat.
 */
export function formatCurrencyAmount(value, currency = '') {
  if (!isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  const formatted = currency === '₹'
    ? rounded.toLocaleString('en-IN')
    : rounded.toLocaleString('en-US');
  return currency ? `${currency}${formatted}` : formatted;
}

/**
 * Extract numeric budget / price threshold from natural language queries (EN, HI, MR).
 * Examples: "courses under ₹20,000", "below $50", "above 5000", "between 15000 and 30000", "within 25k"
 */
export function parseBudgetThreshold(query) {
  const str = String(query || '').trim();
  if (!str) return null;

  const parseTokenAmount = (rawNum, multWord = '') => {
    let v = parseFloat(String(rawNum || '').replace(/,/g, ''));
    if (!isFinite(v)) return null;
    const m = String(multWord || '').toLowerCase();
    if (m === 'k' || m === 'thousand') v *= 1000;
    else if (m === 'lakh' || m === 'lakhs' || m === 'lac' || m === 'lacs') v *= 100000;
    else if (m === 'cr' || m === 'crore') v *= 10000000;
    return v;
  };

  let currency = '';
  if (/₹|rs\.?|inr|rupees?|रुपये|रुपए/i.test(str)) currency = '₹';
  else if (/\$|usd|dollars?/i.test(str)) currency = '$';
  else if (/€|eur|euros?/i.test(str)) currency = '€';
  else if (/£|gbp|pounds?/i.test(str)) currency = '£';

  // Range: "between ₹15,000 and ₹30,000" / "from 100 to 500"
  const rangeMatch = str.match(/\b(?:between|from)\s*(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:and|to|-|–)\s*(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\b/i);
  if (rangeMatch) {
    const a = parseTokenAmount(rangeMatch[1], rangeMatch[2]);
    const b = parseTokenAmount(rangeMatch[3], rangeMatch[4]);
    if (a !== null && b !== null) {
      return { op: 'between', min: Math.min(a, b), max: Math.max(a, b), currency };
    }
  }

  // Upper bound: "under ₹20,000", "below $50", "less than 500", "within 25k", "up to 30000", "max 1000", "budget of 20000"
  const lteMatch = str.match(/\b(?:under|below|less\s+than|within|up\s*to|upto|max(?:imum)?|budget(?:\s+of|\s+is)?|not\s+more\s+than|cheaper\s+than)\s*(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\b/i)
    || str.match(/(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:के\s*अंदर|से\s*कम|च्या\s*आत|पेक्षा\s*कमी)/i);
  if (lteMatch) {
    const val = parseTokenAmount(lteMatch[1], lteMatch[2]);
    if (val !== null) return { op: 'lte', max: val, currency };
  }

  // Lower bound: "above ₹20,000", "over $50", "more than 500", "at least 1000", "min 500"
  const gteMatch = str.match(/\b(?:above|over|more\s+than|greater\s+than|at\s+least|min(?:imum)?|starting\s+from|expensive\s+than)\s*(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\b/i)
    || str.match(/(?:₹|\$|€|£|rs\.?\s*)?(\d+(?:,\d{2,3})*(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:से\s*ज्यादा|से\s*अधिक|पेक्षा\s*जास्त)/i);
  if (gteMatch) {
    const val = parseTokenAmount(gteMatch[1], gteMatch[2]);
    if (val !== null) return { op: 'gte', min: val, currency };
  }

  return null;
}

/**
 * Compute aggregate statistics over a catalog array.
 */
export function computeCatalogStats(catalogItems = []) {
  const items = Array.isArray(catalogItems) ? catalogItems.filter(Boolean) : [];
  const enriched = items.map(item => {
    const parsed = parseNumericPrice(item.price);
    const stockNum = (item.stock !== null && item.stock !== undefined && item.stock !== '' && !isNaN(Number(item.stock)))
      ? Number(item.stock)
      : null;
    return {
      item,
      priceValue: parsed ? parsed.value : null,
      currency: parsed ? parsed.currency : '',
      period: parsed ? parsed.period : '',
      stockNum
    };
  });

  const priced = enriched.filter(e => e.priceValue !== null).sort((a, b) => a.priceValue - b.priceValue);
  const withStock = enriched.filter(e => e.stockNum !== null);
  const inStock = withStock.filter(e => e.stockNum > 0);
  const outOfStock = withStock.filter(e => e.stockNum === 0);
  const highestStock = [...withStock].sort((a, b) => b.stockNum - a.stockNum)[0] || null;

  const avgPrice = priced.length > 0
    ? Math.round((priced.reduce((sum, x) => sum + x.priceValue, 0) / priced.length) * 100) / 100
    : null;

  const primaryCurrency = priced.find(p => p.currency)?.currency || '';
  const categories = Array.from(new Set(items.map(i => String(i.category || '').trim()).filter(Boolean)));

  return {
    count: items.length,
    pricedCount: priced.length,
    inStockCount: inStock.length,
    outOfStockCount: outOfStock.length,
    minPriceEntry: priced[0] || null,
    maxPriceEntry: priced[priced.length - 1] || null,
    avgPrice,
    currency: primaryCurrency,
    highestStockEntry: highestStock,
    inStockItems: inStock.map(x => x.item),
    outOfStockItems: outOfStock.map(x => x.item),
    pricedEntries: priced,
    enriched,
    categories
  };
}

/**
 * Match 2 or more distinct catalog items from a comparison query (e.g., "compare 11th Science and 11th Commerce", "Starter vs Pro").
 */
export function matchMultipleItems(catalogItems, query) {
  if (!Array.isArray(catalogItems) || catalogItems.length < 2) return [];
  const raw = String(query || '').trim();
  if (!raw) return [];

  const cleaned = raw
    .replace(/\b(please|can you|could you|tell me|show me|what is|what are|the|compare|comparison|between|difference|differences|diff|which is better|better|choose|pick)\b/gi, ' ')
    .replace(/[?!.,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Split candidate segments on "vs", "versus", "and", "or", "with", ","
  const segments = cleaned
    .split(/\s*(?:\bvs\.?\b|\bversus\b|\band\b|\bor\b|\bwith\b|,|&|\/)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length >= 2);

  const scoreSegmentToItem = (seg, item) => {
    const segLower = seg.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const nameLower = String(item?.name || item?.title || item?.product || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!segLower || !nameLower) return 0;
    if (nameLower === segLower) return 100;
    if (nameLower.includes(segLower) && segLower.length >= 3) return 60 + segLower.length;

    const segToks = segLower.split(' ').filter(t => t.length >= 2 && !NLU_STOPWORDS.has(t) && !GENERIC_DOMAIN_WORDS.has(t));
    const nameToks = nameLower.split(' ').filter(t => t.length >= 2);
    if (segToks.length === 0) return 0;

    let matched = 0;
    let sc = 0;
    for (const st of segToks) {
      let best = 0;
      for (const nt of nameToks) {
        const m = fuzzyTokenMatch(st, nt);
        if (m > best) best = m;
      }
      if (best >= 2) {
        matched++;
        sc += best * 5;
      }
    }
    if (matched === 0) return 0;
    const coverage = matched / segToks.length;
    return coverage >= 0.5 ? sc + Math.round(coverage * 15) : 0;
  };

  const matchedItems = [];
  const seenNames = new Set();

  for (const seg of segments) {
    let bestItem = null;
    let bestScore = 0;
    for (const item of catalogItems) {
      const sc = scoreSegmentToItem(seg, item);
      if (sc > bestScore) {
        bestScore = sc;
        bestItem = item;
      }
    }
    if (bestItem && bestScore >= 10) {
      const key = String(bestItem.name || bestItem.title || '').toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        matchedItems.push(bestItem);
      }
    }
  }

  return matchedItems.slice(0, 3);
}

/**
 * Detect whether a user query is an analytical catalog query (comparison, superlative, budget filter, stock filter, count/range).
 */
export function detectAnalyticalIntent(query) {
  const raw = String(query || '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return null;

  // 1. Comparison
  if (/\b(compare|comparison|versus|vs\.?|difference\s+between|differences\s+between|differ\s+from|which\s+is\s+better|better\s+between|side\s+by\s+side)\b/i.test(lower) ||
      /(तुलना|फरक|अंतर|बेहतर कौन)/i.test(raw)) {
    return { type: 'compare' };
  }

  // 2. Budget / Price Threshold Filter ("under ₹20,000", "below $50", "between 1000 and 5000")
  const budget = parseBudgetThreshold(raw);
  if (budget) {
    return { type: 'budget_filter', budget };
  }

  // 3. Superlatives: Cheapest / Lowest Price
  if (/\b(cheapest|lowest\s+(?:price|fee|fees|cost|rate|priced)|most\s+affordable|least\s+expensive|minimum\s+(?:price|fee|cost)|budget[- ]friendly|best\s+price)\b/i.test(lower) ||
      /(सबसे\s*सस्ता|सबसे\s*कम\s*(?:फीस|कीमत)|सर्वात\s*स्वस्त|सर्वात\s*कमी\s*(?:फी|किंमत))/i.test(raw)) {
    return { type: 'cheapest' };
  }

  // 4. Superlatives: Most Expensive / Highest Price
  if (/\b(most\s+expensive|highest\s+(?:price|fee|fees|cost|rate|priced)|costliest|priciest|maximum\s+(?:price|fee|cost)|top[- ]tier\s+price)\b/i.test(lower) ||
      /(सबसे\s*महंगा|सबसे\s*ज्यादा\s*(?:फीस|कीमत)|सर्वात\s*महाग|सर्वात\s*जास्त\s*(?:फी|किंमत))/i.test(raw)) {
    return { type: 'most_expensive' };
  }

  // 5. Superlatives: Highest Stock / Seats
  if (/\b((?:most|highest|maximum)\s+(?:seats?|stock|units?|rooms?|slots?|availability|quantity))\b/i.test(lower)) {
    return { type: 'highest_stock' };
  }

  // 6. Availability / Stock Filter ("which items are out of stock", "what is currently in stock")
  if (/\b(which|what|list|show)\b[\s\S]{0,30}\b(out\s+of\s+stock|sold\s+out|unavailable|not\s+available|zero\s+stock)\b/i.test(lower) ||
      /\b(out\s+of\s+stock|sold\s+out)\s+(?:items?|products?|medicines?|courses?|rooms?|dishes?)\b/i.test(lower)) {
    return { type: 'out_of_stock_filter' };
  }
  if (/\b(which|what|list|show)\b[\s\S]{0,30}\b(in\s+stock|currently\s+available|available\s+right\s+now)\b/i.test(lower) &&
      !/\b(how\s+many)\b/i.test(lower)) {
    return { type: 'in_stock_filter' };
  }

  // 7. Count / Total / Price Range / Average
  if (/\b(how\s+many|total\s+number\s+of|total\s+(?:courses?|programs?|products?|items?|medicines?|dishes?|plans?|rooms?|vehicles?|services?|options?)|count\s+of)\b/i.test(lower) ||
      /(कितने\s*(?:कोर्स|प्रोडक्ट|आइटम|दवा)|किती\s*(?:कोर्स|अभ्यासक्रम|प्रॉडक्ट))/i.test(raw)) {
    return { type: 'count' };
  }
  if (/\b(price\s+range|fee\s+range|cost\s+range|average\s+(?:price|fee|fees|cost|rate)|min\s+and\s+max\s+(?:price|fee))\b/i.test(lower)) {
    return { type: 'price_summary' };
  }

  return null;
}

/**
 * Deterministic Catalog Analytics Solver.
 * Returns { status: 'ANALYTICAL_RESULT', analysisType, summaryText, computedData, matchedItems } or null.
 */
export function analyzeCatalogQuery(query, catalogItems = [], profile = null, queryLang = 'en-US') {
  const intent = detectAnalyticalIntent(query);
  if (!intent) return null;

  const items = Array.isArray(catalogItems) ? catalogItems.filter(Boolean) : [];
  if (items.length === 0) return null;

  const stats = computeCatalogStats(items);
  const nounEn = (profile && profile.itemNounEn) ? profile.itemNounEn : 'options';
  const nounHi = (profile && profile.itemNounHi) ? profile.itemNounHi : 'विकल्प';
  const nounMr = (profile && profile.itemNounMr) ? profile.itemNounMr : 'पर्याय';
  const priceLabelEn = (profile && profile.priceLabelEn) ? profile.priceLabelEn : 'price';
  const unitDefault = (profile && profile.itemUnit) ? profile.itemUnit : 'units';

  // 1. COMPARISON
  if (intent.type === 'compare') {
    const matched = matchMultipleItems(items, query);
    if (matched.length < 2) return null; // Fall back cleanly if <2 items matched

    const details = matched.map(it => {
      const p = parseNumericPrice(it.price);
      return {
        name: it.name,
        price: it.price || 'Price on request',
        priceValue: p ? p.value : null,
        currency: p ? p.currency : stats.currency,
        stock: it.stock,
        unit: it.unit || unitDefault,
        description: it.description || it.dosage || it.details || ''
      };
    });

    const partsEn = details.map(d => {
      const segs = [`${d.name} is ${d.price}`];
      if (d.stock !== null && d.stock !== undefined) segs.push(`with ${d.stock} ${d.unit} available`);
      if (d.description) segs.push(`covering ${d.description.replace(/\.+$/, '')}`);
      return segs.join(', ');
    });

    let diffLineEn = '';
    let diffLineHi = '';
    let diffLineMr = '';
    if (details.length === 2 && details[0].priceValue !== null && details[1].priceValue !== null) {
      const diff = Math.abs(details[0].priceValue - details[1].priceValue);
      const cur = details[0].currency || details[1].currency || stats.currency;
      if (diff === 0) {
        diffLineEn = ' Both are priced the same.';
        diffLineHi = ' दोनों की कीमत समान है।';
        diffLineMr = ' दोघांची किंमत सारखीच आहे.';
      } else {
        const cheaper = details[0].priceValue < details[1].priceValue ? details[0] : details[1];
        const fmtDiff = formatCurrencyAmount(diff, cur);
        diffLineEn = ` ${cheaper.name} is more affordable by ${fmtDiff}.`;
        diffLineHi = ` ${cheaper.name} की कीमत ${fmtDiff} कम है।`;
        diffLineMr = ` ${cheaper.name} हे ${fmtDiff} ने अधिक परवडणारे आहे.`;
      }
    }

    let summaryText = `Here is a quick comparison: ${partsEn.join('; while ')}.${diffLineEn} Let me know which one suits you best!`;
    if (queryLang === 'mr-IN') {
      const partsMr = details.map(d => `${d.name} (${d.price}${d.description ? ` — ${d.description.replace(/\.+$/, '')}` : ''})`);
      summaryText = `येथे तुलना दिली आहे: ${partsMr.join(' आणि ')}.${diffLineMr} तुम्हाला यापैकी कोणता पर्याय योग्य वाटतो?`;
    } else if (queryLang === 'hi-IN') {
      const partsHi = details.map(d => `${d.name} (${d.price}${d.description ? ` — ${d.description.replace(/\.+$/, '')}` : ''})`);
      summaryText = `यहाँ तुलना दी गई है: ${partsHi.join(' और ')}।${diffLineHi} बताएं इनमें से कौन सा विकल्प आपके लिए बेहतर रहेगा?`;
    }

    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'comparison',
      summaryText,
      computedData: { compared: details },
      matchedItems: matched
    };
  }

  // 2. CHEAPEST / LOWEST PRICE
  if (intent.type === 'cheapest') {
    if (!stats.minPriceEntry) return null;
    const minVal = stats.minPriceEntry.priceValue;
    const tied = stats.pricedEntries.filter(e => e.priceValue === minVal);
    const names = tied.map(e => `${e.item.name} at ${e.item.price}`).join(' and ');
    const summaryText = queryLang === 'mr-IN'
      ? `आमचा सर्वात परवडणारा पर्याय आहे ${names}. याबद्दल अधिक तपशील हवा असल्यास नक्की विचारा!`
      : queryLang === 'hi-IN'
        ? `हमारा सबसे किफायती विकल्प है ${names}। यदि आप इसके बारे में अधिक जानकारी चाहते हैं तो कृपया पूछें!`
        : `Our most affordable option is ${names}.${tied[0].item.description ? ` It includes ${tied[0].item.description.replace(/\.+$/, '')}.` : ''} Please let me know if you would like more details!`;

    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'cheapest',
      summaryText,
      computedData: { cheapest: tied.map(t => ({ name: t.item.name, price: t.item.price, value: t.priceValue })), totalPriced: stats.pricedCount },
      matchedItems: tied.map(t => t.item)
    };
  }

  // 3. MOST EXPENSIVE / HIGHEST PRICE
  if (intent.type === 'most_expensive') {
    if (!stats.maxPriceEntry) return null;
    const maxVal = stats.maxPriceEntry.priceValue;
    const tied = stats.pricedEntries.filter(e => e.priceValue === maxVal);
    const names = tied.map(e => `${e.item.name} at ${e.item.price}`).join(' and ');
    const summaryText = queryLang === 'mr-IN'
      ? `आमचा सर्वाधिक प्रीमियम पर्याय आहे ${names}. याबद्दल अधिक माहिती हवी असल्यास सांगा!`
      : queryLang === 'hi-IN'
        ? `हमारा सबसे प्रीमियम विकल्प है ${names}। इसके बारे में अधिक जानकारी के लिए कृपया पूछें!`
        : `Our highest-priced option is ${names}.${tied[0].item.description ? ` It includes ${tied[0].item.description.replace(/\.+$/, '')}.` : ''} Would you like full details on it?`;

    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'most_expensive',
      summaryText,
      computedData: { mostExpensive: tied.map(t => ({ name: t.item.name, price: t.item.price, value: t.priceValue })), totalPriced: stats.pricedCount },
      matchedItems: tied.map(t => t.item)
    };
  }

  // 4. HIGHEST STOCK / SEATS
  if (intent.type === 'highest_stock') {
    if (!stats.highestStockEntry) return null;
    const top = stats.highestStockEntry;
    const u = top.item.unit || unitDefault;
    const summaryText = `The option with the highest availability right now is ${top.item.name} with ${top.stockNum} ${u} available${top.item.price ? ` at ${top.item.price}` : ''}.`;
    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'highest_stock',
      summaryText,
      computedData: { highestStock: { name: top.item.name, stock: top.stockNum, unit: u, price: top.item.price || '' } },
      matchedItems: [top.item]
    };
  }

  // 5. BUDGET / THRESHOLD FILTER
  if (intent.type === 'budget_filter' && intent.budget) {
    if (stats.pricedEntries.length === 0) return null;
    const b = intent.budget;
    const cur = b.currency || stats.currency;
    let filtered = [];
    let criteriaLabel = '';

    if (b.op === 'lte') {
      filtered = stats.pricedEntries.filter(e => e.priceValue <= b.max);
      criteriaLabel = `under ${formatCurrencyAmount(b.max, cur)}`;
    } else if (b.op === 'gte') {
      filtered = stats.pricedEntries.filter(e => e.priceValue >= b.min);
      criteriaLabel = `above ${formatCurrencyAmount(b.min, cur)}`;
    } else if (b.op === 'between') {
      filtered = stats.pricedEntries.filter(e => e.priceValue >= b.min && e.priceValue <= b.max);
      criteriaLabel = `between ${formatCurrencyAmount(b.min, cur)} and ${formatCurrencyAmount(b.max, cur)}`;
    }

    if (filtered.length > 0) {
      const listStr = filtered.slice(0, 6).map(e => `${e.item.name} (${e.item.price})`).join(', ');
      const more = filtered.length > 6 ? `, and ${filtered.length - 6} more` : '';
      const summaryText = queryLang === 'mr-IN'
        ? `${criteriaLabel} मध्ये आमच्याकडे ${filtered.length} ${nounMr} उपलब्ध आहेत: ${listStr}. कोणत्या पर्यायाबद्दल अधिक माहिती हवी आहे?`
        : queryLang === 'hi-IN'
          ? `${criteriaLabel} में हमारे पास ${filtered.length} ${nounHi} उपलब्ध हैं: ${listStr}। आप किस विकल्प के बारे में विस्तार से जानना चाहेंगे?`
          : `We have ${filtered.length} ${filtered.length === 1 ? 'option' : nounEn} ${criteriaLabel}: ${listStr}${more}. Please let me know which one you would like more details on!`;

      return {
        status: 'ANALYTICAL_RESULT',
        analysisType: 'budget_filter',
        summaryText,
        computedData: { criteria: criteriaLabel, count: filtered.length, matches: filtered.map(e => ({ name: e.item.name, price: e.item.price })) },
        matchedItems: filtered.map(e => e.item)
      };
    }

    // Honest zero-match + closest available option
    const closest = stats.minPriceEntry;
    const summaryText = queryLang === 'mr-IN'
      ? `क्षमस्व, सध्या ${criteriaLabel} मध्ये कोणतेही ${nounMr} उपलब्ध नाहीत. आमचा सर्वात जवळचा परवडणारा पर्याय ${closest.item.name} (${closest.item.price}) आहे.`
      : queryLang === 'hi-IN'
        ? `क्षमा करें, अभी ${criteriaLabel} में कोई ${nounHi} उपलब्ध नहीं है। हमारा सबसे किफायती विकल्प ${closest.item.name} (${closest.item.price}) है।`
        : `I checked our catalog and we do not currently have any ${nounEn} ${criteriaLabel}. Our closest affordable option is ${closest.item.name} at ${closest.item.price}. Would you like details on it?`;

    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'budget_filter_empty',
      summaryText,
      computedData: { criteria: criteriaLabel, count: 0, closestOption: { name: closest.item.name, price: closest.item.price } },
      matchedItems: [closest.item]
    };
  }

  // 6. OUT-OF-STOCK FILTER
  if (intent.type === 'out_of_stock_filter') {
    if (stats.outOfStockItems.length > 0) {
      const names = stats.outOfStockItems.slice(0, 6).map(i => i.name).join(', ');
      return {
        status: 'ANALYTICAL_RESULT',
        analysisType: 'out_of_stock_filter',
        summaryText: `Currently ${stats.outOfStockItems.length} ${stats.outOfStockItems.length === 1 ? 'item is' : 'items are'} out of stock: ${names}. All other listed ${nounEn} are available!`,
        computedData: { outOfStockCount: stats.outOfStockItems.length, items: stats.outOfStockItems.map(i => i.name) },
        matchedItems: stats.outOfStockItems
      };
    }
    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'out_of_stock_filter',
      summaryText: `Good news! None of our listed ${nounEn} are marked out of stock right now.`,
      computedData: { outOfStockCount: 0, items: [] },
      matchedItems: []
    };
  }

  // 7. IN-STOCK FILTER
  if (intent.type === 'in_stock_filter') {
    const avail = stats.inStockItems.length > 0 ? stats.inStockItems : items;
    const names = avail.slice(0, 6).map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
    const more = avail.length > 6 ? `, and ${avail.length - 6} more` : '';
    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'in_stock_filter',
      summaryText: `We currently have ${avail.length} ${nounEn} available: ${names}${more}. Let me know which one you would like to explore!`,
      computedData: { inStockCount: avail.length, items: avail.map(i => i.name) },
      matchedItems: avail
    };
  }

  // 8. COUNT / TOTAL
  if (intent.type === 'count') {
    const sample = items.slice(0, 5).map(i => i.name).join(', ');
    const more = items.length > 5 ? `, and ${items.length - 5} more` : '';
    const rangeNote = (stats.minPriceEntry && stats.maxPriceEntry && stats.minPriceEntry.priceValue !== stats.maxPriceEntry.priceValue)
      ? ` ${priceLabelEn.charAt(0).toUpperCase() + priceLabelEn.slice(1)}s range from ${stats.minPriceEntry.item.price} to ${stats.maxPriceEntry.item.price}.`
      : '';

    const summaryText = queryLang === 'mr-IN'
      ? `आमच्याकडे एकूण ${stats.count} ${nounMr} उपलब्ध आहेत: ${sample}${more}.`
      : queryLang === 'hi-IN'
        ? `हमारे पास कुल ${stats.count} ${nounHi} उपलब्ध हैं: ${sample}${more}।`
        : `We currently offer a total of ${stats.count} ${nounEn}: ${sample}${more}.${rangeNote} Which one would you like details on?`;

    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'count',
      summaryText,
      computedData: {
        totalCount: stats.count,
        inStockCount: stats.inStockCount,
        outOfStockCount: stats.outOfStockCount,
        minPrice: stats.minPriceEntry ? stats.minPriceEntry.item.price : null,
        maxPrice: stats.maxPriceEntry ? stats.maxPriceEntry.item.price : null
      },
      matchedItems: items
    };
  }

  // 9. PRICE RANGE & AVERAGE SUMMARY
  if (intent.type === 'price_summary') {
    if (!stats.minPriceEntry || !stats.maxPriceEntry) return null;
    const avgFmt = stats.avgPrice !== null ? formatCurrencyAmount(stats.avgPrice, stats.currency) : '';
    const summaryText = `Across our ${stats.pricedCount} priced ${nounEn}, ${priceLabelEn}s range from ${stats.minPriceEntry.item.price} (${stats.minPriceEntry.item.name}) to ${stats.maxPriceEntry.item.price} (${stats.maxPriceEntry.item.name})${avgFmt ? `, with an average of about ${avgFmt}` : ''}. Let me know your budget and I can filter options for you!`;
    return {
      status: 'ANALYTICAL_RESULT',
      analysisType: 'price_summary',
      summaryText,
      computedData: {
        pricedCount: stats.pricedCount,
        min: { name: stats.minPriceEntry.item.name, price: stats.minPriceEntry.item.price },
        max: { name: stats.maxPriceEntry.item.name, price: stats.maxPriceEntry.item.price },
        average: avgFmt
      },
      matchedItems: [stats.minPriceEntry.item, stats.maxPriceEntry.item]
    };
  }

  return null;
}

/**
 * Precision-Gated Query-Aware RAG Scorer for Knowledge Base FAQs & Live Page Snippets.
 * Prevents irrelevant FAQ collisions by verifying distinctive content-token coverage!
 */
export function rankGroundedContext(query, kbList = [], pageSnippets = [], options = {}) {
  const rawQ = String(query || '').toLowerCase().trim();
  const extraTerms = String(options.extraTerms || '').toLowerCase().trim();
  const topKFaqsLimit = Number(options.topKFaqs || 12);
  const topKSnipsLimit = Number(options.topKSnippets || 6);

  const tokenize = (txt) => String(txt || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !NLU_STOPWORDS.has(w));

  const queryToks = Array.from(new Set([...tokenize(rawQ), ...tokenize(extraTerms)]));
  const distinctiveQueryToks = queryToks.filter(t => !GENERIC_DOMAIN_WORDS.has(t) && !GENERIC_DOMAIN_WORDS.has(stemWord(t)));

  const safeKbs = (Array.isArray(kbList) ? kbList : []).filter(k => k && k.q && k.a);
  const safeSnips = (Array.isArray(pageSnippets) ? pageSnippets : []).filter(s => s && (s.heading || s.text));

  // Build corpus document frequency for simple IDF weighting
  const totalDocs = Math.max(1, safeKbs.length + safeSnips.length);
  const docFreq = new Map();
  const registerDocTokens = (toks) => {
    const uniq = new Set(toks.map(stemWord));
    for (const u of uniq) docFreq.set(u, (docFreq.get(u) || 0) + 1);
  };
  safeKbs.forEach(k => registerDocTokens([...tokenize(k.q), ...tokenize(k.a)]));
  safeSnips.forEach(s => registerDocTokens([...tokenize(s.heading), ...tokenize(s.text)]));

  const idfWeight = (tok) => {
    const df = docFreq.get(stemWord(tok)) || 0;
    return 1 + Math.log((totalDocs + 1) / (df + 1));
  };

  const scoreCandidate = (titleText, bodyText) => {
    const tLower = String(titleText || '').toLowerCase();
    const tToks = tokenize(tLower);
    const bToks = tokenize(bodyText);

    let score = 0;
    let matchedDistinctive = 0;
    let matchedGeneric = 0;
    let exactPhraseHit = false;

    if (rawQ.length >= 6 && tLower.length >= 6 && (rawQ.includes(tLower) || tLower.includes(rawQ))) {
      score += 80;
      exactPhraseHit = true;
    }

    for (const qt of queryToks) {
      const isDistinctive = distinctiveQueryToks.includes(qt);
      const weight = isDistinctive ? Math.min(2.4, idfWeight(qt)) : 0.45;

      let bestTitle = 0;
      for (const tt of tToks) {
        const m = fuzzyTokenMatch(qt, tt);
        if (m > bestTitle) bestTitle = m;
      }

      let bestBody = 0;
      for (const bt of bToks) {
        const m = fuzzyTokenMatch(qt, bt);
        if (m > bestBody) bestBody = m;
      }

      if (bestTitle >= 3) score += 22 * weight;
      else if (bestTitle === 2) score += 14 * weight;

      if (bestBody >= 3) score += 10 * weight;
      else if (bestBody === 2) score += 6 * weight;

      if (bestTitle >= 2 || bestBody >= 2) {
        if (isDistinctive) matchedDistinctive++;
        else matchedGeneric++;
      }
    }

    const distinctiveCoverage = distinctiveQueryToks.length > 0
      ? matchedDistinctive / distinctiveQueryToks.length
      : (queryToks.length > 0 ? matchedGeneric / queryToks.length : 0);

    // STRICT PRECISION GATE:
    // If the user's query contains distinctive content words (e.g. "principal", "bitcoin", "hostel", "london"),
    // NEVER accept a match that misses ALL distinctive words (or misses >60% of them on multi-topic queries)!
    let isRelevant = false;
    if (exactPhraseHit) {
      isRelevant = true;
    } else if (distinctiveQueryToks.length === 0) {
      isRelevant = score >= 20 && matchedGeneric >= 1;
    } else if (distinctiveQueryToks.length === 1) {
      isRelevant = matchedDistinctive === 1 && score >= 18;
    } else {
      isRelevant = matchedDistinctive >= 1 && distinctiveCoverage >= 0.45 && score >= 24;
    }

    return { score, matchedDistinctive, distinctiveCoverage, isRelevant };
  };

  const scoredFaqs = safeKbs.map(item => ({
    source: 'kb',
    item,
    topic: item.q,
    answer: item.a,
    ...scoreCandidate(item.q, item.a)
  })).sort((a, b) => b.score - a.score);

  const scoredSnips = safeSnips.map(snip => ({
    source: 'page',
    item: snip,
    topic: snip.heading || rawQ,
    answer: snip.text,
    ...scoreCandidate(snip.heading, snip.text)
  })).sort((a, b) => b.score - a.score);

  const bestRelevantFaq = scoredFaqs.find(f => f.isRelevant) || null;
  const bestRelevantSnip = scoredSnips.find(s => s.isRelevant) || null;

  let topHit = null;
  if (bestRelevantFaq && bestRelevantSnip) {
    topHit = bestRelevantFaq.score >= bestRelevantSnip.score ? bestRelevantFaq : bestRelevantSnip;
  } else {
    topHit = bestRelevantFaq || bestRelevantSnip || null;
  }

  const confidence = !topHit ? 'none' : (topHit.score >= 42 || topHit.distinctiveCoverage >= 0.75 ? 'high' : 'medium');

  // For LLM RAG prompt injection: ONLY include verified relevant FAQs passing the precision threshold!
  // NEVER dump unrelated FAQs into context when confidence is none or score is below threshold.
  const topKFaqs = scoredFaqs.filter(f => f.isRelevant).slice(0, topKFaqsLimit).map(f => f.item);
  const topKSnippets = scoredSnips.filter(s => s.isRelevant).slice(0, topKSnipsLimit).map(s => s.item);

  return {
    topHit,
    topKFaqs,
    topKSnippets,
    confidence,
    distinctiveQueryToks
  };
}

/**
 * Semantic Repetition Detector using content-token Jaccard similarity.
 * Prevents the assistant from repeating the exact or near-identical reply twice in a row.
 */
export function isSemanticallyRepeated(candidateReply, recentReplies = [], threshold = 0.78) {
  const cand = String(candidateReply || '').trim();
  if (!cand || !Array.isArray(recentReplies) || recentReplies.length === 0) return false;

  const toTokenSet = (s) => new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097F\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !NLU_STOPWORDS.has(w))
  );

  const candSet = toTokenSet(cand);
  if (candSet.size === 0) return false;

  for (const prev of recentReplies.slice(-2)) {
    const prevStr = String(prev || '').trim();
    if (!prevStr) continue;
    if (prevStr.toLowerCase() === cand.toLowerCase()) return true;

    const prevSet = toTokenSet(prevStr);
    if (prevSet.size === 0) continue;

    let intersection = 0;
    for (const t of candSet) {
      if (prevSet.has(t)) intersection++;
    }
    const union = candSet.size + prevSet.size - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    if (jaccard >= threshold) return true;
  }

  return false;
}

/**
 * Honest Uncertainty Response Builder (EN / HI / MR).
 * Clearly communicates when a specific fact is NOT available on the website,
 * NEVER fabricates details, and guides the visitor to verified options or contact info.
 */
export function buildHonestUncertaintyReply(query, opts = {}) {
  const {
    queryLang = 'en-US',
    profile = null,
    catalogItems = [],
    kbTopics = [],
    phone = '',
    email = ''
  } = opts;

  const rawTopic = String(query || '')
    .replace(/^(?:hi+|hello+|hey+|namaste|namaskar)[,!.\s]+/i, '')
    .replace(/^(?:can you tell me|could you tell me|please tell me|do you know|what is|what are|who is|where is|when is|do you have|do you offer|is there)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim()
    .slice(0, 60);

  const topicClauseEn = rawTopic.length >= 3 ? ` about "${rawTopic}"` : '';
  const contactParts = [phone ? `call ${phone}` : '', email ? `email ${email}` : ''].filter(Boolean).join(' or ');

  const topItems = (Array.isArray(catalogItems) ? catalogItems : []).slice(0, 3).map(i => i.name).filter(Boolean);
  const topTopics = (Array.isArray(kbTopics) ? kbTopics : []).slice(0, 2).filter(Boolean);
  const followUpEn = (profile && profile.followUpEn) ? profile.followUpEn : 'our offerings, pricing, and support';
  const followUpHi = (profile && profile.followUpHi) ? profile.followUpHi : 'हमारी सेवाओं और कीमतों';
  const followUpMr = (profile && profile.followUpMr) ? profile.followUpMr : 'आमच्या सेवा आणि किंमती';

  if (queryLang === 'mr-IN') {
    const contactMr = contactParts ? ` अचूक माहितीसाठी आपण आमच्या टीमशी संपर्क साधू शकता (${contactParts}).` : '';
    const optsMr = topItems.length > 0
      ? ` कृपया दुसरा प्रश्न विचारा — मी आपल्याला ${topItems.join(', ')} किंवा ${followUpMr}बद्दल नक्कीच अचूक माहिती देऊ शकतो!`
      : ` कृपया दुसरा प्रश्न विचारा, मी आपल्याला ${followUpMr}बद्दल आनंदाने मदत करेन!`;
    return `माफ करा, माझ्याकडे सध्या या विषयाची अचूक माहिती उपलब्ध नाही, त्यामुळे मी चुकीची माहिती देऊ इच्छित नाही.${contactMr}${optsMr}`;
  }

  if (queryLang === 'hi-IN') {
    const contactHi = contactParts ? ` सटीक जानकारी के लिए आप हमारी टीम से संपर्क कर सकते हैं (${contactParts})।` : '';
    const optsHi = topItems.length > 0
      ? ` कृपया कोई अन्य प्रश्न पूछें — मैं आपको ${topItems.join(', ')} या ${followUpHi} के बारे में सटीक जानकारी दे सकता हूँ!`
      : ` कृपया कोई अन्य प्रश्न पूछें, मुझे ${followUpHi} में आपकी सहायता करके खुशी होगी!`;
    return `क्षमा करें, मेरे पास अभी इस विषय की सटीक जानकारी उपलब्ध नहीं है, इसलिए मैं गलत जानकारी नहीं देना चाहूँगा।${contactHi}${optsHi}`;
  }

  const contactEn = contactParts ? ` For an exact answer, please reach our team directly via ${contactParts}.` : '';
  let helpEn = '';
  if (topItems.length > 0) {
    helpEn = ` Please feel free to try another question — I can give you verified details on ${topItems.join(', ')}, or help with ${followUpEn}!`;
  } else if (topTopics.length > 0) {
    helpEn = ` Please feel free to try another question, such as ${topTopics.join(' or ')}.`;
  } else {
    helpEn = ` Please feel free to try another question, and I would be happy to assist you!`;
  }

  return `I apologize, but I don't have exact information${topicClauseEn} right now, so I want to be honest rather than guess.${contactEn}${helpEn}`;
}
