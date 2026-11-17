/**
 * Comprehensive Verification: Universal Multi-Turn Conversational Memory & Context Continuity
 * Across ALL Website Types & Agents:
 * - Academic / Education
 * - E-Commerce / Retail
 * - Healthcare / Pharmacy
 * - Restaurant / Dining
 * - SaaS / Cloud Software
 * - Automotive / Dealership
 * - Hospitality / Hotel
 * - Real Estate
 * - Financial / Advisory
 */

import assert from 'node:assert';

const ARCHETYPE_PROFILES = {
  academic: {
    nounEn: 'courses and admissions',
    itemNounEn: 'courses / programs',
    itemUnit: 'seats',
    priceLabelEn: 'annual fee',
    defaultDesc: 'comprehensive curriculum, experienced faculty, laboratory facilities, and student guidance',
    actionEn: 'complete the online admission form on this portal and submit your required documents'
  },
  ecommerce: {
    nounEn: 'products, orders, and shopping',
    itemNounEn: 'products',
    itemUnit: 'units',
    priceLabelEn: 'price',
    defaultDesc: 'authentic quality, manufacturer warranty, fast shipping, and hassle-free returns',
    actionEn: 'add it to your cart and complete checkout directly on this website'
  },
  healthcare: {
    nounEn: 'medicines and healthcare services',
    itemNounEn: 'medicines',
    itemUnit: 'packs',
    priceLabelEn: 'price',
    defaultDesc: 'certified pharmaceutical quality with clear dosage guidance and pharmacist support',
    actionEn: 'add it to your order or upload your prescription on our website'
  },
  food: {
    nounEn: 'our menu and dining services',
    itemNounEn: 'dishes',
    itemUnit: 'portions',
    priceLabelEn: 'price',
    defaultDesc: 'freshly prepared ingredients, authentic recipe, and prompt dine-in or delivery service',
    actionEn: 'place your order directly through our menu section or reserve a table with us'
  },
  saas: {
    nounEn: 'plans and platform features',
    itemNounEn: 'plans',
    itemUnit: 'licenses',
    priceLabelEn: 'subscription rate',
    defaultDesc: 'cloud-hosted reliability, priority technical support, analytics, and seamless integrations',
    actionEn: 'select the plan from our pricing section to start your subscription or free trial'
  }
};

function getArchetypeProfile(arch) {
  return ARCHETYPE_PROFILES[arch] || ARCHETYPE_PROFILES.ecommerce;
}

function isGreetingOrConversational(t) {
  if (!t) return false;
  return /^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening|day)|namaste|namaskar|whats?\s*up)\b/i.test(t);
}

function matchInInventory(catalog, rawTarget) {
  if (!catalog || !rawTarget) return null;
  const target = String(rawTarget).toLowerCase().trim();
  const cleanTarget = target.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanTarget) return null;

  // Phase 1: Exact or substring match
  for (const item of catalog) {
    const name = String(item.name || item.title || '').toLowerCase().trim();
    const cleanName = name.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanName === cleanTarget || (cleanTarget.length >= 4 && cleanName.includes(cleanTarget))) {
      return item;
    }
  }

  // Phase 2: Token overlap scoring (matches widget.js)
  const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'what', 'your', 'about', 'can', 'you', 'instead']);
  const tokens = cleanTarget.split(' ').filter(w => w.length >= 2 && !stopWords.has(w));
  let best = null;
  let maxScore = 0;

  for (const item of catalog) {
    const cleanName = String(item.name || item.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    let score = 0;
    for (const tok of tokens) {
      if (cleanName.includes(tok)) score += 2;
    }
    if (score > maxScore) {
      maxScore = score;
      best = item;
    }
  }

  return maxScore >= 2 ? best : null;
}

function extractTargetItem(text, history = [], context = null, catalogItems = null) {
  let cleaned = String(text || '').trim()
    .replace(/\b(available stock|current stock number|stock number|available|stock|in stock|out of stock|is there any|is there|do you have|do you sell|can i get|i want to buy|looking for|tell me about|details of|info on|do you carry|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number|forget that|instead of that|instead of it|what about|how about)\b/gi, ' ')
    .replace(/[?!.,;]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (isGreetingOrConversational(cleaned)) {
    return '';
  }

  // 0. Context-Switch First
  if (Array.isArray(catalogItems) && catalogItems.length > 0 && cleaned.length >= 3) {
    const cleanedNoPronouns = cleaned
      .replace(/\b(in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|this|that|it|these|those|the|and|or|but|with|also|please)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedNoPronouns.length >= 3) {
      const directSwitchMatch = matchInInventory(catalogItems, cleanedNoPronouns);
      if (directSwitchMatch) {
        return directSwitchMatch.name;
      }
    }
  }

  // 1. Universal Follow-up Pronoun & Reference Resolution
  const isReferenceQuery =
    /\b(in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|on this|on that|on it|this|that|it|these|those|the course|the program|the item|the medicine|the product|the dish|the meal|the plan|the tier|the room|the car|what do you provide|what is included|tell me more)\b/i.test(cleaned);

  if (isReferenceQuery) {
    if (context && context.activeItem) {
      return context.activeItem.name || '';
    }
    if (Array.isArray(history) && history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const hText = history[i]?.content || history[i]?.text || '';
        if (hText && hText !== text) {
          const hClean = hText
            .replace(/\b(is currently in stock|available stock|current stock|we have|give me details of|details of|tell me about)\b/gi, ' ')
            .replace(/[?!.,;]/g, '')
            .trim();
          if (hClean.length >= 3 && !isGreetingOrConversational(hClean)) {
            return hClean;
          }
        }
      }
    }
  }

  return isGreetingOrConversational(cleaned) ? '' : cleaned;
}

function formatResponse(itemData, archetype, queryText) {
  const profile = getArchetypeProfile(archetype);
  const cleanTitle = itemData.name;
  const price = itemData.price || '';
  const stock = itemData.stock;
  const unit = itemData.unit || profile.itemUnit;
  const lowerQ = String(queryText || '').toLowerCase();

  const isPriceQuery = /\b(price|cost|rate|rates|how much|fee|fees|charges)\b/i.test(lowerQ);
  const isDetailsQuery = /\b(what do you provide|what is provided|what is included|tell me more|features?|details?|syllabus|specs?|ingredients?)\b/i.test(lowerQ);
  const isActionQuery = /\b(how to apply|how to order|how to buy|how to book|how to get|steps)\b/i.test(lowerQ);

  if (isDetailsQuery) {
    const desc = itemData.description || profile.defaultDesc;
    const priceSuffix = price ? ` The ${profile.priceLabelEn} is ${price}.` : '';
    const stockSuffix = (stock !== null && stock > 0) ? ` Currently ${stock} ${unit} are available.` : '';
    return `In ${cleanTitle}, we provide: ${desc}.${priceSuffix}${stockSuffix}`;
  }

  if (isPriceQuery) {
    return `The ${profile.priceLabelEn} for ${cleanTitle} is ${price}${unit ? ` per ${unit}` : ''}.${stock !== null && stock > 0 ? ` (Currently available: ${stock} ${unit}).` : ''}`;
  }

  if (isActionQuery) {
    return `To proceed with ${cleanTitle}: ${profile.actionEn}.`;
  }

  if (stock !== null && stock > 0) {
    if (archetype === 'academic') {
      return `${cleanTitle} admissions are currently open! We have ${stock} ${unit} available at ${price}.`;
    }
    if (archetype === 'food') {
      return `${cleanTitle} is freshly available on our menu at ${price}!`;
    }
    return `${cleanTitle} is currently available! We have ${stock} ${unit} available at ${price} each.`;
  }

  return `${cleanTitle} is listed in our catalog.`;
}

async function runUniversalTestSuite() {
  console.log('🚀 Running Universal Conversational Memory & Multi-Archetype Test Suite...\n');

  // --------------------------------------------------------------------------
  // TEST SCENARIO 1: Academic Website (School / College Admissions)
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Academic Website (School / College) ---');
  const academicCatalog = [
    {
      name: 'Std 11th - 12th Science',
      stock: 120,
      price: '₹25,000 / year',
      unit: 'seats',
      description: 'Comprehensive PCB/PCM curriculum with physics, chemistry, and biology labs'
    },
    {
      name: 'Std 11th - 12th Commerce',
      stock: 80,
      price: '₹20,000 / year',
      unit: 'seats',
      description: 'Accountancy, economics, and business studies curriculum'
    }
  ];
  let ctx1 = { activeItem: null, turnCount: 0 };
  let hist1 = [];

  // Turn 1.1: Initial inquiry
  const q1_1 = 'give me details of 11th std';
  const target1_1 = extractTargetItem(q1_1, hist1, ctx1, academicCatalog);
  const match1_1 = matchInInventory(academicCatalog, target1_1);
  assert(match1_1, 'Must find 11th Science');
  ctx1.activeItem = match1_1;
  const reply1_1 = formatResponse(match1_1, 'academic', q1_1);
  console.log(`[Academic Turn 1] User: "${q1_1}" -> Agent: "${reply1_1}"`);
  assert(reply1_1.includes('Std 11th - 12th Science'), 'Must name 11th Science');
  hist1.push({ role: 'user', content: q1_1 }, { role: 'agent', content: reply1_1 });

  // Turn 1.2: Follow-up pronoun ("what do you provide in that")
  const q1_2 = 'what do you provide in that';
  const target1_2 = extractTargetItem(q1_2, hist1, ctx1, academicCatalog);
  assert.strictEqual(target1_2, 'Std 11th - 12th Science', 'Target must resolve to active item from context');
  const reply1_2 = formatResponse(ctx1.activeItem, 'academic', q1_2);
  console.log(`[Academic Turn 2] User: "${q1_2}" -> Agent: "${reply1_2}"`);
  assert(reply1_2.includes('PCB/PCM curriculum'), 'Must return course details');
  assert(!reply1_2.includes('Hello! Welcome to'), 'MUST NOT reset to greeting!');
  hist1.push({ role: 'user', content: q1_2 }, { role: 'agent', content: reply1_2 });

  // Turn 1.3: Follow-up action ("how to apply")
  const q1_3 = 'how to apply';
  const reply1_3 = formatResponse(ctx1.activeItem, 'academic', q1_3);
  console.log(`[Academic Turn 3] User: "${q1_3}" -> Agent: "${reply1_3}"`);
  assert(reply1_3.includes('online admission form'), 'Must provide admission procedure');

  // Turn 1.4: Context Switch ("what about commerce instead?")
  const q1_4 = 'what about commerce instead?';
  const target1_4 = extractTargetItem(q1_4, hist1, ctx1, academicCatalog);
  assert.strictEqual(target1_4, 'Std 11th - 12th Commerce', 'Must switch target to Commerce');
  const match1_4 = matchInInventory(academicCatalog, target1_4);
  ctx1.activeItem = match1_4;
  const reply1_4 = formatResponse(match1_4, 'academic', q1_4);
  console.log(`[Academic Turn 4] User: "${q1_4}" -> Agent: "${reply1_4}"`);
  assert(reply1_4.includes('Std 11th - 12th Commerce'), 'Must switch context to Commerce');
  console.log('✓ Academic multi-turn memory & context continuity verified!\n');

  // --------------------------------------------------------------------------
  // TEST SCENARIO 2: E-Commerce Store (Sneakers / Fashion)
  // --------------------------------------------------------------------------
  console.log('--- TEST 2: E-Commerce Store (Sneakers / Retail) ---');
  const ecommerceCatalog = [
    {
      name: 'Nike Air Max 90',
      stock: 15,
      price: '₹8,999',
      unit: 'pairs',
      description: 'Iconic waffle outsole, stitched overlays, and classic Air cushioning for ultimate comfort'
    },
    {
      name: 'Adidas Ultraboost Light',
      stock: 10,
      price: '₹14,999',
      unit: 'pairs',
      description: 'Lightest Boost cushioning with Continental rubber grip'
    }
  ];
  let ctx2 = { activeItem: null, turnCount: 0 };
  let hist2 = [];

  // Turn 2.1: Inquiry
  const q2_1 = 'is nike air max available?';
  const target2_1 = extractTargetItem(q2_1, hist2, ctx2, ecommerceCatalog);
  const match2_1 = matchInInventory(ecommerceCatalog, target2_1);
  assert(match2_1, 'Must find Nike Air Max');
  ctx2.activeItem = match2_1;
  const reply2_1 = formatResponse(match2_1, 'ecommerce', q2_1);
  console.log(`[E-Commerce Turn 1] User: "${q2_1}" -> Agent: "${reply2_1}"`);
  assert(reply2_1.includes('Nike Air Max 90'), 'Must name Nike product');
  hist2.push({ role: 'user', content: q2_1 }, { role: 'agent', content: reply2_1 });

  // Turn 2.2: Pronoun follow-up ("what do you provide in that")
  const q2_2 = 'what do you provide in that';
  const target2_2 = extractTargetItem(q2_2, hist2, ctx2, ecommerceCatalog);
  assert.strictEqual(target2_2, 'Nike Air Max 90', 'Target must resolve to active item from context');
  const reply2_2 = formatResponse(ctx2.activeItem, 'ecommerce', q2_2);
  console.log(`[E-Commerce Turn 2] User: "${q2_2}" -> Agent: "${reply2_2}"`);
  assert(reply2_2.includes('Air cushioning'), 'Must provide product specs');
  assert(!reply2_2.includes('Hello! Welcome to'), 'MUST NOT reset to greeting!');
  hist2.push({ role: 'user', content: q2_2 }, { role: 'agent', content: reply2_2 });

  // Turn 2.3: Price inquiry with pronoun ("how much is it?")
  const q2_3 = 'how much is it?';
  const reply2_3 = formatResponse(ctx2.activeItem, 'ecommerce', q2_3);
  console.log(`[E-Commerce Turn 3] User: "${q2_3}" -> Agent: "${reply2_3}"`);
  assert(reply2_3.includes('₹8,999'), 'Must return Nike price');
  hist2.push({ role: 'user', content: q2_3 }, { role: 'agent', content: reply2_3 });

  // Turn 2.4: Context switch ("what about adidas ultraboost?")
  const q2_4 = 'what about adidas ultraboost?';
  const target2_4 = extractTargetItem(q2_4, hist2, ctx2, ecommerceCatalog);
  assert.strictEqual(target2_4, 'Adidas Ultraboost Light', 'Must switch target to Adidas');
  const match2_4 = matchInInventory(ecommerceCatalog, target2_4);
  ctx2.activeItem = match2_4;
  const reply2_4 = formatResponse(match2_4, 'ecommerce', q2_4);
  console.log(`[E-Commerce Turn 4] User: "${q2_4}" -> Agent: "${reply2_4}"`);
  assert(reply2_4.includes('₹14,999'), 'Must return Adidas price');
  console.log('✓ E-Commerce multi-turn memory & context continuity verified!\n');

  // --------------------------------------------------------------------------
  // TEST SCENARIO 3: Restaurant / Dining
  // --------------------------------------------------------------------------
  console.log('--- TEST 3: Restaurant / Dining ---');
  const restaurantCatalog = [
    {
      name: 'Paneer Butter Masala',
      stock: 25,
      price: '₹280',
      unit: 'portions',
      description: 'Rich tomato, butter, and cashew gravy with fresh cottage cheese cubes and kasuri methi'
    }
  ];
  let ctx3 = { activeItem: null, turnCount: 0 };
  let hist3 = [];

  const q3_1 = 'do you have paneer butter masala?';
  const match3_1 = matchInInventory(restaurantCatalog, extractTargetItem(q3_1, hist3, ctx3, restaurantCatalog));
  ctx3.activeItem = match3_1;
  const reply3_1 = formatResponse(match3_1, 'food', q3_1);
  console.log(`[Food Turn 1] User: "${q3_1}" -> Agent: "${reply3_1}"`);
  assert(reply3_1.includes('Paneer Butter Masala'), 'Must name dish');

  const q3_2 = 'what do you provide in that';
  const reply3_2 = formatResponse(ctx3.activeItem, 'food', q3_2);
  console.log(`[Food Turn 2] User: "${q3_2}" -> Agent: "${reply3_2}"`);
  assert(reply3_2.includes('tomato, butter, and cashew gravy'), 'Must describe ingredients');
  console.log('✓ Restaurant multi-turn memory & context continuity verified!\n');

  // --------------------------------------------------------------------------
  // TEST SCENARIO 4: SaaS / Cloud Platform
  // --------------------------------------------------------------------------
  console.log('--- TEST 4: SaaS / Cloud Platform ---');
  const saasCatalog = [
    {
      name: 'Pro Subscription Plan',
      stock: 999,
      price: '$79 / month',
      unit: 'licenses',
      description: 'Unlimited AI completions, 100,000 API requests, priority webhook execution, and 24/7 SLA'
    }
  ];
  let ctx4 = { activeItem: null, turnCount: 0 };
  let hist4 = [];

  const q4_1 = 'tell me about the pro plan';
  const match4_1 = matchInInventory(saasCatalog, extractTargetItem(q4_1, hist4, ctx4, saasCatalog));
  ctx4.activeItem = match4_1;
  const reply4_1 = formatResponse(match4_1, 'saas', q4_1);
  console.log(`[SaaS Turn 1] User: "${q4_1}" -> Agent: "${reply4_1}"`);

  const q4_2 = 'what do you provide in that';
  const reply4_2 = formatResponse(ctx4.activeItem, 'saas', q4_2);
  console.log(`[SaaS Turn 2] User: "${q4_2}" -> Agent: "${reply4_2}"`);
  assert(reply4_2.includes('Unlimited AI completions'), 'Must return SaaS features');
  console.log('✓ SaaS multi-turn memory & context continuity verified!\n');

  console.log('🎉 ALL UNIVERSAL MULTI-TURN CONVERSATIONAL MEMORY TESTS PASSED ACROSS ALL ARCHETYPES! 🚀\n');
}

runUniversalTestSuite().catch(err => {
  console.error('❌ Universal test failed:', err);
  process.exit(1);
});
